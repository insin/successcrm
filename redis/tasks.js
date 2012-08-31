var async = require('async')
  , _ = require('underscore')

var $r = require('./connection')
  , util = require('./util')
  , users = require('./users')
  , categories = require('./categories.js')
  , contacts = require('./contacts')

module.exports = {
  store: store
, update: update
, del: del
, complete: complete
, reopen: reopen
, byId: byId
, get: get
, getByDateRange: getByDateRange
}

// Redis keys
var TASK = 'task:#'
  , TASKS = 'tasks:cron'
  , NEXT_ID = 'tasks:nextid'
  , USER_TASKS = 'tasks:user:#'
  , CATEGORY_TASKS = 'tasks:cat:#'
  , USER_TASKS_BY_CATEGORY = function(user, category) {
      return (USER_TASKS + user + ':cat:#' + category)
    }
  , CONTACT_TASKS = 'tasks:contact:#'

/**
 * Determines which sorted sets need to be added to for the given task.
 */
function sortedSetKeys(task) {
  var assignedTo = util.rel(task.assignedTo)
    , category = util.rel(task.category)
    , contact = util.rel(task.contact)
    , keys = []
  keys.push(TASKS)
  // Tasks are always assigned
  keys.push(USER_TASKS + assignedTo)
  // Category is optional
  if (category) {
    keys.push(CATEGORY_TASKS + category)
    keys.push(USER_TASKS_BY_CATEGORY(assignedTo, category))
  }
  // Tasks don't have to be for a contact
  if (contact) {
    keys.push(CONTACT_TASKS + contact)
  }
  return keys
}

/**
 * Calculates the sorted set score for the given task.
 */
function sortedSetScore(task) {
  return util.timestamp(task.due)
}

// --------------------------------------------------------------------- Add ---

/**
 * Queues commands to add to sorted sets for the given task.
 */
function addToSortedSets(task, multi) {
  var score = sortedSetScore(task)
  sortedSetKeys(task).forEach(function(key) {
    multi.zadd(key, score, task.id)
  })
}

/**
 * Stores a new task.
 */
function store(task, cb) {
  $r.incr(NEXT_ID, function(err, id) {
    if (err) return cb(err)
    task.id = id
    var redisTask = toRedis(task)
    var multi = $r.multi()
    multi.hmset(TASK + id, redisTask)
    addToSortedSets(redisTask, multi)
    multi.exec(function(err) {
      if (err) return cb(err)
      cb(null, asTask(redisTask))
    })
  })
}

// ------------------------------------------------------------------ Update ---

/**
 * Queues commands to add and remove from sorted sets as necessary as the
 * result of having applied the given changes to a task.
 */
function updateSortedSets(task, changes, priorKeys, priorScore, multi) {
  // Recalculate keys and score after changes
  var keys = sortedSetKeys(task)
    , score = sortedSetScore(task)
  // Remove from sets which are no longer applicable
  var obsoleteKeys = _.difference(priorKeys, keys)
  obsoleteKeys.forEach(function(key) { multi.zrem(key, task.id) })
  // If the score has changed, all sorted sets need to be added to again,
  // otherwise only add to keys for new sets.
  var addKeys = (score !== priorScore ? keys : _.difference(keys, priorKeys))
  addKeys.forEach(function(key) { multi.zadd(key, score, task.id) })
}

/**
 * Updates a task by applying the given changes to it.
 */
function update(task, changes, cb) {
  // Get sorted set keys and score prior to applying changes
  var priorKeys = sortedSetKeys(task)
    , priorScore = sortedSetScore(task)
  // Apply changes to the task
  _.extend(task, changes)
  // Store updates to changed fields
  var redisTask = toRedis(task)
  $r.hmset(TASK + task.id, _.pick(redisTask, _.keys(changes)), function(err) {
    if (err) return cb(err)
    var task = fromRedis(redisTask)
      , multi = $r.multi()
    // Update sorted sets according to the applied changes - doing it here is a
    // hack because the logic to plug the time into the due date happens on the
    // way out of Redis. Let it be a warning from history...
    updateSortedSets(task, changes, priorKeys, priorScore, multi)
    multi.exec(function(err) {
      if (err) return cb(err)
      cb(null, task)
    })
  })
}

// ------------------------------------------------------------------ Delete ---

/**
 * Queues commands to remove from sorted sets for the given task.
 */
function removeFromSortedSets(task, multi) {
  sortedSetKeys(task).forEach(function(key) {
    multi.zrem(key, task.id)
  })
}

/**
 * Deletes a task.
 */
function del(task, cb) {
  var multi = $r.multi()
  removeFromSortedSets(task, multi)
  multi.del(TASK + task.id)
  multi.exec(cb)
}

// ---------------------------------------------------------------- Misc Ops ---

/**
 * Completes a task.
 * @param task the task to be completed.
 * @param completedAt the date the task was completed at.
 * @param completedBy the user completing the task.
 */
function complete(task, completedAt, completedBy, cb) {
  var multi = $r.multi()
  multi.hmset(TASK + task.id, 'completedAt', completedAt.valueOf(), 'completedBy', completedBy.id)
  removeFromSortedSets(task, multi)
  multi.exec(cb)
}

/**
 * Reopens a task.
 */
function reopen(task, cb) {
  var multi = $r.multi()
  multi.hdel(TASK + task.id, 'completedAt', 'completedBy')
  addToSortedSets(task, multi)
  multi.exec(cb)
}

// --------------------------------------------------------------------- Get ---

/**
 * Retrieves a task by id.
 */
function byId(id, cb) {
  $r.hgetall(TASK + id, function(err, task) {
    if (err) return cb(err)
    if (!task) return cb(null, null)
    fetchRelated(fromRedis(task), cb)
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
function getTasks(command, start, end, options, cb) {
  var defaultOptions = {assignedTo: null, category: null, contact: null}
  if (typeof options == 'function') {
    cb = options
    options = defaultOptions
  }
  else {
    options = _.extend(defaultOptions, options)
  }

  var key = lookupKey(options.assignedTo, options.category, options.contact)

  $r[command](key, start, end, function(err, ids) {
    if (err) return cb(err)
    var multi = $r.multi()
    ids.forEach(function(id) { multi.hgetall(TASK + id) })
    multi.exec(function(err, tasks) {
      if (err) return cb(err)
      async.map(tasks
      , function(task, cb) { fetchRelated(fromRedis(task), cb) }
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
    return (this.due.valueOf() < new Date().valueOf())
  }

, isCompleted: function() {
    return !!this.completedAt
  }
}

/**
 * Sets the task prototype as the given object's prototype.
 */
function asTask(task) {
  task.__proto__ = taskProto
  return task
}

// -------------------------------------------------------- Redis Conversion ---

/**
 * Prepares task data for storage in Redis. Changes are made to a shallow copy,
 * so the original task data remains untouched.
 */
function toRedis(task) {
  // Work on a shallow copy
  task = _.clone(task)
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
  task.due = task.due.valueOf()
  return task
}

/**
 * Prepares task data coming out of Redis.
 */
function fromRedis(task) {
  task.due = new Date(+task.due)
  // If a time was set, it's also represented in the due date
  task.time = (task.time == 'true' ? new Date(+task.due) : null)
  if (task.completedAt) {
    task.completedAt = new Date(+task.completedAt)
  }
  return asTask(task)
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
  if (task.completedBy) {
    lookups.completedBy = users.byId.bind(null, task.completedBy)
  }
  async.parallel(lookups, function(err, related) {
    if (err) return cb(err)
    cb(null, _.extend(task, related))
  })
}
