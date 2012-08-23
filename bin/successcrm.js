#!/usr/bin/env node

var program = require('commander')
  , async = require('async')

program
 .version(require('../package.json').version)

program
 .command('createuser')
 .description('create a user')
 .action(function() {
    var redis = require('../redis')
    async.series({
      username: function(cb) {
        var username = null
        async.whilst(
          function() { return (username === null) }
        , function(cb) {
            program.prompt('username: ', function(input) {
              redis.users.byUsername(input, function(err, user) {
                if (err) return cb(err)
                if (!user) {
                  username = input
                }
                else {
                  console.log('The username "%s" is already taken.', input)
                }
                cb(null)
              })
            })
          }
        , function(err) {
            if (err) return cb(err)
            cb(null, username)
          }
        )
      }
    , firstName: function(cb) {
        program.prompt('first name: ', function(input) {
          cb(null, input)
        })
      }
    , lastName: function(cb) {
        program.prompt('last name: ', function(input) {
          cb(null, input)
        })
      }
    , email: function(cb) {
        program.prompt('email address: ', function(input) {
          cb(null, input)
        })
      }
    , isAdmin: function(cb) {
        program.confirm('admin privileges? ', function(ok) {
          cb(null, !!ok)
        })
      }
    },
    function(err, user) {
      redis.users.store(user, function(err, user, password) {
        if (err) throw err
        console.log('User "%s" successfully created.', user.username)
        console.log('Generated password is "%s".', password)
      })
    })
  })

program.parse(process.argv)