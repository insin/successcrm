module.exports = {
// App
  appName: 'Success CRM'
, dateInputFormats: [
    '%d/%m/%Y' // dd/mm/yyyy
  , '%d/%m/%y' // dd/mm/yy
  ]

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
