var object = require('isomorph/object')

var $r = require('./connection')

module.exports = {
  byId: byId
, byName: byName
, store: store
, get: get
, choices: choices
}

var CATEGORY = 'category:#'
  , CATEGORIES = 'categories'
  , NAME_TO_ID = 'categoryname.to.id:#'
  , NEXT_ID = 'categories:nextid'

function byId(id, cb) {
  $r.hgetall(CATEGORY + id, function(err, category) {
    if (err) return cb(err)
    cb(null, asCategory(category))
  })
}

function byName(name, cb) {
  $r.get(NAME_TO_ID + name.toLowerCase(), function(err, id) {
    if (err) return cb(err)
    if (!id) return cb(null, null)
    byId(id, cb)
  })
}

/**
 * Stores a new category and re-sorts the list of category ids.
 */
function store(category, cb) {
  $r.incr(NEXT_ID, function(err, id) {
    if (err) return cb(err)
    category.id = id
    var multi = $r.multi()
    multi.set(NAME_TO_ID + category.name.toLowerCase(), id)
    multi.rpush(CATEGORIES, id)
    multi.hmset(CATEGORY + id, category)
    // Sort category ids by category name
    multi.sort(CATEGORIES, 'BY', CATEGORY + '*->name', 'ALPHA', 'STORE', CATEGORIES)
    multi.exec(function(err) {
      if (err) return cb(err)
      cb(null, asCategory(category))
    })
  })
}

function get(cb) {
  $r.lrange(CATEGORIES, 0, -1, function(err, ids) {
    if (err) return cb(err)
    var multi = $r.multi()
    ids.forEach(function(id) { multi.hgetall(CATEGORY + id) })
    multi.exec(function(err, categories) {
      if (err) return cb(err)
      cb(null, categories.map(asCategory))
    })
  })
}

/**
 * Returns categories as a list of [id, name] pairs.
 */
function choices(options, cb) {
  var defaultOptions = {emptyChoice: ''}
  if (typeof options == 'function') {
    cb = options
    options = defaultOptions
  }
  else {
    options = object.extend(defaultOptions, options)
  }
  get(function(err, categories) {
    if (err) return cb(err)
    var choices = [['', options.emptyChoice]]
    categories.forEach(function(c) { choices.push([c.id, c.name]) })
    cb(null, choices)
  })
}

// ------------------------------------------------- Prototype & Constructor ---

var categoryProto = {
  toString: function() {
    return this.name
  }
}

function asCategory(category) {
  category.__proto__ = categoryProto
  return category
}
