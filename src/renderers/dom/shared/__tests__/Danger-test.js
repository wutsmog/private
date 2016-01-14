/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails react-core
 */

'use strict';

describe('Danger', function() {

  describe('dangerouslyRenderMarkup', function() {
    var Danger;

    beforeEach(function() {
      jest.resetModuleRegistry();
      Danger = require('Danger');
    });

    it('should render markup', function() {
      var markup = '<div data-reactid=".rX"></div>';
      var output = Danger.dangerouslyRenderMarkup([markup])[0];

      expect(output.nodeName).toBe('DIV');
    });

    it('should render markup with props', function() {
      var markup = '<div class="foo" data-reactid=".rX"></div>';
      var output = Danger.dangerouslyRenderMarkup([markup])[0];

      expect(output.nodeName).toBe('DIV');
      expect(output.className).toBe('foo');
    });

    it('should render wrapped markup', function() {
      var markup = '<th data-reactid=".rX"></th>';
      var output = Danger.dangerouslyRenderMarkup([markup])[0];

      expect(output.nodeName).toBe('TH');
    });

    it('should render lists of markup with similar `nodeName`', function() {
      var renderedMarkup = Danger.dangerouslyRenderMarkup(
        ['<p id="A">1</p>', '<p id="B">2</p>', '<p id="C">3</p>']
      );

      expect(renderedMarkup.length).toBe(3);

      expect(renderedMarkup[0].nodeName).toBe('P');
      expect(renderedMarkup[1].nodeName).toBe('P');
      expect(renderedMarkup[2].nodeName).toBe('P');

      expect(renderedMarkup[0].innerHTML).toBe('1');
      expect(renderedMarkup[1].innerHTML).toBe('2');
      expect(renderedMarkup[2].innerHTML).toBe('3');
    });

    it('should render lists of markup with different `nodeName`', function() {
      var renderedMarkup = Danger.dangerouslyRenderMarkup(
        ['<p id="A">1</p>', '<td id="B">2</td>', '<p id="C">3</p>']
      );

      expect(renderedMarkup.length).toBe(3);

      expect(renderedMarkup[0].nodeName).toBe('P');
      expect(renderedMarkup[1].nodeName).toBe('TD');
      expect(renderedMarkup[2].nodeName).toBe('P');

      expect(renderedMarkup[0].innerHTML).toBe('1');
      expect(renderedMarkup[1].innerHTML).toBe('2');
      expect(renderedMarkup[2].innerHTML).toBe('3');
    });

    it('should throw when rendering invalid markup', function() {
      expect(function() {
        Danger.dangerouslyRenderMarkup(['']);
      }).toThrow(
        'dangerouslyRenderMarkup(...): Missing markup.'
      );

      spyOn(console, 'error');

      var renderedMarkup = Danger.dangerouslyRenderMarkup(['<p></p><p></p>']);
      var args = console.error.argsForCall[0];

      expect(renderedMarkup.length).toBe(1);
      expect(renderedMarkup[0].nodeName).toBe('P');

      expect(console.error.argsForCall.length).toBe(1);

      expect(args.length).toBe(2);
      expect(args[0]).toBe('Danger: Discarding unexpected node:');
      expect(args[1].nodeName).toBe('P');
    });
  });

});
