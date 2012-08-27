var querystring = require('querystring')

var moment = require('moment')
  , Calendar = require('calendar').Calendar

var settings = require('./settings')

var URL_ROOT = '/calendar/'
  , URL_FMT = 'YYYY/M'

module.exports = function(kwargs) {
  var calendarYear = kwargs.year
    , calendarMonth = kwargs.month
    , filters = querystring.stringify(kwargs.filters)
  if (filters) {
    filters = '?' + filters
  }

  var today = new Date()
    , firstDate = null
    , lastDate = null
    , cellLookup = {}

  var calendar = new Calendar(settings.weekStartsMonday ? 1 : 0)
    , headings = moment.weekdays.slice()
  if (settings.weekStartsMonday) {
    headings.push(headings.shift())
  }

  var rows = calendar.monthDates(calendarYear, calendarMonth, function(d) {
    if (firstDate === null) {
      firstDate = d
    }
    else {
      lastDate = d
    }
    var cell = {
      date: d.getDate()
    , month: d.getMonth()
    , year: d.getFullYear()
    , classes: []
    , tasks: []
    }
    // Add special cell classes
    if (d.getMonth() !== calendarMonth) {
      cell.classes.push('other-month')
    }
    if (d.getDate() == today.getDate() &&
        d.getMonth() == today.getMonth() &&
        d.getFullYear() == today.getFullYear()) {
      cell.classes.push('today')
    }
    // Add cell to the month/date lookup
    if (typeof cellLookup[d.getMonth()] == 'undefined') {
      cellLookup[d.getMonth()] = {}
    }
    cellLookup[cell.month][cell.date] = cell
    // Return the cell to add it to a row
    return cell
  })

  var month = moment([calendarYear, calendarMonth])

  return {
    // Tasks
    fromTime : moment(firstDate).startOf('day').valueOf()
  , toTime   : moment(lastDate).endOf('day').valueOf()
  , month    : month.format('MMMM YYYY')
  , headings : headings
  , rows     : rows
    // URLs
  , currentURL  : URL_ROOT + month.format(URL_FMT)
  , previousURL : URL_ROOT + moment(month).subtract('M', 1).format(URL_FMT) + filters
  , nextURL     : URL_ROOT + moment(month).add('M', 1).format(URL_FMT) + filters
    // Functions
  , addTasks: function(tasks) {
      tasks.forEach(function(task) {
        cellLookup[task.due.getMonth()][task.due.getDate()].tasks.push(task)
      })
    }
  }
}
