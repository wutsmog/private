/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @providesModule KeyEscapeUtils
 * @flow
 */

'use strict';

var emptyFunction = require('fbjs/lib/emptyFunction');

/**
 * Escape and wrap key so it is safe to use as a reactid
 *
 * @param {string} key to be escaped.
 * @return {string} the escaped key.
 */
function escape(key: string): string {
  var escapeRegex = /[=:]/g;
  var escaperLookup = {
    '=': '=0',
    ':': '=2',
  };
  var escapedString = ('' + key).replace(escapeRegex, function(match) {
    return escaperLookup[match];
  });

  return '$' + escapedString;
}

var unescapeInDev = emptyFunction;
if (__DEV__) {
  /**
   * Unescape and unwrap key for human-readable display
   *
   * @param {string} key to unescape.
   * @return {string} the unescaped key.
   */
  unescapeInDev = function(key: string): string {
    var unescapeRegex = /(=0|=2)/g;
    var unescaperLookup = {
      '=0': '=',
      '=2': ':',
    };
    var keySubstring = key[0] === '.' && key[1] === '$'
      ? key.substring(2)
      : key.substring(1);

    return ('' + keySubstring).replace(unescapeRegex, function(match) {
      return unescaperLookup[match];
    });
  };
}

var KeyEscapeUtils = {
  escape: escape,
  unescapeInDev: unescapeInDev,
};

module.exports = KeyEscapeUtils;
