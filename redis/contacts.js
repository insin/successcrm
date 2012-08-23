var async = require('async')
  , object = require('isomorph/object')

var $r = require('./connection')

module.exports = {
  byId: byId
, storePerson: storePerson
, storeOrganisation: storeOrganisation
, get: get
, RELATED_FULL: RELATED_FULL
, RELATED_PARTIAL: RELATED_PARTIAL
}

// Redis keys
var CONTACT = 'contact:#'
  , CONTACTS = 'contacts'
  , PEOPLE = 'contacts:people'
  , ORGANISATIONS = 'contacts:orgs'
  , ORG_TO_PEOPLE = 'org.to.people:#'
  , NEXT_ID = 'contacts:nextid'

// Constants
var RELATED_FULL = 'full'
  , RELATED_PARTIAL = 'partial'
  , TYPE_PERSON = 'person'
  , TYPE_ORGANISATION = 'organisation'

/**
 * Returns true for values which are truthy.
 */
function truthy(value) {
  return !!value
}

function storePerson(person, cb) {
  $r.incr(NEXT_ID, function(err, id) {
    person.id = id
    person.type = TYPE_PERSON
    Contact.stringifyProps(person)
    var multi = $r.multi()
    multi.hmset(CONTACT + id, person)
    if (person.organisation) {
      multi.sadd(ORG_TO_PEOPLE + person.organisation, id)
    }
    multi.rpush(CONTACTS, id)
    multi.rpush(PEOPLE, id)
    multi.exec(function(err) {
      if (err) return cb(err)
      cb(null, id)
    })
  })
}

function storeOrganisation(organisation, cb) {
  $r.incr(NEXT_ID, function(err, id) {
    organisation.id = id
    organisation.type = TYPE_ORGANISATION
    Contact.stringifyProps(organisation)
    var multi = $r.multi()
    multi.hmset(CONTACT + id, organisation)
    multi.rpush(CONTACTS, id)
    multi.rpush(ORGANISATIONS, id)
    multi.exec(function(err) {
      if (err) return cb(err)
      cb(null, id)
    })
  })
}

function byId(id, options, cb) {
  var defaultOptions = {fetchRelated: false}
  if (typeof options == 'function') {
    cb = options
    options = defaultOptions
  }
  else {
    options = object.extend(defaultOptions, options)
  }

  $r.hgetall(CONTACT + id, function(err, contact) {
    if (err) return cb(err)
    if (!contact) return cb(null, null)
    contact = Contact.fromObject(contact)
    if (options.fetchRelated === false) return cb(null, contact)
    if (options.fetchRelated == RELATED_FULL) {
      fetchFullRelated(contact, cb)
    }
    else {
      fetchPartialRelated(contact, cb)
    }
  })
}

/**
 * Fetches all data for related entities.
 */
function fetchFullRelated(contact, cb) {
  if (contact.type == TYPE_ORGANISATION) {
    $r.smembers(ORG_TO_PEOPLE + contact.id, function(err, ids) {
      if (err) return cb(err)
      var multi = $r.multi()
      ids.forEach(function(id) { multi.hgetall(CONTACT + id) })
      multi.exec(function(err, people) {
        if (err) return cb(err)
        people.forEach(function(person) {
          person = Contact.fromObject(person)
          person.organisation = contact
          contact.people.push(person)
        })
        cb(null, contact)
      })
    })
  }
  else if (contact.type == TYPE_PERSON) {
    if (!contact.organisation) return cb(null, contact)
    $r.hgetall(CONTACT + contact.organisation, function(err, organisation) {
      if (err) return cb(err)
      contact.organisation = Contact.fromObject(organisation)
      cb(null, contact)
    })
  }
  else {
    cb(new Error('Unknown contact type: ' + contact.type))
  }
}

/**
 * Fetches enough data about related entities to link to them.
 */
