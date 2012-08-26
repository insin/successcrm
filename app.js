var http = require('http')
  , path = require('path')

var express = require('express')
  , RedisStore = require('connect-redis')(express)
  , async = require('async')
  , moment = require('moment')
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
  app.use(express.cookieParser(settings.sessionSecret))
  app.use(express.session({
    store: new RedisStore({client: require('./redis/connection')})
  }))
  app.use(express.csrf())
  app.use(loadUser)
  app.use(requestContext)
  app.use(app.router)
})

app.configure('development', function() {
  app.use(express.errorHandler())
})

// RegExp validation of params - from http://expressjs.com/api.html#app.param
app.param(function(name, fn) {
  if (fn instanceof RegExp) {
    return function(req, res, next, val) {
      var captures
      if (captures = fn.exec(String(val))) {
        req.params[name] = captures
        next()
      }
      else {
        next('route')
      }
    }
  }
})

// Validate that :id parameters are numeric
app.param('id', /^\d+$/)

// ================================================================== Routes ===

app.get('/login', function(req, res, next) {
  //if (req.user.isAuthenticated) return res.redirect('/')
  var form = new forms.LoginForm({initial: {next: req.query.next || '/'}})
  res.render('login', {form: form})
})

app.post('/login', function(req, res, next) {
  var form = new forms.LoginForm({data: req.body})
  var redisplay = function() { res.render('login', {form: form}) }
  if (!form.isValid()) return redisplay()
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
  var now = moment()
    , nextWeek = now.clone().add('days', 7).endOf('day')
  redis.tasks.getByDateRange(0, nextWeek.valueOf(), {assignedTo: req.user.id}, function(err, tasks) {
    if (err) return next(err)
    var overdue = tasks
      , upcoming = []
    for (var i = 0, l = tasks.length; i < l; i++) {
      if (tasks[i].due.valueOf() > now.valueOf()) {
        overdue = tasks.slice(0, i)
        upcoming = tasks.slice(i)
        break
      }
    }
    res.render('dashboard', {
      overdue: overdue
    , upcoming: upcoming
    })
  })
})

app.get('/contacts', function(req, res, next) {
  redis.contacts.get({fetchRelated: redis.contacts.RELATED_PARTIAL}, function(err, contacts) {
    if (err) return next(err)
    res.render('find_contacts', {contacts: contacts})
  })
})

app.get('/contacts/list', function(req, res, next) {
  res.render('list_contacts')
})

app.get('/contact/:id', function(req, res, next) {
  redis.contacts.byId(req.params.id, {fetchRelated: redis.contacts.RELATED_PARTIAL}, function(err, contact) {
    if (err) return next(err)
    if (!contact) return res.send(404)
    redis.tasks.get({contact: contact.id}, function(err, tasks) {
      res.render(contact.type, {
        contact: contact
      , tasks: tasks
      // TODO Retrieve updates once implemented
      , updates: []
      })
    })
  })
})

app.get('/contacts/add_person', function(req, res, next) {
  var personForm = new forms.PersonForm({prefix: 'person'})
    , phoneNumberFormSet = new forms.PhoneNumberFormSet({prefix: 'phone'})
    , emailAddressFormSet = new forms.EmailAddressFormSet({prefix: 'email'})
    , addressFormSet = new forms.AddressFormSet({prefix: 'address'})

  res.render('add_person', {
    personForm: personForm
  , addressFormSet: addressFormSet
  , phoneNumberFormSet: phoneNumberFormSet
  , emailAddressFormSet: emailAddressFormSet
  })
})

