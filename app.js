var http = require('http')
  , path = require('path')

var express = require('express')
  , allValid = require('newforms').allValid
  , extend = require('isomorph/object').extend

var settings = require('./settings')
  , forms = require('./forms')
  , redis = require('./redis')

var app = express()

// ========================================================== Express Config ===

/**
 * Middleware which loads user details when the current user is authenticated.
 */
function loadUser(req, res, next) {
  if (req.session.userId) {
    redis.users.byId(req.session.userId, function(err, user) {
      if (err) return next(err)
      req.user = extend(user, {
        isAuthenticated: true
      , isAnonymous: false
      })
      next()
    })
  }
  else {
    req.user = {
      isAuthenticated: false
    , isAnonymous: true
    , isAdmin: false
    }
    next()
  }
}

/**
 * Middleware which adds request-specific context to template locals.
 */
function requestContext(req, res, next) {
  res.locals.user = req.user
  res.locals.csrfToken = req.session._csrf
  next()
}

app.configure(function() {
  // Config
  app.set('port', settings.port)
  app.set('views', __dirname + '/views')
  app.set('view engine', 'jade')
  app.locals.pretty = true
  app.locals.APP_NAME = settings.appName
  app.locals.APP_VERSION = require('./package.json').version
  // Middleware
  app.use(express.favicon())
  app.use(express.static(path.join(__dirname, 'static')))
  app.use(express.logger('dev'))
  app.use(express.bodyParser())
  app.use(express.methodOverride())
  app.use(express.cookieParser(settings.cookieSecret))
  app.use(express.session())
  app.use(express.csrf())
  app.use(loadUser)
  app.use(requestContext)
  app.use(app.router)
})

app.configure('development', function() {
  app.use(express.errorHandler())
})

// ================================================================== Routes ===

app.get('/login', function(req, res, next) {
  //if (req.user.isAuthenticated) return res.redirect('/')
  var form = new forms.LoginForm({initial: {next: req.query.next || '/'}})
  res.render('login', {form: form})
})

app.post('/login', function(req, res, next) {
  var form = new forms.LoginForm({data: req.body})
  var redisplay = function() { res.render('login', {form: form}) }
  if (form.isValid()) {
    var username = form.cleanedData.username
      , password = form.cleanedData.password
    redis.users.validateCredentials(username, password, function(err, user) {
      if (err) return next(err)
      if (user === false) {
        form.addFormError('Invalid login credentials.')
        return redisplay()
      }
      req.session.userId = user.id
      res.redirect(form.cleanedData.next)
    })
  }
  else {
    redisplay()
  }
})

/**
 * Redirects the user to the login screen if they're not authenticated.
 */
function requireAuthentication(req, res, next) {
  if (!req.user.isAuthenticated) {
    return res.redirect('/login?next=' + encodeURIComponent(req.url))
  }
  next()
}

// Authentication is required for all further routes
app.all('*', requireAuthentication)

app.get('/', function(req, res, next) {
  res.render('dashboard')
})

app.get('/contacts/add_organisation', function(req, res, next) {
  var organisationForm = new forms.OrganisationForm({prefix: 'org'})
    , peopleFormSet = new forms.InlinePersonFormSet({prefix: 'people'})
    , phoneNumberFormSet = new forms.PhoneNumberFormSet({prefix: 'phone'})
    , emailAddressFormSet = new forms.EmailAddressFormSet({prefix: 'email'})
    , addressFormSet = new forms.AddressFormSet({prefix: 'address'})

  res.render('add_organisation', {
    organisationForm: organisationForm
  , peopleFormSet: peopleFormSet
  , addressFormSet: addressFormSet
  , phoneNumberFormSet: phoneNumberFormSet
  , emailAddressFormSet: emailAddressFormSet
  })
})

