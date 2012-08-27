module.exports = {
// App
  appName: 'Success CRM'
, dateInputFormats: [
    '%d/%m/%Y' // 15/04/2013
  , '%d/%m/%y' // 15/04/13
  ]
, timeInputFormats: [
    '%H:%M' // 22:50
  ]
, weekStartsMonday: true

// Redis
, redisPort: 6379
, redisHost: '127.0.0.1'
, redisDatabase: 0
  // Password, or false if auth is nor required
, redisAuth: false

// Express
, port: 3000
, sessionSecret: 'your secret here'
}
