/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule CSSPropertyOperations
 */

'use strict';

var CSSProperty = require('CSSProperty');
var ExecutionEnvironment = require('fbjs/lib/ExecutionEnvironment');

var dangerousStyleValue = require('dangerousStyleValue');
var hyphenateStyleName = require('fbjs/lib/hyphenateStyleName');

if (__DEV__) {
  var warnValidStyle = require('warnValidStyle');
}

var hasShorthandPropertyBug = false;
if (ExecutionEnvironment.canUseDOM) {
  var tempStyle = document.createElement('div').style;
  try {
    // IE8 throws "Invalid argument." if resetting shorthand style properties.
    tempStyle.font = '';
  } catch (e) {
    hasShorthandPropertyBug = true;
  }
}

/**
 * Operations for dealing with CSS properties.
 */
var CSSPropertyOperations = {
  /**
   * This creates a string that is expected to be equivalent to the style
   * attribute generated by server-side rendering. It by-passes warnings and
   * security checks so it's not safe to use this value for anything other than
   * comparison. It is only used in DEV for SSR validation.
   */
  createDangerousStringForStyles: function(styles) {
    if (__DEV__) {
      var serialized = '';
      var delimiter = '';
      for (var styleName in styles) {
        if (!styles.hasOwnProperty(styleName)) {
          continue;
        }
        var styleValue = styles[styleName];
        if (styleValue != null) {
          var isCustomProperty = styleName.indexOf('--') === 0;
          serialized += delimiter + hyphenateStyleName(styleName) + ':';
          serialized += dangerousStyleValue(
            styleName,
            styleValue,
            isCustomProperty,
          );

          delimiter = ';';
        }
      }
      return serialized || null;
    }
  },

  /**
   * Sets the value for multiple styles on a node.  If a value is specified as
   * '' (empty string), the corresponding style property will be unset.
   *
   * @param {DOMElement} node
   * @param {object} styles
   * @param {ReactDOMComponent} component
   */
  setValueForStyles: function(node, styles, component) {
    var style = node.style;
    for (var styleName in styles) {
      if (!styles.hasOwnProperty(styleName)) {
        continue;
      }
      var isCustomProperty = styleName.indexOf('--') === 0;
      if (__DEV__) {
        if (!isCustomProperty) {
          warnValidStyle(styleName, styles[styleName], component);
        }
      }
      var styleValue = dangerousStyleValue(
        styleName,
        styles[styleName],
        isCustomProperty,
      );
      if (styleName === 'float') {
        styleName = 'cssFloat';
      }
      if (isCustomProperty) {
        style.setProperty(styleName, styleValue);
      } else if (styleValue) {
        style[styleName] = styleValue;
      } else {
        var expansion =
          hasShorthandPropertyBug &&
          CSSProperty.shorthandPropertyExpansions[styleName];
        if (expansion) {
          // Shorthand property that IE8 won't like unsetting, so unset each
          // component to placate it
          for (var individualStyleName in expansion) {
            style[individualStyleName] = '';
          }
        } else {
          style[styleName] = '';
        }
      }
    }
  },
};

module.exports = CSSPropertyOperations;
