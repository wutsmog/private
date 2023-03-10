/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

let ReactDOM;
let React;
let ReactCache;
let ReactTestRenderer;
let Scheduler;

describe('ReactTestRenderer', () => {
  beforeEach(() => {
    jest.resetModules();
    ReactDOM = require('react-dom');

    // Isolate test renderer.
    jest.resetModules();
    React = require('react');
    ReactCache = require('react-cache');
    ReactTestRenderer = require('react-test-renderer');
    Scheduler = require('scheduler');
  });

  it('should warn if used to render a ReactDOM portal', () => {
    const container = document.createElement('div');
    expect(() => {
      try {
        ReactTestRenderer.create(ReactDOM.createPortal('foo', container));
      } catch (e) {
        // TODO: After the update throws, a subsequent render is scheduled to
        // unmount the whole tree. This update also causes an error, and this
        // happens in a separate task. Flush this error now and capture it, to
        // prevent it from firing asynchronously and causing the Jest test
        // to fail.
        expect(() => Scheduler.unstable_flushAll()).toThrow(
          '.children.indexOf is not a function',
        );
      }
    }).toErrorDev('An invalid container has been provided.', {
      withoutStack: true,
    });
  });

  describe('timed out Suspense hidden subtrees should not be observable via toJSON', () => {
    let AsyncText;
    let PendingResources;
    let TextResource;

    beforeEach(() => {
      PendingResources = {};
      TextResource = ReactCache.unstable_createResource(
        text =>
          new Promise(resolve => {
            PendingResources[text] = resolve;
          }),
        text => text,
      );

      AsyncText = ({text}) => {
        const value = TextResource.read(text);
        return value;
      };
    });

    it('for root Suspense components', async () => {
      const App = ({text}) => {
        return (
          <React.Suspense fallback="fallback">
            <AsyncText text={text} />
          </React.Suspense>
        );
      };

      const root = ReactTestRenderer.create(<App text="initial" />);
      PendingResources.initial('initial');
      await Promise.resolve();
      Scheduler.unstable_flushAll();
      expect(root.toJSON()).toEqual('initial');

      root.update(<App text="dynamic" />);
      expect(root.toJSON()).toEqual('fallback');

      PendingResources.dynamic('dynamic');
      await Promise.resolve();
      Scheduler.unstable_flushAll();
      expect(root.toJSON()).toEqual('dynamic');
    });

    it('for nested Suspense components', async () => {
      const App = ({text}) => {
        return (
          <div>
            <React.Suspense fallback="fallback">
              <AsyncText text={text} />
            </React.Suspense>
          </div>
        );
      };

      const root = ReactTestRenderer.create(<App text="initial" />);
      PendingResources.initial('initial');
      await Promise.resolve();
      Scheduler.unstable_flushAll();
      expect(root.toJSON().children).toEqual(['initial']);

      root.update(<App text="dynamic" />);
      expect(root.toJSON().children).toEqual(['fallback']);

      PendingResources.dynamic('dynamic');
      await Promise.resolve();
      Scheduler.unstable_flushAll();
      expect(root.toJSON().children).toEqual(['dynamic']);
    });
  });
});