/**
 * Adds a person whose details were defined inline as part of adding an
 * organisation.
 * @param organisation the newly-created organisation (with a generated id)
 * @param cleanedData cleaned data from an InlinePersonForm
 * @param cb callback to indicate completion and error/success status.
 */
function addPersonInline(organisation, cleanedData, cb) {
  var person = {
    title: ''
  , firstName: cleanedData.firstName
  , lastName: cleanedData.lastName
  , jobTitle: cleanedData.jobTitle
  , backgroundInfo: ''
  , organisation: organisation
  , emailAddresses: []
  , phoneNumbers: []
  , addresses: []
  }
  if (cleanedData.email) {
    person.emailAddresses.push({email: cleanedData.email, type: ''})
  }
  if (cleanedData.mobilePhone) {
    person.phoneNumbers.push({number: cleanedData.mobilePhone, type: 'Mobile'})
  }
  if (cleanedData.directPhone) {
    person.phoneNumbers.push({number: cleanedData.directPhone, type: 'Direct'})
  }
  redis.contacts.storePerson(person, cb)
}

app.post('/contacts/add_organisation', function(req, res, next) {
  var organisationForm = new forms.OrganisationForm({prefix: 'org', data: req.body})
    , peopleFormSet = new forms.InlinePersonFormSet({prefix: 'people', data: req.body})
    , phoneNumberFormSet = new forms.PhoneNumberFormSet({prefix: 'phone', data: req.body})
    , emailAddressFormSet = new forms.EmailAddressFormSet({prefix: 'email', data: req.body})
    , addressFormSet = new forms.AddressFormSet({prefix: 'address', data: req.body})

  if (allValid(organisationForm, peopleFormSet,
               addressFormSet, phoneNumberFormSet, emailAddressFormSet)) {
    var organisation = {
      name: organisationForm.cleanedData.name
    , backgroundInfo: ''
    , phoneNumbers: peopleFormSet.cleanedData()
    , emailAddresses: emailAddressFormSet.cleanedData()
    , addresses: addressFormSet.cleanedData()
    }

    redis.contacts.storeOrganisation(organisation, function(err, organisation) {
      if (err) return next(err)
      var redirect = function() { res.redirect('/contacts/' + organisation.id) }
      var peopleData = peopleFormSet.cleanedData()
      if (!peopleData.length) return redirect()
      var addPerson = addPersonInline.bind(null, organisation)
      async.forEach(peopleData, addPerson, function(err) {
        if (err) return next(err)
        redirect()
      })
    })
  }
  else {
    res.render('add_organisation', {
      organisationForm: organisationForm
    , peopleFormSet: peopleFormSet
    , addressFormSet: addressFormSet
    , phoneNumberFormSet: phoneNumberFormSet
    , emailAddressFormSet: emailAddressFormSet
    })
  }
})

/**
 * Asserts that the current user is an admin.
 */
function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) return res.send(401)
  next()
}

app.all('*', requireAdmin)

app.get('/admin', function(req, res, next) {
  res.render('admin')
})

app.get('/admin/users', function(req, res, next) {
  redis.users.get(function(err, users) {
    if (err) return next(err)
    res.render('users', {users: users})
  })
})

app.get('/admin/add_user', function(req, res, next) {
  var form = new forms.UserForm()
  res.render('add_user', {form: form})
})

app.post('/admin/add_user', function(req, res, next) {
  var form = new forms.UserForm({data: req.body})
  var redisplay = function() { res.render('add_user', {form: form}) }
  if (form.isValid()) {
    redis.users.byUsername(form.cleanedData.username, function(err, user) {
      if (err) return next(err)
      if (user) {
        form.addError('username', 'This username is already taken.')
        return redisplay()
      }
      redis.users.store(form.cleanedData, function(err, user, password) {
        if (err) return next(err)
        // TODO Email user details
        console.log("Psst! %s's password is %s!", user.username, password)
        res.redirect('/admin/users')
      })
    })
  }
  else {
    redisplay()
  }
})

http.createServer(app).listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
})
