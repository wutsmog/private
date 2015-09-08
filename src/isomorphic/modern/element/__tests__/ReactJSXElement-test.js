/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails react-core
 */

'use strict';

var React;
var ReactDOM;
var ReactTestUtils;

describe('ReactJSXElement', function() {
  var Component;

  beforeEach(function() {
    require('mock-modules').dumpCache();

    React = require('React');
    ReactDOM = require('ReactDOM');
    ReactTestUtils = require('ReactTestUtils');
    Component = class extends React.Component {
      render() {
        return <div />;
      }
    };
  });

  it('returns a complete element according to spec', function() {
    var element = <Component />;
    expect(element.type).toBe(Component);
    expect(element.key).toBe(null);
    expect(element.ref).toBe(null);
    var expectation = {};
    Object.freeze(expectation);
    expect(element.props).toEqual(expectation);
  });

  it('allows a lower-case to be passed as the string type', function() {
    var element = <div />;
    expect(element.type).toBe('div');
    expect(element.key).toBe(null);
    expect(element.ref).toBe(null);
    var expectation = {};
    Object.freeze(expectation);
    expect(element.props).toEqual(expectation);
  });

  it('allows a string to be passed as the type', function() {
    var TagName = 'div';
    var element = <TagName />;
    expect(element.type).toBe('div');
    expect(element.key).toBe(null);
    expect(element.ref).toBe(null);
    var expectation = {};
    Object.freeze(expectation);
    expect(element.props).toEqual(expectation);
  });

  it('returns an immutable element', function() {
    var element = <Component />;
    expect(() => element.type = 'div').toThrow();
  });

  it('does not reuse the object that is spread into props', function() {
    var config = {foo: 1};
    var element = <Component {...config} />;
    expect(element.props.foo).toBe(1);
    config.foo = 2;
    expect(element.props.foo).toBe(1);
  });

  it('extracts key and ref from the rest of the props', function() {
    var element = <Component key="12" ref="34" foo="56" />;
    expect(element.type).toBe(Component);
    expect(element.key).toBe('12');
    expect(element.ref).toBe('34');
    var expectation = {foo:'56'};
    Object.freeze(expectation);
    expect(element.props).toEqual(expectation);
  });

  it('coerces the key to a string', function() {
    var element = <Component key={12} foo="56" />;
    expect(element.type).toBe(Component);
    expect(element.key).toBe('12');
    expect(element.ref).toBe(null);
    var expectation = {foo:'56'};
    Object.freeze(expectation);
    expect(element.props).toEqual(expectation);
  });

  it('merges JSX children onto the children prop', function() {
    spyOn(console, 'error');
    var a = 1;
    var element = <Component children="text">{a}</Component>;
    expect(element.props.children).toBe(a);
    expect(console.error.argsForCall.length).toBe(0);
  });

  it('does not override children if no JSX children are provided', function() {
    spyOn(console, 'error');
    var element = <Component children="text" />;
    expect(element.props.children).toBe('text');
    expect(console.error.argsForCall.length).toBe(0);
  });

  it('overrides children if null is provided as a JSX child', function() {
    spyOn(console, 'error');
    var element = <Component children="text">{null}</Component>;
    expect(element.props.children).toBe(null);
    expect(console.error.argsForCall.length).toBe(0);
  });

  it('merges JSX children onto the children prop in an array', function() {
    spyOn(console, 'error');
    var a = 1;
    var b = 2;
    var c = 3;
    var element = <Component>{a}{b}{c}</Component>;
    expect(element.props.children).toEqual([1, 2, 3]);
    expect(console.error.argsForCall.length).toBe(0);
  });

  it('allows static methods to be called using the type property', function() {
    spyOn(console, 'error');

    class StaticMethodComponent {
      static someStaticMethod() {
        return 'someReturnValue';
      }
      render() {
        return <div></div>;
      }
    }

    var element = <StaticMethodComponent />;
    expect(element.type.someStaticMethod()).toBe('someReturnValue');
    expect(console.error.argsForCall.length).toBe(0);
  });

  it('identifies valid elements', function() {
    expect(React.isValidElement(<div />)).toEqual(true);
    expect(React.isValidElement(<Component />)).toEqual(true);

    expect(React.isValidElement(null)).toEqual(false);
    expect(React.isValidElement(true)).toEqual(false);
    expect(React.isValidElement({})).toEqual(false);
    expect(React.isValidElement('string')).toEqual(false);
    expect(React.isValidElement(Component)).toEqual(false);
  });

  it('is indistinguishable from a plain object', function() {
    var element = <div className="foo" />;
    var object = {};
    expect(element.constructor).toBe(object.constructor);
  });

  it('should use default prop value when removing a prop', function() {
    Component.defaultProps = {fruit: 'persimmon'};

    var container = document.createElement('div');
    var instance = ReactDOM.render(
      <Component fruit="mango" />,
      container
    );
    expect(instance.props.fruit).toBe('mango');

    ReactDOM.render(<Component />, container);
    expect(instance.props.fruit).toBe('persimmon');
  });

  it('should normalize props with default values', function() {
    class NormalizingComponent extends React.Component {
      render() {
        return <span>{this.props.prop}</span>;
      }
    }
    NormalizingComponent.defaultProps = {prop: 'testKey'};

    var instance = ReactTestUtils.renderIntoDocument(<NormalizingComponent />);
    expect(instance.props.prop).toBe('testKey');

    var inst2 =
      ReactTestUtils.renderIntoDocument(<NormalizingComponent prop={null} />);
    expect(inst2.props.prop).toBe(null);
  });

});
