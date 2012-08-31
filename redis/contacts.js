var async = require('async')
  , object = require('isomorph/object')

var $r = require('./connection')

// Constants
var RELATED_FULL = 'full'
  , RELATED_PARTIAL = 'partial'
  , TYPE_PERSON = 'person'
  , TYPE_ORGANISATION = 'organisation'

module.exports = {
  byId: byId
, storePerson: storePerson
, storeOrganisation: storeOrganisation
, saveBackgroundInfo: saveBackgroundInfo
, get: get
, RELATED_FULL: RELATED_FULL
, RELATED_PARTIAL: RELATED_PARTIAL
, TYPE_PERSON: TYPE_PERSON
, TYPE_ORGANISATION: TYPE_ORGANISATION
}

// Redis keys
var CONTACT = 'contact:#'
  , CONTACTS = 'contacts'
  , PEOPLE = 'contacts:people'
  , ORGANISATIONS = 'contacts:orgs'
  , ORG_TO_PEOPLE = 'org.to.people:#'
  , NEXT_ID = 'contacts:nextid'

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
    person = prepareForStorage(person)
    var multi = $r.multi()
    multi.hmset(CONTACT + id, person)
    if (person.organisation) {
      multi.sadd(ORG_TO_PEOPLE + person.organisation, id)
    }
    multi.rpush(CONTACTS, id)
    multi.rpush(PEOPLE, id)
    multi.exec(function(err) {
      if (err) return cb(err)
      cb(null, asContact(person))
    })
  })
}

function storeOrganisation(organisation, cb) {
  $r.incr(NEXT_ID, function(err, id) {
    organisation.id = id
    organisation.type = TYPE_ORGANISATION
    organisation = prepareForStorage(organisation)
    var multi = $r.multi()
    multi.hmset(CONTACT + id, organisation)
    multi.rpush(CONTACTS, id)
    multi.rpush(ORGANISATIONS, id)
    multi.exec(function(err) {
      if (err) return cb(err)
      cb(null, asContact(organisation))
    })
  })
}

function saveBackgroundInfo(contact, backgroundInfo, cb) {
  $r.hset(CONTACT + contact.id, 'backgroundInfo', backgroundInfo, cb)
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
    contact = asContact(contact)
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
 * Determines which key to look under for contact ids.
 * @param type a contact type.
 */
function lookupKey(type) {
  if (type === TYPE_PERSON) return PEOPLE
  if (type === TYPE_ORGANISATION) return ORGANISATIONS
  return CONTACTS
}

function get(options, cb) {
  var defaultOptions = {start: 0, count: 30, fetchRelated: false, type: null}
  if (typeof options == 'function') {
    cb = options
    options = defaultOptions
  }
  else {
    options = object.extend(defaultOptions, options)
  }

  var key = lookupKey(options.type)
    , start = options.start
    , stop = options.start + (options.count - 1)
  $r.lrange(key, start, stop, function(err, ids) {
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

// ----------------------------------------------- Prototypes & Constructors ---

var contactProto = {
  isPerson: function() {
    return (this.type == TYPE_PERSON)
  }

, isOrganisation: function() {
    return (this.type == TYPE_ORGANISATION)
  }

, shortAddress:function() {
    if (!this.addresses.length) return ''
    var a = this.addresses[0]
    return [a.address, a.city, a.county, a.postCode].filter(truthy).join(', ')
  }

, primaryEmail: function() {
    if (!this.emailAddresses.length) return null
    return this.emailAddresses[0]
  }

, primaryPhone: function() {
    if (!this.phoneNumbers.length) return null
    return this.phoneNumbers[0]
  }
}

var personProto = {
  __proto__: contactProto

, fullName: function() {
    return [this.firstName, this.lastName].filter(truthy).join(' ')
  }

, toString: function() {
    return this.fullName()
  }
}

var organisationProto = {
  __proto__: contactProto

, toString: function() {
    return this.name
  }
}

function asContact(contact) {
  contact.phoneNumbers = JSON.parse(contact.phoneNumbers)
  contact.emailAddresses = JSON.parse(contact.emailAddresses)
  contact.addresses = JSON.parse(contact.addresses)
  return (contact.type == TYPE_PERSON
          ? asPerson(contact)
          : asOrganisation(contact))
}

function asPerson(person) {
  person.__proto__ = personProto
  return person
}

function asOrganisation(organisation) {
  // Relationships with people are stored seprately - this Array is initialised
  // to hold details of any people who are fetched later.
  organisation.people = []
  organisation.__proto__ = organisationProto
  return organisation
}

function prepareForStorage(contact) {
  // Work on a shallow copy
  contact = object.extend({}, contact)
  // JSON encode contact arrays
  contact.phoneNumbers = JSON.stringify(contact.phoneNumbers || [])
  contact.emailAddresses = JSON.stringify(contact.emailAddresses || [])
  contact.addresses = JSON.stringify(contact.addresses || [])
  return contact
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
          person = asContact(person)
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
      contact.organisation = asContact(organisation)
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
        multi.hmget(CONTACT + id, 'id', 'firstName', 'lastName', 'jobTitle')
      })
      multi.exec(function(err, people) {
        if (err) return cb(err)
        people.forEach(function(person) {
          contact.people.push({
            id: person[0]
          , name: [person[1], person[2]].filter(truthy).join(' ')
          , jobTitle: person[3]
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
