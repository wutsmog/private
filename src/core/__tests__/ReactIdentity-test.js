/**
 * Copyright 2013 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @jsx React.DOM
 * @emails react-core
 */

"use strict";

var React;
var ReactTestUtils;
var reactComponentExpect;
var ReactID;

describe('ReactIdentity', function() {

  beforeEach(function() {
    require('mock-modules').dumpCache();
    React = require('React');
    ReactTestUtils = require('ReactTestUtils');
    reactComponentExpect = require('reactComponentExpect');
    ReactID = require('ReactID');
  });

  var idExp = /^\.reactRoot\[\d+\](.*)$/;
  function checkId(child, expectedId) {
    var actual = idExp.exec(ReactID.getID(child));
    var expected = idExp.exec(expectedId);
    expect(actual).toBeTruthy();
    expect(expected).toBeTruthy();
    expect(actual[1]).toEqual(expected[1]);
  }

  it('should allow keyed objects to express identity', function() {
    var instance =
      <div>
        {{
          first: <div />,
          second: <div />
        }}
      </div>;

    React.renderComponent(instance, document.createElement('div'));
    var node = instance.getDOMNode();
    reactComponentExpect(instance).toBeDOMComponentWithChildCount(2);
    checkId(node.childNodes[0], '.reactRoot[0].[0]{first}');
    checkId(node.childNodes[1], '.reactRoot[0].[0]{second}');
  });

  it('should allow key property to express identity', function() {
    var instance =
      <div>
        <div key="apple" />
        <div key="banana" />
        <div key={0} />
        <div key={123} />
      </div>;

    React.renderComponent(instance, document.createElement('div'));
    var node = instance.getDOMNode();
    reactComponentExpect(instance).toBeDOMComponentWithChildCount(4);
    checkId(node.childNodes[0], '.reactRoot[0].[0:apple]');
    checkId(node.childNodes[1], '.reactRoot[0].[0:banana]');
    checkId(node.childNodes[2], '.reactRoot[0].[0:0]');
    checkId(node.childNodes[3], '.reactRoot[0].[0:123]');
  });

  it('should use instance identity', function() {

    var Wrapper = React.createClass({
      render: function() {
        return <a key="i_get_overwritten">{this.props.children}</a>;
      }
    });

    var instance =
      <div>
        <Wrapper key="wrap1"><span key="squirrel" /></Wrapper>
        <Wrapper key="wrap2"><span key="bunny" /></Wrapper>
        <Wrapper><span key="chipmunk" /></Wrapper>
      </div>;

    React.renderComponent(instance, document.createElement('div'));
    var node = instance.getDOMNode();
    reactComponentExpect(instance).toBeDOMComponentWithChildCount(3);
    checkId(node.childNodes[0], '.reactRoot[0].[0:wrap1]');
    checkId(
      node.childNodes[0].firstChild,
      '.reactRoot[0].[0:wrap1].[0:squirrel]'
    );
    checkId(node.childNodes[1], '.reactRoot[0].[0:wrap2]');
    checkId(node.childNodes[1].firstChild, '.reactRoot[0].[0:wrap2].[0:bunny]');
    checkId(node.childNodes[2], '.reactRoot[0].[0:2]');
    checkId(node.childNodes[2].firstChild, '.reactRoot[0].[0:2].[0:chipmunk]');
  });

  it('should let restructured components retain their uniqueness', function() {
    var instance0 = <span />;
    var instance1 = <span />;
    var instance2 = <span />;

    var TestComponent = React.createClass({
      render: function() {
        return (
          <div>
            {instance2}
            {this.props.children[0]}
            {this.props.children[1]}
          </div>
        );
      }
    });

    var TestContainer = React.createClass({

      render: function() {
        return <TestComponent>{instance0} {instance1}</TestComponent>;
      }

    });

    expect(function() {

      React.renderComponent(<TestContainer />, document.createElement('div'));

    }).not.toThrow();
  });

  it('should let nested restructures retain their uniqueness', function() {
    var instance0 = <span />;
    var instance1 = <span />;
    var instance2 = <span />;

    var TestComponent = React.createClass({
      render: function() {
        return (
          <div>
            {instance2}
            {this.props.children[0]}
            {this.props.children[1]}
          </div>
        );
      }
    });

    var TestContainer = React.createClass({

      render: function() {
        return (
          <div>
            <TestComponent>{instance0} {instance1}</TestComponent>
          </div>
        );
      }

    });

    expect(function() {

      React.renderComponent(<TestContainer />, document.createElement('div'));

    }).not.toThrow();
  });

  it('should let text nodes retain their uniqueness', function() {
    var TestComponent = React.createClass({
      render: function() {
        return <div>{this.props.children}<span /></div>;
      }
    });

    var TestContainer = React.createClass({

      render: function() {
        return (
          <TestComponent>
            <div />
            {'second'}
          </TestComponent>
        );
      }

    });

    expect(function() {

      React.renderComponent(<TestContainer />, document.createElement('div'));

    }).not.toThrow();
  });

  it('should retain keys during updates in composite components', function() {

    var TestComponent = React.createClass({
      render: function() {
        return <div>{this.props.children}</div>;
      }
    });

    var TestContainer = React.createClass({

      getInitialState: function() {
        return { swapped: false };
      },

      swap: function() {
        this.setState({ swapped: true });
      },

      render: function() {
        return (
          <TestComponent>
            {this.state.swapped ? this.props.second : this.props.first}
            {this.state.swapped ? this.props.first : this.props.second}
          </TestComponent>
        );
      }

    });

    var instance0 = <span key="A" />;
    var instance1 = <span key="B" />;

    var wrapped = <TestContainer first={instance0} second={instance1} />;

    React.renderComponent(wrapped, document.createElement('div'));

    var beforeKey = wrapped
      ._renderedComponent
      ._renderedComponent
      .props.children[0]._key;

    wrapped.swap();

    var afterKey = wrapped
      ._renderedComponent
      ._renderedComponent
      .props.children[0]._key;

    expect(beforeKey).not.toEqual(afterKey);

  });

});
