/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {shorthandToLonghand} from './CSSShorthandProperty';

import hyphenateStyleName from '../shared/hyphenateStyleName';
import warnValidStyle from '../shared/warnValidStyle';
import isUnitlessNumber from '../shared/isUnitlessNumber';
import {checkCSSPropertyStringCoercion} from 'shared/CheckStringCoercion';
import {trackHostMutation} from 'react-reconciler/src/ReactFiberMutationTracking';

/**
 * Operations for dealing with CSS properties.
 */

/**
 * This creates a string that is expected to be equivalent to the style
 * attribute generated by server-side rendering. It by-passes warnings and
 * security checks so it's not safe to use this value for anything other than
 * comparison. It is only used in DEV for SSR validation.
 */
export function createDangerousStringForStyles(styles) {
  if (__DEV__) {
    let serialized = '';
    let delimiter = '';
    for (const styleName in styles) {
      if (!styles.hasOwnProperty(styleName)) {
        continue;
      }
      const value = styles[styleName];
      if (value != null && typeof value !== 'boolean' && value !== '') {
        const isCustomProperty = styleName.indexOf('--') === 0;
        if (isCustomProperty) {
          if (__DEV__) {
            checkCSSPropertyStringCoercion(value, styleName);
          }
          serialized += delimiter + styleName + ':' + ('' + value).trim();
        } else {
          if (
            typeof value === 'number' &&
            value !== 0 &&
            !isUnitlessNumber(styleName)
          ) {
            serialized +=
              delimiter + hyphenateStyleName(styleName) + ':' + value + 'px';
          } else {
            if (__DEV__) {
              checkCSSPropertyStringCoercion(value, styleName);
            }
            serialized +=
              delimiter +
              hyphenateStyleName(styleName) +
              ':' +
              ('' + value).trim();
          }
        }
        delimiter = ';';
      }
    }
    return serialized || null;
  }
}

function setValueForStyle(style, styleName, value) {
  const isCustomProperty = styleName.indexOf('--') === 0;
  if (__DEV__) {
    if (!isCustomProperty) {
      warnValidStyle(styleName, value);
    }
  }

  if (value == null || typeof value === 'boolean' || value === '') {
    if (isCustomProperty) {
      style.setProperty(styleName, '');
    } else if (styleName === 'float') {
      style.cssFloat = '';
    } else {
      style[styleName] = '';
    }
  } else if (isCustomProperty) {
    style.setProperty(styleName, value);
  } else if (
    typeof value === 'number' &&
    value !== 0 &&
    !isUnitlessNumber(styleName)
  ) {
    style[styleName] = value + 'px'; // Presumes implicit 'px' suffix for unitless numbers
  } else {
    if (styleName === 'float') {
      style.cssFloat = value;
    } else {
      if (__DEV__) {
        checkCSSPropertyStringCoercion(value, styleName);
      }
      style[styleName] = ('' + value).trim();
    }
  }
}

/**
 * Sets the value for multiple styles on a node.  If a value is specified as
 * '' (empty string), the corresponding style property will be unset.
 *
 * @param {DOMElement} node
 * @param {object} styles
 */
export function setValueForStyles(node, styles, prevStyles) {
  if (styles != null && typeof styles !== 'object') {
    throw new Error(
      'The `style` prop expects a mapping from style properties to values, ' +
        "not a string. For example, style={{marginRight: spacing + 'em'}} when " +
        'using JSX.',
    );
  }
  if (__DEV__) {
    if (styles) {
      // Freeze the next style object so that we can assume it won't be
      // mutated. We have already warned for this in the past.
      Object.freeze(styles);
    }
  }

  const style = node.style;

  if (prevStyles != null) {
    if (__DEV__) {
      validateShorthandPropertyCollisionInDev(prevStyles, styles);
    }

    for (const styleName in prevStyles) {
      if (
        prevStyles.hasOwnProperty(styleName) &&
        (styles == null || !styles.hasOwnProperty(styleName))
      ) {
        // Clear style
        const isCustomProperty = styleName.indexOf('--') === 0;
        if (isCustomProperty) {
          style.setProperty(styleName, '');
        } else if (styleName === 'float') {
          style.cssFloat = '';
        } else {
          style[styleName] = '';
        }
        trackHostMutation();
      }
    }
    for (const styleName in styles) {
      const value = styles[styleName];
      if (styles.hasOwnProperty(styleName) && prevStyles[styleName] !== value) {
        setValueForStyle(style, styleName, value);
        trackHostMutation();
      }
    }
  } else {
    for (const styleName in styles) {
      if (styles.hasOwnProperty(styleName)) {
        const value = styles[styleName];
        setValueForStyle(style, styleName, value);
      }
    }
  }
}

