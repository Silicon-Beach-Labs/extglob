'use strict';

var debug = require('debug')('extglob');
var toRegex = require('to-regex');
var extend = require('extend-shallow');
var compilers = require('./lib/compilers');
var parsers = require('./lib/parsers');
var Extglob = require('./lib/extglob');
var makeReCache = {};
var cache = {};

/**
 * Convert the given `extglob` pattern into a regex-compatible string. Returns
 * an object with the compiled result and the parsed AST.
 *
 * ```js
 * var extglob = require('extglob');
 * console.log(extglob('*.!(*a)').output);
 * //=> '(?!\\.)[^/]*?\\.(?!(?!\\.)[^/]*?a\\b).*?'
 * ```
 * @param {String} `str`
 * @param {Object} `options`
 * @return {String}
 * @api public
 */

function extglob(str, options) {
  var matcher = new Extglob(options);
  var ast = matcher.parse(str, options);
  return matcher.compile(ast, options);
}

/**
 * Takes an array of strings and an extglob pattern and returns a new
 * array that contains only the strings that match the pattern.
 *
 * ```js
 * var extglob = require('extglob');
 * console.log(extglob.match(['a.a', 'a.b', 'a.c'], '*.!(*a)'));
 * //=> ['a.b', 'a.c']
 * ```
 * @param {Array} `arr` Array of strings to match
 * @param {String} `pattern` Extglob pattern
 * @param {Object} `options`
 * @return {Array}
 * @api public
 */

extglob.match = function(arr, pattern, options) {
  arr = [].concat(arr);
  options = options || {};

  var isMatch = extglob.matcher(pattern, options);
  var len = arr.length;
  var idx = -1;
  var res = [];

  while (++idx < len) {
    var ele = arr[idx];
    if (isMatch(ele)) {
      res.push(ele);
    }
  }

  if (res.length === 0) {
    if (options.failglob === true) {
      throw new Error('no matches found for "' + pattern + '"');
    }
    if (options.nonull === true || options.nullglob === true) {
      return [pattern.split('\\').join('')];
    }
  }
  return res;
};

/**
 * Returns true if the specified `string` matches the given
 * extglob `pattern`.
 *
 * ```js
 * var extglob = require('extglob');
 *
 * console.log(extglob.isMatch('a.a', '*.!(*a)'));
 * //=> false
 * console.log(extglob.isMatch('a.b', '*.!(*a)'));
 * //=> true
 * ```
 * @param {String} `string` String to match
 * @param {String} `pattern` Extglob pattern
 * @param {String} `options`
 * @return {Boolean}
 * @api public
 */

extglob.isMatch = function(str, pattern, options) {
  var key = pattern;
  var matcher;

  if (options) {
    for (var prop in options) {
      if (options.hasOwnProperty(prop)) {
        key += ';' + prop + '=' + String(options[prop]);
      }
    }
  }

  options = options || {};
  if (options.cache !== false && cache.hasOwnProperty(key)) {
    matcher = cache[key];
  } else {
    matcher = cache[key] = extglob.matcher(pattern, options);
  }

  return matcher(str);
};

/**
 * Takes an extglob pattern and returns a matcher function. The returned
 * function takes the string to match as its only argument.
 *
 * ```js
 * var extglob = require('extglob');
 * var isMatch = extglob.matcher('*.!(*a)');
 *
 * console.log(isMatch('a.a'));
 * //=> false
 * console.log(isMatch('a.b'));
 * //=> true
 * ```
 * @param {String} `pattern` Extglob pattern
 * @param {String} `options`
 * @return {Boolean}
 * @api public
 */

extglob.matcher = function(pattern, options) {
  var re = extglob.makeRe(pattern, options);
  return function(str) {
    return re.test(str);
  };
};

/**
 * Create a regular expression from the given string `pattern`.
 *
 * ```js
 * var extglob = require('extglob');
 * var re = extglob.makeRe('*.!(*a)');
 * console.log(re);
 * //=> /^[^\/]*?\.(?![^\/]*?a)[^\/]*?$/
 * ```
 * @param {String} `pattern` The pattern to convert to regex.
 * @param {Object} `options`
 * @return {RegExp}
 * @api public
 */

extglob.makeRe = function(pattern, options) {
  var key = pattern;
  var regex;

  if (options) {
    for (var prop in options) {
      if (options.hasOwnProperty(prop)) {
        key += ';' + prop + '=' + String(options[prop]);
      }
    }
  }

  options = options || {};
  if (options.cache !== false && makeReCache.hasOwnProperty(key)) {
    return makeReCache[key];
  }

  var opts = extend({strictErrors: false}, options);
  if (opts.strictErrors === true) {
    opts.strict = true;
  }

  var ext = new Extglob(opts);
  var ast = ext.parse(pattern, opts);
  var res = ext.compile(ast, opts);

  regex = toRegex(res.output, opts);
  if (options.cache !== false) {
    makeReCache[key] = regex;
  }

  return regex;
};

/**
 * Expose `extglob`
 * @type {Function}
 */

module.exports = extglob;

/**
 * Expose `Extglob` constructor
 * @type {Function}
 */

module.exports.Extglob = Extglob;
module.exports.compilers = compilers;
module.exports.parsers = parsers;
