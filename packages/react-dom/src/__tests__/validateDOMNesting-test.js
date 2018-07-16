/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

const React = require('react');
const ReactDOM = require('react-dom');

function expectWarnings(tags, warnings = [], withoutStack = 0) {
  tags = [...tags];
  warnings = [...warnings];

  let element = null;
  const containerTag = tags.shift();
  const container =
    containerTag === 'svg'
      ? document.createElementNS('http://www.w3.org/2000/svg', containerTag)
      : document.createElement(containerTag);

  while (tags.length) {
    const Tag = tags.pop();
    element = <Tag>{element}</Tag>;
  }

  expect(() => ReactDOM.render(element, container)).toWarnDev(warnings, {
    withoutStack,
  });
}

describe('validateDOMNesting', () => {
  it('allows valid nestings', () => {
    expectWarnings(['table', 'tbody', 'tr', 'td', 'b']);
    expectWarnings(
      ['body', 'datalist', 'option'],
      [
        'render(): Rendering components directly into document.body is discouraged',
      ],
      1,
    );
    expectWarnings(['div', 'a', 'object', 'a']);
    expectWarnings(['div', 'p', 'button', 'p']);
    expectWarnings(['p', 'svg', 'foreignObject', 'p']);
    expectWarnings(['html', 'body', 'div']);

    // Invalid, but not changed by browser parsing so we allow them
    expectWarnings(['div', 'ul', 'ul', 'li']);
    expectWarnings(['div', 'label', 'div']);
    expectWarnings(['div', 'ul', 'li', 'section', 'li']);
    expectWarnings(['div', 'ul', 'li', 'dd', 'li']);
  });

  it('prevents problematic nestings', () => {
    expectWarnings(
      ['a', 'a'],
      [
        'validateDOMNesting(...): <a> cannot appear as a descendant of <a>.\n' +
          '    in a (at **)',
      ],
    );
    expectWarnings(
      ['form', 'form'],
      [
        'validateDOMNesting(...): <form> cannot appear as a descendant of <form>.\n' +
          '    in form (at **)',
      ],
    );
    expectWarnings(
      ['p', 'p'],
      [
        'validateDOMNesting(...): <p> cannot appear as a descendant of <p>.\n' +
          '    in p (at **)',
      ],
    );
    expectWarnings(
      ['table', 'tr'],
      [
        'validateDOMNesting(...): <tr> cannot appear as a child of <table>. ' +
          'Add a <tbody> to your code to match the DOM tree generated by the browser.\n' +
          '    in tr (at **)',
      ],
    );
    expectWarnings(
      ['div', 'ul', 'li', 'div', 'li'],
      [
        'validateDOMNesting(...): <li> cannot appear as a descendant of <li>.\n' +
          '    in li (at **)\n' +
          '    in div (at **)\n' +
          '    in li (at **)\n' +
          '    in ul (at **)',
      ],
    );
    expectWarnings(
      ['div', 'html'],
      [
        'validateDOMNesting(...): <html> cannot appear as a child of <div>.\n' +
          '    in html (at **)',
      ],
    );
    expectWarnings(
      ['body', 'body'],
      [
        'render(): Rendering components directly into document.body is discouraged',
        'validateDOMNesting(...): <body> cannot appear as a child of <body>.\n' +
          '    in body (at **)',
      ],
      1,
    );
    expectWarnings(
      ['svg', 'foreignObject', 'body', 'p'],
      [
        'validateDOMNesting(...): <body> cannot appear as a child of <foreignObject>.\n' +
          '    in body (at **)\n' +
          '    in foreignObject (at **)',
      ],
    );
  });
});
