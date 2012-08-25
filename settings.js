module.exports = {
// App
  appName: 'Success CRM'
, dateInputFormats: ['%d/%m/%Y', '%d/%m/%y']

// Redis
, redisPort: 6379
, redisHost: '127.0.0.1'
, redisDatabase: 0
  // Password, or false if auth is nor required
, redisAuth: false

// Express
, cookieSecret: 'your secret here'
, port: 3000
}
