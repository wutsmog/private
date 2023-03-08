/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

let act;
let React;
let ReactDOMClient;
let JSResourceReferenceImpl;
let ReactDOMFlightRelayServer;
let ReactDOMFlightRelayClient;
let SuspenseList;

describe('ReactFlightDOMRelay', () => {
  beforeEach(() => {
    jest.resetModules();

    act = require('internal-test-utils').act;
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    ReactDOMFlightRelayServer = require('react-server-dom-relay/server');
    ReactDOMFlightRelayClient = require('react-server-dom-relay');
    JSResourceReferenceImpl = require('JSResourceReferenceImpl');
    if (gate(flags => flags.enableSuspenseList)) {
      SuspenseList = React.SuspenseList;
    }
  });

  function readThrough(data) {
    const response = ReactDOMFlightRelayClient.createResponse();
    for (let i = 0; i < data.length; i++) {
      const chunk = data[i];
      ReactDOMFlightRelayClient.resolveRow(response, chunk);
    }
    ReactDOMFlightRelayClient.close(response);
    const promise = ReactDOMFlightRelayClient.getRoot(response);
    let model;
    let error;
    promise.then(
      m => (model = m),
      e => (error = e),
    );
    if (error) {
      throw error;
    }
    return model;
  }

  it('can render a Server Component', () => {
    function Bar({text}) {
      return text.toUpperCase();
    }
    function Foo() {
      return {
        bar: (
          <div>
            <Bar text="a" />, <Bar text="b" />
          </div>
        ),
      };
    }
    const transport = [];
    ReactDOMFlightRelayServer.render(
      {
        foo: <Foo />,
      },
      transport,
    );

    const model = readThrough(transport);
    expect(model).toEqual({
      foo: {
        bar: (
          <div>
            {'A'}
            {', '}
            {'B'}
          </div>
        ),
      },
    });
  });

  it('can render a Client Component using a module reference and render there', async () => {
    function UserClient(props) {
      return (
        <span>
          {props.greeting}, {props.name}
        </span>
      );
    }
    const User = new JSResourceReferenceImpl(UserClient);

    function Greeting({firstName, lastName}) {
      return <User greeting="Hello" name={firstName + ' ' + lastName} />;
    }

    const model = {
      greeting: <Greeting firstName="Seb" lastName="Smith" />,
    };

    const transport = [];
    ReactDOMFlightRelayServer.render(model, transport);

    const modelClient = readThrough(transport);

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(modelClient.greeting);
    });

    expect(container.innerHTML).toEqual('<span>Hello, Seb Smith</span>');
  });

  // @gate enableSuspenseList
  it('can reasonably handle different element types', () => {
    const {forwardRef, memo, Fragment, StrictMode, Profiler, Suspense} = React;

    const Inner = memo(
      forwardRef((props, ref) => {
        return <div ref={ref}>{'Hello ' + props.name}</div>;
      }),
    );

    function Foo() {
      return {
        bar: (
          <div>
            <Fragment>Fragment child</Fragment>
            <Profiler>Profiler child</Profiler>
            <StrictMode>StrictMode child</StrictMode>
            <Suspense fallback="Loading...">Suspense child</Suspense>
            <SuspenseList fallback="Loading...">
              {'SuspenseList row 1'}
              {'SuspenseList row 2'}
            </SuspenseList>
            <Inner name="world" />
          </div>
        ),
      };
    }
    const transport = [];
    ReactDOMFlightRelayServer.render(
      {
        foo: <Foo />,
      },
      transport,
    );

    const model = readThrough(transport);
    expect(model).toEqual({
      foo: {
        bar: (
          <div>
            Fragment child
            <Profiler>Profiler child</Profiler>
            <StrictMode>StrictMode child</StrictMode>
            <Suspense fallback="Loading...">Suspense child</Suspense>
            <SuspenseList fallback="Loading...">
              {'SuspenseList row 1'}
              {'SuspenseList row 2'}
            </SuspenseList>
            <div>Hello world</div>
          </div>
        ),
      },
    });
  });

  it('can handle a subset of Hooks', () => {
    const {useMemo, useCallback} = React;
    function Inner({x}) {
      const foo = useMemo(() => x + x, [x]);
      const bar = useCallback(() => 10 + foo, [foo]);
      return bar();
    }

    function Foo() {
      return {
        bar: <Inner x={2} />,
      };
    }
    const transport = [];
    ReactDOMFlightRelayServer.render(
      {
        foo: <Foo />,
      },
      transport,
    );

    const model = readThrough(transport);
    expect(model).toEqual({
      foo: {
        bar: 14,
      },
    });
  });

  it('can handle a subset of Hooks, with element as root', () => {
    const {useMemo, useCallback} = React;
    function Inner({x}) {
      const foo = useMemo(() => x + x, [x]);
      const bar = useCallback(() => 10 + foo, [foo]);
      return bar();
    }

    function Foo() {
      return <Inner x={2} />;
    }
    const transport = [];
    ReactDOMFlightRelayServer.render(<Foo />, transport);

    const model = readThrough(transport);
    expect(model).toEqual(14);
  });

  it('should warn in DEV if a class instance polyfill is passed to a host component', () => {
    function Bar() {}

    function Foo() {}
    Foo.prototype = Object.create(Bar.prototype);
    // This is enumerable which some polyfills do.
    Foo.prototype.constructor = Foo;
    Foo.prototype.method = function () {};

    expect(() => {
      const transport = [];
      ReactDOMFlightRelayServer.render(<input value={new Foo()} />, transport);
      readThrough(transport);
    }).toErrorDev(
      'Only plain objects can be passed to Client Components from Server Components. ',
      {withoutStack: true},
    );
  });
});
