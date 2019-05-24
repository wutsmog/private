/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

let babel = require('babel-core');
let freshPlugin = require('react-fresh/babel');

function transform(input, options = {}) {
  return babel.transform(input, {
    babelrc: false,
    plugins: ['syntax-jsx', freshPlugin],
  }).code;
}

describe('ReactFreshBabelPlugin', () => {
  it('registers top-level function declarations', () => {
    // Hello and Bar should be registered, handleClick shouldn't.
    expect(
      transform(`
        function Hello() {
          function handleClick() {}
          return <h1 onClick={handleClick}>Hi</h1>;
        }

        function Bar() {
          return <Hello />;
        }
    `),
    ).toMatchSnapshot();
  });

  it('registers top-level exported function declarations', () => {
    expect(
      transform(`
        export function Hello() {
          function handleClick() {}
          return <h1 onClick={handleClick}>Hi</h1>;
        }

        export default function Bar() {
          return <Hello />;
        }

        function Baz() {
          return <h1>OK</h1>;
        }

        const NotAComp = 'hi';
        export { Baz, NotAComp };

        export function sum() {}
        export const Bad = 42;
    `),
    ).toMatchSnapshot();
  });

  it('registers top-level exported named arrow functions', () => {
    expect(
      transform(`
        export const Hello = () => {
          function handleClick() {}
          return <h1 onClick={handleClick}>Hi</h1>;
        };

        export let Bar = (props) => <Hello />;

        export default () => {
          // This one should be ignored.
          // You should name your components.
          return <Hello />;
        };
    `),
    ).toMatchSnapshot();
  });

  it('uses original function declaration if it get reassigned', () => {
    // This should register the original version.
    // TODO: in the future, we may *also* register the wrapped one.
    expect(
      transform(`
        function Hello() {
          return <h1>Hi</h1>;
        }
        Hello = connect(Hello);
    `),
    ).toMatchSnapshot();
  });

  it('only registers pascal case functions', () => {
    // Should not get registered.
    expect(
      transform(`
        function hello() {
          return 2 * 2;
        }
    `),
    ).toMatchSnapshot();
  });

  it('registers top-level variable declarations with function expressions', () => {
    // Hello and Bar should be registered; handleClick, sum, Baz, and Qux shouldn't.
    expect(
      transform(`
        let Hello = function() {
          function handleClick() {}
          return <h1 onClick={handleClick}>Hi</h1>;
        };
        const Bar = function Baz() {
          return <Hello />;
        };
        function sum() {}
        let Baz = 10;
        var Qux;
    `),
    ).toMatchSnapshot();
  });

  it('registers top-level variable declarations with arrow functions', () => {
    // Hello, Bar, and Baz should be registered; handleClick and sum shouldn't.
    expect(
      transform(`
        let Hello = () => {
          const handleClick = () => {};
          return <h1 onClick={handleClick}>Hi</h1>;
        }
        const Bar = () => {
          return <Hello />;
        };
        var Baz = () => <div />;
        var sum = () => {};
    `),
    ).toMatchSnapshot();
  });

  it('ignores HOC definitions', () => {
    // TODO: we might want to handle HOCs at usage site, however.
    // TODO: it would be nice if we could always avoid registering
    // a function that is known to return a function or other non-node.
    expect(
      transform(`
        let connect = () => {
          function Comp() {
            const handleClick = () => {};
            return <h1 onClick={handleClick}>Hi</h1>;
          }
          return Comp;
        };
        function withRouter() {
          return function Child() {
            const handleClick = () => {};
            return <h1 onClick={handleClick}>Hi</h1>;
          }
        };
    `),
    ).toMatchSnapshot();
  });

  it('ignores complex definitions', () => {
    expect(
      transform(`
        let A = foo ? () => {
          return <h1>Hi</h1>;
        } : null
        const B = (function Foo() {
          return <h1>Hi</h1>;
        })();
        let C = () => () => {
          return <h1>Hi</h1>;
        };
        let D = bar && (() => {
          return <h1>Hi</h1>;
        });
    `),
    ).toMatchSnapshot();
  });

  it('ignores unnamed function declarations', () => {
    expect(
      transform(`
        export default function() {}
    `),
    ).toMatchSnapshot();
  });

  it('registers likely HOCs with inline functions', () => {
    expect(
      transform(`
        const A = forwardRef(function() {
          return <h1>Foo</h1>;
        });
        const B = memo(React.forwardRef(() => {
          return <h1>Foo</h1>;
        }));
        export default React.memo(forwardRef((props, ref) => {
          return <h1>Foo</h1>;
        }));
    `),
    ).toMatchSnapshot();
    expect(
      transform(`
        export default React.memo(forwardRef(function (props, ref) {
          return <h1>Foo</h1>;
        }));
    `),
    ).toMatchSnapshot();
    expect(
      transform(`
        export default React.memo(forwardRef(function Named(props, ref) {
          return <h1>Foo</h1>;
        }));
    `),
    ).toMatchSnapshot();
  });

  it('ignores higher-order functions that are not HOCs', () => {
    expect(
      transform(`
        const throttledAlert = throttle(function() {
          alert('Hi');
        });
        const TooComplex = (function() { return hello })(() => {});
        if (cond) {
          const Foo = thing(() => {});
        }
    `),
    ).toMatchSnapshot();
  });

  it('registers identifiers used in JSX at definition site', () => {
    // When in doubt, register variables that were used in JSX.
    // Foo, Header, and B get registered.
    // A doesn't get registered because it's not declared locally.
    // Alias doesn't get registered because its definition is just an identifier.
    expect(
      transform(`
        import A from './A';
        import Store from './Store';

        Store.subscribe();

        const Header = styled.div\`color: red\`
        const Factory = funny.factory\`\`;

        let Alias1 = A;
        let Alias2 = A.Foo;
        const Dict = {};

        function Foo() {
          return (
            <div><A /><B /><Alias1 /><Alias2 /><Header /><Dict.X /></div>
          );
        }

        const B = hoc(A);
        const NotAComponent = wow(A);
    `),
    ).toMatchSnapshot();
  });

  it('registers identifiers used in React.createElement at definition site', () => {
    // When in doubt, register variables that were used in JSX.
    // Foo, Header, and B get registered.
    // A doesn't get registered because it's not declared locally.
    // Alias doesn't get registered because its definition is just an identifier.
    expect(
      transform(`
        import A from './A';
        import Store from './Store';

        Store.subscribe();

        const Header = styled.div\`color: red\`
        const Factory = funny.factory\`\`;

        let Alias1 = A;
        let Alias2 = A.Foo;
        const Dict = {};

        function Foo() {
          return [
            React.createElement(A),
            React.createElement(B),
            React.createElement(Alias1),
            React.createElement(Alias2),
            jsx(Header),
            React.createElement(Dict.X),
          ];
        }

        React.createContext(Store);

        const B = hoc(A);
        const NotAComponent = wow(A);
    `),
    ).toMatchSnapshot();
  });
});
