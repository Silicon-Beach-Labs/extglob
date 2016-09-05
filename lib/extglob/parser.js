'use strict';

var debug = require('debug')('extglob:parser');
var Position = require('./position');
var utils = require('../utils');

/**
 * Create a new `Parser` for the given `input` and `options`.
 * @param {object} `input`
 * @param {object} `options`
 */

function Parser(options) {
  debug('parser', __filename);
  this.options = utils.extend({source: 'extglob'}, options);
  this.input = '';
  this.parsed = '';
  this.column = 1;
  this.errors = [];

  this.parsers = {};
  this.fns = [];

  var pos = this.position();
  this.bos = pos({type: 'bos', val: ''});

  this.ast = {
    type: 'root',
    nodes: [this.bos]
  };

  this.nodes = [this.ast];
  this.types = [];
  this.stack = [];
  this.count = 0;
  this.sets = {
    single: [],
    double: [],
    bracket: [],
    brace: [],
    paren: []
  };
}

/**
 * Prototype methods
 */

Parser.prototype = {
  constructor: Parser,

  /**
   * Throw a formatted error with the cursor column and `msg`.
   * @param {String} `msg` Message to use in the Error.
   */

  error: function(msg) {
    var message = this.options.source + ' column:' + this.column + ': ' + msg;
    var err = new Error(message);
    err.reason = msg;
    err.column = this.column;
    err.source = this.options.source;

    if (this.options.silent) {
      this.errors.push(err);
    } else {
      throw err;
    }
  },

  /**
   * Mark position and patch `node.position`.
   */

  position: function() {
    var start = { column: this.column };
    var self = this;

    return function(node) {
      utils.define(node, 'position', new Position(start, self));
      node.source = self.orig;
      return node;
    };
  },

  /**
   * Push a parser `fn` onto the `fns` array
   * @param {Function} `fn`
   */

  use: function(fn) {
    this.fns.push(fn);
    return this;
  },

  /**
   * Set parser `name` with the given `fn`
   * @param {String} `name`
   * @param {Function} `fn`
   */

  set: function(type, fn) {
    this.types.push(type);
    this.parsers[type] = fn;
    return this;
  },

  /**
   * Get parser `name`
   * @param {String} `name`
   */

  get: function(name) {
    return this.parsers[name];
  },

  /**
   * Push a `token` onto the `type` stack.
   *
   * @param {String} `type`
   * @return {Object} `token`
   * @api public
   */

  push: function(type, token) {
    this.count++;
    this.stack.push(token);
    return this.sets[type].push(token);
  },

  /**
   * Pop a token off of the `type` stack
   * @param {String} `type`
   * @returns {Object} Returns a token
   * @api public
   */

  pop: function(type) {
    this.count--;
    this.stack.pop();
    return this.sets[type].pop();
  },

  /**
   * Return true if inside a `stack` node. Types are `braces`, `parens` or `brackets`.
   *
   * @param {String} `type`
   * @return {Boolean}
   * @api public
   */

  isInside: function(type) {
    return this.sets[type].length > 0;
  },

  /**
   * Return true node is the given type.
   *
   * @param {String} `type`
   * @return {Boolean}
   * @api public
   */

  isType: function(type, node) {
    return node && node.type === type;
  },

  /**
   * Get the previous AST node
   * @return {Object}
   */

  prev: function() {
    return this.stack.length ? utils.last(this.stack) : utils.last(this.nodes);
  },

  /**
   * Update lineno and column based on `str`.
   */

  consume: function(len) {
    this.input = this.input.substr(len);
  },

  /**
   * Update column based on `str`.
   */

  updatePosition: function(str, len) {
    this.column += len;
    this.parsed += str;
    this.consume(len);
  },

  /**
   * Match `regex`, return captures, and update the cursor position by `match[0]` length.
   * @param {RegExp} `regex`
   * @return {Object}
   */

  match: function(regex) {
    var m = regex.exec(this.input);
    if (m) {
      this.updatePosition(m[0], m[0].length);
      return m;
    }
  },

  /**
   * Capture `type` with the given regex.
   * @param {String} `type`
   * @param {RegExp} `regex`
   * @return {Function}
   */

  capture: function(type, regex) {
    this.set(type, function() {
      var parsed = this.parsed;
      var pos = this.position();
      var m = this.match(regex);
      if (!m || !m[0]) return;

      var prev = this.prev();
      var node = pos({
        type: type,
        parsed: parsed,
        rest: this.input,
        val: m[0],
      });

      utils.define(node, 'parent', prev);
      prev.nodes.push(node);
      return node;
    }.bind(this));
    return this;
  },

  /**
   * Create a parser with open and close for parens,
   * brackets or braces
   */

  pair: function(type, openRegex, closeRegex) {

    /**
     * Open
     */

    this.set(type + '.open', function() {
      var parsed = this.parsed;
      var pos = this.position();
      var m = this.match(openRegex);
      if (!m || !m[0]) return;
      var val = m[0];

      var prev = this.prev();
      this.specialChars = true;
      var open = pos({
        type: type + '.open',
        val: val
      });

      var node = pos({
        type: type,
        prefix: m[1],
        parsed: parsed,
        rest: this.input,
        nodes: [open]
      });

      utils.define(node, 'parent', prev);
      utils.define(open, 'parent', node);

      this.push(type, node);
      prev.nodes.push(node);
      return node;
    });

    /**
     * Close
     */

    this.set(type + '.close', function() {
      var pos = this.position();
      var m = this.match(closeRegex);
      if (!m) return;

      var open = this.pop(type);
      if (this.isType(open, type)) {
        throw new Error('missing opening "' + type + '"');
      }

      var node = pos({
        type: type + '.close',
        rest: this.input,
        suffix: m[1],
        val: m[0],
      });

      utils.define(node, 'parent', open);
      open.nodes.push(node);
      return node;
    });

    return this;
  },

  /**
   * Capture end-of-string
   */

  eos: function() {
    var pos = this.position();
    if (this.input) return;
    var prev = this.prev();
    var node = pos({
      type: 'eos',
      val: this.append || ''
    });
    prev.nodes.push(node);
    return node;
  },

  /**
   * Run parsers to advance the cursor position
   */

  next: function() {
    var len = this.types.length;
    var idx = -1;
    while (++idx < len) {
      this.parsers[this.types[idx]].call(this);
    }
  },

  /**
   * Parse the given string.
   * @return {Array}
   */

  parse: function(input) {
    this.orig = input;
    this.ast.errors = this.errors;
    this.input = input;

    while (this.input) {
      var prev = this.input;
      this.next();
      if (this.input && prev === this.input) {
        throw new Error('no parsers registered for: "' + this.input.charAt(0) + '"');
      }
    }

    if (this.stack.length && this.options.strict) {
      var node = this.stack.pop();
      throw this.error('missing opening ' + node.type + ': "' + this.orig + '"')
    }

    this.eos();
    return this.ast;
  }
};

/**
 * Expose `Parser`
 */

module.exports = Parser;
