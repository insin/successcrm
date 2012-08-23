var redis = require('redis')

var settings = require('../settings')

var $r = module.exports = redis.createClient(settings.redisPort, settings.redisHost)

$r.on('error', function (err) {
  console.error('Redis Error: %s', err)
})

if (settings.redisAuth) {
  $r.auth(settings.redisAuth)
}

if (settings.redisDatabase) {
  $r.select(settings.redisDatabase)
}
