#!/usr/bin/env node

var program = require('commander')
  , async = require('async')

function verbatim(cb) { return function(input) { cb(null, input) } }
function ok(cb) { return function(ok) { cb(null, !!ok) } }

program
 .version(require('../package.json').version)
 .usage('[command] [options]')

program
 .command('createuser')
 .description('    create a new user')
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
        program.prompt('first name: ', verbatim(cb))
      }
    , lastName: function(cb) {
        program.prompt('last name: ', verbatim(cb))
      }
    , email: function(cb) {
        program.prompt('email address: ', verbatim(cb))
      }
    , isAdmin: function(cb) {
        program.confirm('admin privileges? ', ok(cb))
      }
    },
    function(err, user) {
      redis.users.store(user, function(err, user, password) {
        if (err) throw err
        console.log('User "%s" successfully created.', user.username)
        console.log('Generated password is "%s".', password)
        process.exit(0)
      })
    })
  })

program.parse(process.argv)
if (!program.args.length) {
  console.log(program.helpInformation())
}