function isValueEmpty(value) {
  return value == null || typeof value === 'boolean' || value === '';
}

/**
 * Given {color: 'red', overflow: 'hidden'} returns {
 *   color: 'color',
 *   overflowX: 'overflow',
 *   overflowY: 'overflow',
 * }. This can be read as "the overflowY property was set by the overflow
 * shorthand". That is, the values are the property that each was derived from.
 */
function expandShorthandMap(styles) {
  const expanded = {};
  for (const key in styles) {
    const longhands = shorthandToLonghand[key] || [key];
    for (let i = 0; i < longhands.length; i++) {
      expanded[longhands[i]] = key;
    }
  }
  return expanded;
}

/**
 * When mixing shorthand and longhand property names, we warn during updates if
 * we expect an incorrect result to occur. In particular, we warn for:
 *
 * Updating a shorthand property (longhand gets overwritten):
 *   {font: 'foo', fontVariant: 'bar'} -> {font: 'baz', fontVariant: 'bar'}
 *   becomes .style.font = 'baz'
 * Removing a shorthand property (longhand gets lost too):
 *   {font: 'foo', fontVariant: 'bar'} -> {fontVariant: 'bar'}
 *   becomes .style.font = ''
 * Removing a longhand property (should revert to shorthand; doesn't):
 *   {font: 'foo', fontVariant: 'bar'} -> {font: 'foo'}
 *   becomes .style.fontVariant = ''
 */
function validateShorthandPropertyCollisionInDev(prevStyles, nextStyles) {
  if (__DEV__) {
    if (!nextStyles) {
      return;
    }

    // Compute the diff as it would happen elsewhere.
    const expandedUpdates = {};
    if (prevStyles) {
      for (const key in prevStyles) {
        if (prevStyles.hasOwnProperty(key) && !nextStyles.hasOwnProperty(key)) {
          const longhands = shorthandToLonghand[key] || [key];
          for (let i = 0; i < longhands.length; i++) {
            expandedUpdates[longhands[i]] = key;
          }
        }
      }
    }
    for (const key in nextStyles) {
      if (
        nextStyles.hasOwnProperty(key) &&
        (!prevStyles || prevStyles[key] !== nextStyles[key])
      ) {
        const longhands = shorthandToLonghand[key] || [key];
        for (let i = 0; i < longhands.length; i++) {
          expandedUpdates[longhands[i]] = key;
        }
      }
    }

    const expandedStyles = expandShorthandMap(nextStyles);
    const warnedAbout = {};
    for (const key in expandedUpdates) {
      const originalKey = expandedUpdates[key];
      const correctOriginalKey = expandedStyles[key];
      if (correctOriginalKey && originalKey !== correctOriginalKey) {
        const warningKey = originalKey + ',' + correctOriginalKey;
        if (warnedAbout[warningKey]) {
          continue;
        }
        warnedAbout[warningKey] = true;
        console.error(
          '%s a style property during rerender (%s) when a ' +
            'conflicting property is set (%s) can lead to styling bugs. To ' +
            "avoid this, don't mix shorthand and non-shorthand properties " +
            'for the same value; instead, replace the shorthand with ' +
            'separate values.',
          isValueEmpty(nextStyles[originalKey]) ? 'Removing' : 'Updating',
          originalKey,
          correctOriginalKey,
        );
      }
    }
  }
}
