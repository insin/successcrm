/**
 * If given an object, returns its valueOf() method, otherwise returns it as-is.
 */
exports.timestamp = function(obj) {
  if (!obj) return obj
  if (typeof obj == 'object') return obj.valueOf()
  return obj
}

/**
 * If given an object, returns its id property, otherwise returns it as-is.
 */
exports.rel = function(obj) {
  if (!obj) return obj
  if (typeof obj == 'object') return obj.id
  return obj
}
