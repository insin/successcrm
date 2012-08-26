var async = require('async')
  , moment = require('moment')
  , object = require('isomorph/object')

var $r = require('./connection')
  , users = require('./users')
  , categories = require('./categories.js')
  , contacts = require('./contacts')

module.exports = {
  store: store
, byId: byId
, get: get
, getByDateRange: getByDateRange
}

var TASK = 'task:#'
  , TASKS = 'tasks:cron'
  , NEXT_ID = 'tasks:nextid'
  , USER_TASKS = 'tasks:user:#'
  , CATEGORY_TASKS = 'tasks:cat:#'
  , USER_TASKS_BY_CATEGORY = function(user, category) {
      return (USER_TASKS + user + ':cat:#' + category)
    }
  , CONTACT_TASKS = 'tasks:contact:#'

function byId(id, cb) {
  $r.hgetall(TASK + id, function(err, task) {
    if (err) return cb(err)
    fetchRelated(asTask(task), cb)
  })
}

/**
 * Stores a new task.
 */
function store(task, cb) {
  $r.incr(NEXT_ID, function(err, id) {
    if (err) return cb(err)
    task.id = id
    task = prepareForStorage(task)
    var due = task.due = task.due.valueOf()
    var multi = $r.multi()
    multi.hmset(TASK + id, task)
    multi.zadd(TASKS, due, id)
    multi.zadd(USER_TASKS + task.assignedTo, due, id)
    if (task.category) {
      multi.zadd(CATEGORY_TASKS + task.category, due, id)
      multi.zadd(USER_TASKS_BY_CATEGORY(task.assignedTo, task.category), due, id)
    }
    if (task.contact) {
      multi.zadd(CONTACT_TASKS + task.contact, due, id)
    }
    multi.exec(function(err) {
      if (err) return cb(err)
      cb(null, asTask(task))
    })
  })
}

/**
 * Gets incomplete tasks.
 */
function get(options, cb) {
  getTasks('zrange', 0, -1, options, cb)
}

/**
 * Gets incomplete tasks due between two points in time (ms since unix epoch).
 */
function getByDateRange(start, stop, options, cb) {
  getTasks('zrangebyscore', start, stop, options, cb)
}

// ---------------------------------------------------------- Retrieval Impl ---

/**
 * Determines which key to look under for task ids.
 * @param user a user id.
 * @param category a category id.
 */
function lookupKey(user, category, contact) {
  if (contact) return CONTACT_TASKS + contact
  if (category && user) return USER_TASKS_BY_CATEGORY(user, category)
  if (category) return CATEGORY_TASKS + category
  if (user) return USER_TASKS + user
  return TASKS
}

/**
 * Looks up task ids and fetches tasks.
 * @param command the Redis command to use for id lookup.
 * @param start value for the lookup.
 * @param end value for the lookup.
 * @param options lookup options.
 * @param options.user id of a user to restrict lookup to.
 * @param options.category id of a category to restrict lookup to.
 * @param cb callback function
 */
function getTasks(command, start, stop, options, cb) {
  var defaultOptions = {assignedTo: null, category: null, contact: null}
  if (typeof options == 'function') {
    cb = options
    options = defaultOptions
  }
  else {
    options = object.extend(defaultOptions, options)
  }

  var key = lookupKey(options.assignedTo, options.category, options.contact)

  $r[command](key, start, stop, function(err, ids) {
    if (err) return cb(err)
    var multi = $r.multi()
    ids.forEach(function(id) { multi.hgetall(TASK + id) })
    multi.exec(function(err, tasks) {
      if (err) return cb(err)
      async.map(tasks
      , function(task, cb) { fetchRelated(asTask(task), cb) }
      , function(err, tasks) {
          if (err) return cb(err)
          cb(null, tasks)
        }
      )
    })
  })
}

// ------------------------------------------------- Prototype & Constructor ---

var taskProto = {
  isOverdue: function() {
    return (this.due.valueOf() < moment().valueOf())
  }
}

function asTask(task) {
  task.due = moment(+task.due)
  // If a time was set, it's also represented in the due date
  task.time = (task.time == 'true' ? task.due.clone() : null)
  task.__proto__ = taskProto
  return task
}

function fetchRelated(task, cb) {
  var lookups = {
    assignedTo: users.byId.bind(null, task.assignedTo)
  }
  if (task.category) {
    lookups.category = categories.byId.bind(null, task.category)
  }
  if (task.contact) {
    lookups.contact = contacts.byId.bind(null, task.contact)
  }
  async.parallel(lookups, function(err, related) {
    if (err) return cb(err)
    cb(null, object.extend(task, related))
  })
}

function prepareForStorage(task) {
  // Work on a shallow copy
  task = object.extend({}, task)
  // If a due time is specified, incorporate it into the due date and set a flag
  // to indicate whether or not the time was set.
  if (task.time) {
    task.due.setHours(task.time.getHours())
    task.due.setMinutes(task.time.getMinutes())
    task.time = true
  }
  else {
    task.time = false
  }
  return task
}