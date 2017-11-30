/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

var EventPluginHub;
var EventPluginRegistry;
var React;
var ReactDOM;
var ReactDOMComponentTree;
var ReactBrowserEventEmitter;
var ReactTestUtils;

var idCallOrder;
var recordID = function(id) {
  idCallOrder.push(id);
};
var recordIDAndStopPropagation = function(id, event) {
  recordID(id);
  event.stopPropagation();
};
var recordIDAndReturnFalse = function(id, event) {
  recordID(id);
  return false;
};
var LISTENER = jest.fn();
var ON_CLICK_KEY = 'onClick';
var ON_CHANGE_KEY = 'onChange';
var ON_MOUSE_ENTER_KEY = 'onMouseEnter';

var GRANDPARENT;
var PARENT;
var CHILD;

var getListener;
var putListener;
var deleteAllListeners;

function registerSimpleTestHandler() {
  putListener(CHILD, ON_CLICK_KEY, LISTENER);
  var listener = getListener(CHILD, ON_CLICK_KEY);
  expect(listener).toEqual(LISTENER);
  return getListener(CHILD, ON_CLICK_KEY);
}

describe('ReactBrowserEventEmitter', () => {
  beforeEach(() => {
    jest.resetModules();
    LISTENER.mockClear();

    // TODO: can we express this test with only public API?
    EventPluginHub = require('events/EventPluginHub');
    EventPluginRegistry = require('events/EventPluginRegistry');
    React = require('react');
    ReactDOM = require('react-dom');
    ReactDOMComponentTree = require('../client/ReactDOMComponentTree');
    ReactBrowserEventEmitter = require('../events/ReactBrowserEventEmitter');
    ReactTestUtils = require('react-dom/test-utils');

    var container = document.createElement('div');

    var GRANDPARENT_PROPS = {};
    var PARENT_PROPS = {};
    var CHILD_PROPS = {};

    function Child(props) {
      return <div ref={c => (CHILD = c)} {...props} />;
    }

    class ChildWrapper extends React.PureComponent {
      render() {
        return <Child {...this.props} />;
      }
    }

    function renderTree() {
      ReactDOM.render(
        <div ref={c => (GRANDPARENT = c)} {...GRANDPARENT_PROPS}>
          <div ref={c => (PARENT = c)} {...PARENT_PROPS}>
            <ChildWrapper {...CHILD_PROPS} />
          </div>
        </div>,
        container,
      );
    }

    renderTree();

    getListener = function(node, eventName) {
      var inst = ReactDOMComponentTree.getInstanceFromNode(node);
      return EventPluginHub.getListener(inst, eventName);
    };
    putListener = function(node, eventName, listener) {
      switch (node) {
        case CHILD:
          CHILD_PROPS[eventName] = listener;
          break;
        case PARENT:
          PARENT_PROPS[eventName] = listener;
          break;
        case GRANDPARENT:
          GRANDPARENT_PROPS[eventName] = listener;
          break;
      }
      // Rerender with new event listeners
      renderTree();
    };
    deleteAllListeners = function(node) {
      switch (node) {
        case CHILD:
          CHILD_PROPS = {};
          break;
        case PARENT:
          PARENT_PROPS = {};
          break;
        case GRANDPARENT:
          GRANDPARENT_PROPS = {};
          break;
      }
      renderTree();
    };

    idCallOrder = [];
  });

  it('should store a listener correctly', () => {
    registerSimpleTestHandler();
    var listener = getListener(CHILD, ON_CLICK_KEY);
    expect(listener).toBe(LISTENER);
  });

  it('should retrieve a listener correctly', () => {
    registerSimpleTestHandler();
    var listener = getListener(CHILD, ON_CLICK_KEY);
    expect(listener).toEqual(LISTENER);
  });

  it('should clear all handlers when asked to', () => {
    registerSimpleTestHandler();
    deleteAllListeners(CHILD);
    var listener = getListener(CHILD, ON_CLICK_KEY);
    expect(listener).toBe(undefined);
  });

  it('should invoke a simple handler registered on a node', () => {
    registerSimpleTestHandler();
    ReactTestUtils.Simulate.click(CHILD);
    expect(LISTENER.mock.calls.length).toBe(1);
  });

  it('should not invoke handlers if ReactBrowserEventEmitter is disabled', () => {
    registerSimpleTestHandler();
    ReactBrowserEventEmitter.setEnabled(false);
    ReactTestUtils.SimulateNative.click(CHILD);
    expect(LISTENER.mock.calls.length).toBe(0);
    ReactBrowserEventEmitter.setEnabled(true);
    ReactTestUtils.SimulateNative.click(CHILD);
    expect(LISTENER.mock.calls.length).toBe(1);
  });

  it('should bubble simply', () => {
    putListener(CHILD, ON_CLICK_KEY, recordID.bind(null, CHILD));
    putListener(PARENT, ON_CLICK_KEY, recordID.bind(null, PARENT));
    putListener(GRANDPARENT, ON_CLICK_KEY, recordID.bind(null, GRANDPARENT));
    ReactTestUtils.Simulate.click(CHILD);
    expect(idCallOrder.length).toBe(3);
    expect(idCallOrder[0]).toBe(CHILD);
    expect(idCallOrder[1]).toBe(PARENT);
    expect(idCallOrder[2]).toBe(GRANDPARENT);
  });

  it('should bubble to the right handler after an update', () => {
    putListener(GRANDPARENT, ON_CLICK_KEY, recordID.bind(null, 'GRANDPARENT'));
    putListener(PARENT, ON_CLICK_KEY, recordID.bind(null, 'PARENT'));
    putListener(CHILD, ON_CLICK_KEY, recordID.bind(null, 'CHILD'));
    ReactTestUtils.Simulate.click(CHILD);
    expect(idCallOrder).toEqual(['CHILD', 'PARENT', 'GRANDPARENT']);

    idCallOrder = [];

    // Update just the grand parent without updating the child.
    putListener(
      GRANDPARENT,
      ON_CLICK_KEY,
      recordID.bind(null, 'UPDATED_GRANDPARENT'),
    );

    ReactTestUtils.Simulate.click(CHILD);
    expect(idCallOrder).toEqual(['CHILD', 'PARENT', 'UPDATED_GRANDPARENT']);
  });

  it('should continue bubbling if an error is thrown', () => {
    putListener(CHILD, ON_CLICK_KEY, recordID.bind(null, CHILD));
    putListener(PARENT, ON_CLICK_KEY, function() {
      recordID(PARENT);
      throw new Error('Handler interrupted');
    });
    putListener(GRANDPARENT, ON_CLICK_KEY, recordID.bind(null, GRANDPARENT));
    expect(function() {
      ReactTestUtils.Simulate.click(CHILD);
    }).toThrow();
    expect(idCallOrder.length).toBe(3);
    expect(idCallOrder[0]).toBe(CHILD);
    expect(idCallOrder[1]).toBe(PARENT);
    expect(idCallOrder[2]).toBe(GRANDPARENT);
  });

  it('should set currentTarget', () => {
    putListener(CHILD, ON_CLICK_KEY, function(event) {
      recordID(CHILD);
      expect(event.currentTarget).toBe(CHILD);
    });
    putListener(PARENT, ON_CLICK_KEY, function(event) {
      recordID(PARENT);
      expect(event.currentTarget).toBe(PARENT);
    });
    putListener(GRANDPARENT, ON_CLICK_KEY, function(event) {
      recordID(GRANDPARENT);
      expect(event.currentTarget).toBe(GRANDPARENT);
    });
    ReactTestUtils.Simulate.click(CHILD);
    expect(idCallOrder.length).toBe(3);
    expect(idCallOrder[0]).toBe(CHILD);
    expect(idCallOrder[1]).toBe(PARENT);
    expect(idCallOrder[2]).toBe(GRANDPARENT);
  });

  it('should support stopPropagation()', () => {
    putListener(CHILD, ON_CLICK_KEY, recordID.bind(null, CHILD));
    putListener(
      PARENT,
      ON_CLICK_KEY,
      recordIDAndStopPropagation.bind(null, PARENT),
    );
    putListener(GRANDPARENT, ON_CLICK_KEY, recordID.bind(null, GRANDPARENT));
    ReactTestUtils.Simulate.click(CHILD);
    expect(idCallOrder.length).toBe(2);
    expect(idCallOrder[0]).toBe(CHILD);
    expect(idCallOrder[1]).toBe(PARENT);
  });

  it('should support overriding .isPropagationStopped()', () => {
    // Ew. See D4504876.
    putListener(CHILD, ON_CLICK_KEY, recordID.bind(null, CHILD));
    putListener(PARENT, ON_CLICK_KEY, function(e) {
      recordID(PARENT, e);
      // This stops React bubbling but avoids touching the native event
      e.isPropagationStopped = () => true;
    });
    putListener(GRANDPARENT, ON_CLICK_KEY, recordID.bind(null, GRANDPARENT));
    ReactTestUtils.Simulate.click(CHILD);
    expect(idCallOrder.length).toBe(2);
    expect(idCallOrder[0]).toBe(CHILD);
    expect(idCallOrder[1]).toBe(PARENT);
  });

  it('should stop after first dispatch if stopPropagation', () => {
    putListener(
      CHILD,
      ON_CLICK_KEY,
      recordIDAndStopPropagation.bind(null, CHILD),
    );
    putListener(PARENT, ON_CLICK_KEY, recordID.bind(null, PARENT));
    putListener(GRANDPARENT, ON_CLICK_KEY, recordID.bind(null, GRANDPARENT));
    ReactTestUtils.Simulate.click(CHILD);
    expect(idCallOrder.length).toBe(1);
    expect(idCallOrder[0]).toBe(CHILD);
  });

  it('should not stopPropagation if false is returned', () => {
    putListener(CHILD, ON_CLICK_KEY, recordIDAndReturnFalse.bind(null, CHILD));
    putListener(PARENT, ON_CLICK_KEY, recordID.bind(null, PARENT));
    putListener(GRANDPARENT, ON_CLICK_KEY, recordID.bind(null, GRANDPARENT));
    spyOnDev(console, 'error');
    ReactTestUtils.Simulate.click(CHILD);
    expect(idCallOrder.length).toBe(3);
    expect(idCallOrder[0]).toBe(CHILD);
    expect(idCallOrder[1]).toBe(PARENT);
    expect(idCallOrder[2]).toBe(GRANDPARENT);
    if (__DEV__) {
      expect(console.error.calls.count()).toEqual(0);
    }
  });

  /**
   * The entire event registration state of the world should be "locked-in" at
   * the time the event occurs. This is to resolve many edge cases that come
   * about from a listener on a lower-in-DOM node causing structural changes at
   * places higher in the DOM. If this lower-in-DOM node causes new content to
   * be rendered at a place higher-in-DOM, we need to be careful not to invoke
   * these new listeners.
   */

  it('should invoke handlers that were removed while bubbling', () => {
    var handleParentClick = jest.fn();
    var handleChildClick = function(event) {
      deleteAllListeners(PARENT);
    };
    putListener(CHILD, ON_CLICK_KEY, handleChildClick);
    putListener(PARENT, ON_CLICK_KEY, handleParentClick);
    ReactTestUtils.Simulate.click(CHILD);
    expect(handleParentClick.mock.calls.length).toBe(1);
  });

  it('should not invoke newly inserted handlers while bubbling', () => {
    var handleParentClick = jest.fn();
    var handleChildClick = function(event) {
      putListener(PARENT, ON_CLICK_KEY, handleParentClick);
    };
    putListener(CHILD, ON_CLICK_KEY, handleChildClick);
    ReactTestUtils.Simulate.click(CHILD);
    expect(handleParentClick.mock.calls.length).toBe(0);
  });

  it('should have mouse enter simulated by test utils', () => {
    putListener(CHILD, ON_MOUSE_ENTER_KEY, recordID.bind(null, CHILD));
    ReactTestUtils.Simulate.mouseEnter(CHILD);
    expect(idCallOrder.length).toBe(1);
    expect(idCallOrder[0]).toBe(CHILD);
  });

  it('should listen to events only once', () => {
    spyOnDevAndProd(EventTarget.prototype, 'addEventListener');
    ReactBrowserEventEmitter.listenTo(ON_CLICK_KEY, document);
    ReactBrowserEventEmitter.listenTo(ON_CLICK_KEY, document);
    expect(EventTarget.prototype.addEventListener.calls.count()).toBe(1);
  });

  it('should work with event plugins without dependencies', () => {
    spyOnDevAndProd(EventTarget.prototype, 'addEventListener');

    ReactBrowserEventEmitter.listenTo(ON_CLICK_KEY, document);

    expect(EventTarget.prototype.addEventListener.calls.argsFor(0)[0]).toBe(
      'click',
    );
  });

  it('should work with event plugins with dependencies', () => {
    spyOnDevAndProd(EventTarget.prototype, 'addEventListener');

    ReactBrowserEventEmitter.listenTo(ON_CHANGE_KEY, document);

    var setEventListeners = [];
    var listenCalls = EventTarget.prototype.addEventListener.calls.allArgs();
    for (var i = 0; i < listenCalls.length; i++) {
      setEventListeners.push(listenCalls[i][1]);
    }

    var module = EventPluginRegistry.registrationNameModules[ON_CHANGE_KEY];
    var dependencies = module.eventTypes.change.dependencies;
    expect(setEventListeners.length).toEqual(dependencies.length);

    for (i = 0; i < setEventListeners.length; i++) {
      expect(dependencies.indexOf(setEventListeners[i])).toBeTruthy();
    }
  });
});
