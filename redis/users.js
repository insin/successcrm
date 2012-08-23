var crypto = require('crypto')

var $r = require('./connection')

module.exports = {
  validateCredentials: validateCredentials
, byId: byId
, byUsername: byUsername
, store: store
}

var USER = 'user:#'
  , USERS = 'users'
  , USERNAME_TO_ID = 'username.to.id:#'
  , NEXT_ID = 'users:nextid'

function byId(id, cb) {
  $r.hgetall(USER + id, function(err, user) {
    if (err) return cb(err)
    cb(null, user)
  })
}

function byUsername(username, cb) {
  $r.get(USERNAME_TO_ID + username.toLowerCase(), function(err, id) {
    if (err) return cb(err)
    if (!id) return cb(null, null)
    byId(id, cb)
  })
}

/**
 * Stores a new user, generating an id and password for them. The user object
 * and generated password are passed to the callback if successful.
 */
function store(user, cb) {
  generatePassword(function(err, password, salt, hashedPassword) {
    if (err) return cb(err)
    $r.incr(NEXT_ID, function(err, id) {
      if (err) return cb(err)
      user.id = id
      user.salt = salt
      user.password = hashedPassword
      var multi = $r.multi()
      multi.set(USERNAME_TO_ID + user.username.toLowerCase(), id)
      multi.rpush(USERS, id)
      multi.hmset(USER + id, user)
      multi.exec(function(err) {
        if (err) return cb(err)
        cb(null, user, password)
      })
    })
  })
}

// -------------------------------------------------------------------- Auth ---

function getRandom(cb) {
  crypto.randomBytes(20, function(err, buf) {
    if (err) return cb(err)
    cb(null, buf.toString('hex'))
  })
}

function hashPassword(password, salt, cb) {
  crypto.pbkdf2(password, salt, 1000, 20, function(err, derivedKey) {
    if (err) return cb(err)
    cb(null, new Buffer(derivedKey).toString('hex'))
  })
}

function generatePassword(cb) {
  // Generate a password by hashing one random hex string with another
  getRandom(function(err, random1) {
    if (err) return cb(err)
    getRandom(function(err, random2) {
      if (err) return cb(err)
      hashPassword(random1, random2, function(err, password) {
        if (err) return cb(err)
        // Now generate a random salt and hash the generated password with it
        getRandom(function(err, salt) {
          if (err) return cb(err)
          hashPassword(password, salt, function(err, hashedPassword) {
            if (err) return cb(err)
            cb(null, password, salt, hashedPassword)
          })
        })
      })
    })
  })
}

/**
 * Authenticates the given username and password, returning a user object if
 * successful, otherwise false.
 */
function validateCredentials(username, password, cb) {
  byUsername(username, function(err, user) {
    if (err) return cb(err)
    if (!user) {
      return cb(null, false)
    }
    hashPassword(password, user.salt, function(err, hashedPassword) {
      if (err) return cb(err)
      var authenticated = (hashedPassword === user.password)
      cb(null, authenticated ? user : false)
    })
  })
}
