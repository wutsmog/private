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

var React = require('react');
var ReactDOM = require('react-dom');
var ReactTestUtils = require('react-dom/test-utils');
// TODO: can we express this test with only public API?
var inputValueTracking = require('inputValueTracking');

describe('inputValueTracking', () => {
  var input, checkbox, mockComponent;

  beforeEach(() => {
    input = document.createElement('input');
    input.type = 'text';
    checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    mockComponent = {_hostNode: input, _wrapperState: {}};
  });

  it('should attach tracker to wrapper state', () => {
    inputValueTracking.track(mockComponent);

    expect(mockComponent._wrapperState.hasOwnProperty('valueTracker')).toBe(
      true,
    );
  });

  it('should define `value` on the instance node', () => {
    inputValueTracking.track(mockComponent);

    expect(input.hasOwnProperty('value')).toBe(true);
  });

  it('should define `checked` on the instance node', () => {
    mockComponent._hostNode = checkbox;
    inputValueTracking.track(mockComponent);

    expect(checkbox.hasOwnProperty('checked')).toBe(true);
  });

  it('should initialize with the current value', () => {
    input.value = 'foo';

    inputValueTracking.track(mockComponent);

    var tracker = mockComponent._wrapperState.valueTracker;

    expect(tracker.getValue()).toEqual('foo');
  });

  it('should initialize with the current `checked`', () => {
    mockComponent._hostNode = checkbox;
    checkbox.checked = true;
    inputValueTracking.track(mockComponent);

    var tracker = mockComponent._wrapperState.valueTracker;

    expect(tracker.getValue()).toEqual('true');
  });

  it('should track value changes', () => {
    input.value = 'foo';

    inputValueTracking.track(mockComponent);

    var tracker = mockComponent._wrapperState.valueTracker;

    input.value = 'bar';
    expect(tracker.getValue()).toEqual('bar');
  });

  it('should tracked`checked` changes', () => {
    mockComponent._hostNode = checkbox;
    checkbox.checked = true;
    inputValueTracking.track(mockComponent);

    var tracker = mockComponent._wrapperState.valueTracker;

    checkbox.checked = false;
    expect(tracker.getValue()).toEqual('false');
  });

  it('should update value manually', () => {
    input.value = 'foo';
    inputValueTracking.track(mockComponent);

    var tracker = mockComponent._wrapperState.valueTracker;

    tracker.setValue('bar');
    expect(tracker.getValue()).toEqual('bar');
  });

  it('should coerce value to a string', () => {
    input.value = 'foo';
    inputValueTracking.track(mockComponent);

    var tracker = mockComponent._wrapperState.valueTracker;

    tracker.setValue(500);
    expect(tracker.getValue()).toEqual('500');
  });

  it('should update value if it changed and return result', () => {
    inputValueTracking.track(mockComponent);
    input.value = 'foo';

    var tracker = mockComponent._wrapperState.valueTracker;

    expect(inputValueTracking.updateValueIfChanged(mockComponent)).toBe(false);

    tracker.setValue('bar');

    expect(inputValueTracking.updateValueIfChanged(mockComponent)).toBe(true);

    expect(tracker.getValue()).toEqual('foo');
  });

  it('should track value and return true when updating untracked instance', () => {
    input.value = 'foo';

    expect(inputValueTracking.updateValueIfChanged(mockComponent)).toBe(true);

    var tracker = mockComponent._wrapperState.valueTracker;
    expect(tracker.getValue()).toEqual('foo');
  });

  it('should return tracker from node', () => {
    var div = document.createElement('div');
    var node = ReactDOM.render(<input type="text" defaultValue="foo" />, div);
    var tracker = inputValueTracking._getTrackerFromNode(node);
    expect(tracker.getValue()).toEqual('foo');
  });

  it('should stop tracking', () => {
    inputValueTracking.track(mockComponent);

    expect(mockComponent._wrapperState.valueTracker).not.toEqual(null);

    inputValueTracking.stopTracking(mockComponent);

    expect(mockComponent._wrapperState.valueTracker).toEqual(null);

    expect(input.hasOwnProperty('value')).toBe(false);
  });

  it('does not crash for nodes with custom value property', () => {
    // https://github.com/facebook/react/issues/10196
    try {
      var originalCreateElement = document.createElement;
      document.createElement = function() {
        var node = originalCreateElement.apply(this, arguments);
        Object.defineProperty(node, 'value', {
          get() {},
          set() {},
        });
        return node;
      };
      var div = document.createElement('div');
      // Mount
      var node = ReactDOM.render(<input type="text" />, div);
      // Update
      ReactDOM.render(<input type="text" />, div);
      // Change
      ReactTestUtils.SimulateNative.change(node);
      // Unmount
      ReactDOM.unmountComponentAtNode(div);
    } finally {
      document.createElement = originalCreateElement;
    }
  });
});