app.post('/contacts/add_person', function(req, res, next) {
  var personForm = new forms.PersonForm({prefix: 'person', data: req.body})
    , phoneNumberFormSet = new forms.PhoneNumberFormSet({prefix: 'phone', data: req.body})
    , emailAddressFormSet = new forms.EmailAddressFormSet({prefix: 'email', data: req.body})
    , addressFormSet = new forms.AddressFormSet({prefix: 'address', data: req.body})

  // Redisplay if any of the forms are invalid
  if (!allValid([personForm, addressFormSet,
                 phoneNumberFormSet, emailAddressFormSet])) {
    return res.render('add_person', {
      personForm: personForm
    , addressFormSet: addressFormSet
    , phoneNumberFormSet: phoneNumberFormSet
    , emailAddressFormSet: emailAddressFormSet
    })
  }

  var person = {
    title: personForm.cleanedData.title
  , firstName: personForm.cleanedData.firstName
  , lastName: personForm.cleanedData.lastName
  , jobTitle: personForm.cleanedData.jobTitle
  , backgroundInfo: ''
  , organisation: personForm.cleanedData.organisation
  , emailAddresses: emailAddressFormSet.cleanedData()
  , phoneNumbers: phoneNumberFormSet.cleanedData()
  , addresses: addressFormSet.cleanedData()
  }

  redis.contacts.storePerson(person, function(err, id) {
    if (err) return next(err)
    res.redirect('/contact/' + id)
  })
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
function addPersonInline(organisationId, cleanedData, cb) {
  var person = {
    title: ''
  , firstName: cleanedData.firstName
  , lastName: cleanedData.lastName
  , jobTitle: cleanedData.jobTitle
  , backgroundInfo: ''
  , organisation: organisationId
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

  // Redisplay if any of the forms are invalid
  if (!allValid([organisationForm, peopleFormSet, addressFormSet,
                 phoneNumberFormSet, emailAddressFormSet])) {
    return res.render('add_organisation', {
      organisationForm: organisationForm
    , peopleFormSet: peopleFormSet
    , addressFormSet: addressFormSet
    , phoneNumberFormSet: phoneNumberFormSet
    , emailAddressFormSet: emailAddressFormSet
    })
  }

  var organisation = {
    name: organisationForm.cleanedData.name
  , backgroundInfo: ''
  , phoneNumbers: phoneNumberFormSet.cleanedData()
  , emailAddresses: emailAddressFormSet.cleanedData()
  , addresses: addressFormSet.cleanedData()
  }

  redis.contacts.storeOrganisation(organisation, function(err, id) {
    if (err) return next(err)
    var redirect = function() { res.redirect('/contact/' + id) }
    var peopleData = peopleFormSet.cleanedData()
    if (!peopleData.length) return redirect()
    var addPerson = addPersonInline.bind(null, id)
    async.forEachSeries(peopleData, addPerson, function(err) {
      if (err) return next(err)
      redirect()
    })
  })
})

app.get('/calendar', function(req, res, next) {
  res.render('calendar')
})

app.get('/tasks', function(req, res, next) {
  async.parallel(
    { users      : redis.users.choices.bind(null, {user: req.user, emptyChoice: 'Anyone'})
    , categories : redis.categories.choices.bind(null, {emptyChoice: 'All'})
    }
  , function(err, kwargs) {
      if (err) return next(err)
      kwargs.data = req.query
      var filterForm = new forms.TaskFilterForm(kwargs)
      var filters = (filterForm.isValid() ? filterForm.cleanedData : {})
      redis.tasks.get(filters, function(err, tasks) {
        if (err) return next(err)
        res.render('tasks_list', {
          tasks: tasks
        , filterForm: filterForm
        , filters: filters
        })
      })
    }
  )
})

app.get('/tasks/add', function(req, res, next) {
  async.parallel(
    { categories : redis.categories.choices
    , users      : redis.users.choices.bind(null, {user: req.user})
    }
  , function(err, kwargs) {
      if (err) return next(err)
      var contextForm = new forms.TaskContextForm({data: req.query})
        , context = contextForm.isValid() ? contextForm.cleanedData : {}
      var form = new forms.TaskForm(kwargs)
      res.render('add_task', {
        form: form, context: context, contextForm: contextForm
      })
    }
  )
})

app.post('/tasks/add', function(req, res, next) {
  async.parallel(
    { categories : redis.categories.choices
    , users      : redis.users.choices.bind(null, {user: req.user})
    }
  , function(err, kwargs) {
      if (err) return next(err)
      kwargs.data = req.body
      var contextForm = new forms.TaskContextForm({data: req.body})
        , context = contextForm.isValid() ? contextForm.cleanedData : {}
      var form = new forms.TaskForm(kwargs)
      var redisplay = function() {
        res.render('add_task', {
          form: form, context: context, contextForm: contextForm
        })
      }
      if (!form.isValid()) return redisplay()
      var redirect = (context.contact
                      ? '/contact/' + context.contact
                      : context.next || '/tasks')
      if (context.contact) {
        form.cleanedData.contact = context.contact
      }
      redis.tasks.store(form.cleanedData, function(err, task) {
        if (err) return next(err)
        res.redirect(redirect)
      })
    }
  )
})

app.get('/tasks/categories', function(req, res, next) {
  redis.categories.get(function(err, categories) {
    if (err) return next(err)
    res.render('categories', {categories: categories})
  })
})

app.get('/tasks/add_category', function(req, res, next) {
  var form = new forms.CategoryForm()
  res.render('add_category', {form: form})
})

app.post('/tasks/add_category', function(req, res, next) {
  var form = new forms.CategoryForm({data: req.body})
  var redisplay = function() { res.render('add_category', {form: form}) }
  if (!form.isValid()) return redisplay()
  redis.categories.byName(form.cleanedData.name, function(err, category) {
    if (err) return next(err)
    if (category) {
      form.addError('name', 'A category with this name already exists.')
      return redisplay()
    }
    redis.categories.store(form.cleanedData, function(err, category) {
      if (err) return next(err)
      res.redirect('/tasks/categories')
    })
  })
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
  if (!form.isValid()) return redisplay()
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
})

http.createServer(app).listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
})