function fetchPartialRelated(contact, cb) {
  if (contact.type == TYPE_ORGANISATION) {
    $r.smembers(ORG_TO_PEOPLE + contact.id, function(err, ids) {
      if (err) return cb(err)
      var multi = $r.multi()
      ids.forEach(function(id) {
        multi.hmget(CONTACT + id, 'id', 'firstName', 'lastName')
      })
      multi.exec(function(err, people) {
        if (err) return cb(err)
        people.forEach(function(person) {
          contact.people.push({
            id: person[0]
          , name: person.slice(1).filter(truthy).join(' ')
          })
        })
        cb(null, contact)
      })
    })
  }
  else if (contact.type == TYPE_PERSON) {
    if (!contact.organisation) return cb(null, contact)
    $r.hmget(CONTACT + contact.organisation, 'id', 'name', function(err, organisation) {
      if (err) return cb(err)
      contact.organisation = {id: organisation[0], name: organisation[1]}
      cb(null, contact)
    })
  }
  else {
    cb(new Error('Unknown contact type: ' + contact.type))
  }
}

function get(options, cb) {
  var defaultOptions = {start: 0, count: 30, fetchRelated: false}
  if (typeof options == 'function') {
    cb = options
    options = defaultOptions
  }
  else {
    options = object.extend(defaultOptions, options)
  }

  var start = options.start
    , stop = options.start + (options.count - 1)
  $r.lrange(CONTACTS, start, stop, function(err, ids) {
    if (err) return cb(err)
    async.map(ids
    , function(id, cb) {
        byId(id, {fetchRelated: options.fetchRelated}, cb)
      }
    , function(err, contacts) {
        if (err) return cb(err)
        cb(null, contacts)
      }
    )
  })
}

// ---------------------------------------------------- Contact Constructors ---

/**
 * Initialises common Contact details from a stored Object.
 */
function Contact(obj) {
  this.id = obj.id
  this.type = obj.type
  this.backgroundInfo = obj.backgroundInfo
  // These properties are stored a stringified JSON Arrays
  this.phoneNumbers = JSON.parse(obj.phoneNumbers)
  this.emailAddresses = JSON.parse(obj.emailAddresses)
  this.addresses = JSON.parse(obj.addresses)
}

/**
 * Creates a Contact of the appropriate type from a storage Object.
 */
Contact.fromObject = function(obj) {
  return (obj.type == TYPE_PERSON ? new Person(obj) : new Organisation(obj))
}

/**
 * Stringifies any properties which should be stringified prior to being stored.
 */
Contact.stringifyProps = function(obj) {
  obj.phoneNumbers = JSON.stringify(obj.phoneNumbers)
  obj.emailAddresses = JSON.stringify(obj.emailAddresses)
  obj.addresses = JSON.stringify(obj.addresses)
}

Contact.prototype.isPerson = function() {
  return (this instanceof Person)
}

Contact.prototype.isOrganisation = function() {
  return (this instanceof Organisation)
}

Contact.prototype.shortAddress = function() {
  if (!this.addresses.length) return ''
  var a = this.addresses[0]
  return [a.address, a.city, a.county, a.postCode].filter(truthy).join(', ')
}

Contact.prototype.primaryEmail = function() {
  if (!this.emailAddresses.length) return null
  return this.emailAddresses[0]
}

Contact.prototype.primaryPhone = function() {
  if (!this.phoneNumbers.length) return null
  return this.phoneNumbers[0]
}

/**
 * Initialises Person details from a stored Object.
 */
function Person(obj) {
  this.title = obj.title
  this.firstName = obj.firstName
  this.lastName = obj.lastName
  this.jobTitle = obj.jobTitle
  // Only the id of any related organistion is stored - this will be overwritten
  // with an Object or Organisation if more details are fetched later.
  this.organisation = obj.organisation
  Contact.call(this, obj)
}
object.inherits(Person, Contact)

Person.prototype.fullName = function() {
  return [this.firstName, this.lastName].filter(truthy).join(' ')
}

/**
 * Initialises Organisation details from a stored Object.
 */
function Organisation(obj) {
  this.name = obj.name
  // Relationships with people are stored seprately - this Array is initialised
  // to hold details of any people who are fetched later.
  this.people = []
  Contact.call(this, obj)
}
object.inherits(Organisation, Contact)
