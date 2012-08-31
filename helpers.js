var  jade = require('jade')
   , moment = require('moment')

var escape = jade.runtime.escape

var MIXED_NEWLINES_RE = /\r\n|\r|\n/g
  , MULTIPLE_NEWLINES_RE = /\n{2,}/g
  , NEWLINE_RE = /\n/g

function normaliseNewlines(text) {
  return String(text).replace(MIXED_NEWLINES_RE, '\n')
}

exports.$date = function(date, format) {
  return moment(date).format(format)
}

exports.$timeAgo = function(date) {
  return moment(date).fromNow()
}

/**
 * Converts newlines into <p> and <br>.
 */
exports.$linebreaks = function(text) {
  text = escape(normaliseNewlines(text))
  return text.split(MULTIPLE_NEWLINES_RE).map(function(para) {
    return '<p>' + para.replace(NEWLINE_RE, '<br>') + '</p>'
  }).join('\n')
}

/**
 * Converts multiple newlines into a forward-slash.
 */
exports.$linebreaksslash = function(text) {
  text = escape(normaliseNewlines(text))
  return text.split(MULTIPLE_NEWLINES_RE).join(' / ')
}

/**
 * Converts all newlines into <br>.
 */
exports.$linebreaksbr = function(text) {
  return escape(String(text)).split(MIXED_NEWLINES_RE).join('<br>')
}
