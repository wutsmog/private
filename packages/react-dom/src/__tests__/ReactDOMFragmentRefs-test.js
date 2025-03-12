/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails reactcore
 */

'use strict';

let React;
let ReactDOMClient;
let act;
let container;
let Fragment;
let Activity;

describe('FragmentRefs', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    Fragment = React.Fragment;
    Activity = React.unstable_Activity;
    ReactDOMClient = require('react-dom/client');
    act = require('internal-test-utils').act;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // @gate enableFragmentRefs
  it('attaches a ref to Fragment', async () => {
    const fragmentRef = React.createRef();
    const root = ReactDOMClient.createRoot(container);

    await act(() =>
      root.render(
        <div id="parent">
          <Fragment ref={fragmentRef}>
            <div id="child">Hi</div>
          </Fragment>
        </div>,
      ),
    );
    expect(container.innerHTML).toEqual(
      '<div id="parent"><div id="child">Hi</div></div>',
    );

    expect(fragmentRef.current).not.toBe(null);
  });

  // @gate enableFragmentRefs
  it('accepts a ref callback', async () => {
    let fragmentRef;
    const root = ReactDOMClient.createRoot(container);

    await act(() => {
      root.render(
        <Fragment ref={ref => (fragmentRef = ref)}>
          <div id="child">Hi</div>
        </Fragment>,
      );
    });

    expect(fragmentRef._fragmentFiber).toBeTruthy();
  });

  // @gate enableFragmentRefs
  it('is available in effects', async () => {
    function Test() {
      const fragmentRef = React.useRef(null);
      React.useLayoutEffect(() => {
        expect(fragmentRef.current).not.toBe(null);
      });
      React.useEffect(() => {
        expect(fragmentRef.current).not.toBe(null);
      });
      return (
        <Fragment ref={fragmentRef}>
          <div />
        </Fragment>
      );
    }

    const root = ReactDOMClient.createRoot(container);
    await act(() => root.render(<Test />));
  });

  describe('focus()', () => {
    // @gate enableFragmentRefs
    it('focuses the first focusable child', async () => {
      const fragmentRef = React.createRef();
      const root = ReactDOMClient.createRoot(container);

      function Test() {
        return (
          <div>
            <Fragment ref={fragmentRef}>
              <div id="child-a" />
              <style>{`#child-c {}`}</style>
              <a id="child-b" href="/">
                B
              </a>
              <a id="child-c" href="/">
                C
              </a>
            </Fragment>
          </div>
        );
      }

      await act(() => {
        root.render(<Test />);
      });

      await act(() => {
        fragmentRef.current.focus();
      });
      expect(document.activeElement.id).toEqual('child-b');
      document.activeElement.blur();
    });

    // @gate enableFragmentRefs
    it('preserves document order when adding and removing children', async () => {
      const fragmentRef = React.createRef();
      const root = ReactDOMClient.createRoot(container);

      function Test({showA, showB}) {
        return (
          <Fragment ref={fragmentRef}>
            {showA && <a href="/" id="child-a" />}
            {showB && <a href="/" id="child-b" />}
          </Fragment>
        );
      }

      // Render with A as the first focusable child
      await act(() => {
        root.render(<Test showA={true} showB={false} />);
      });
      await act(() => {
        fragmentRef.current.focus();
      });
      expect(document.activeElement.id).toEqual('child-a');
      document.activeElement.blur();
      // A is still the first focusable child, but B is also tracked
      await act(() => {
        root.render(<Test showA={true} showB={true} />);
      });
      await act(() => {
        fragmentRef.current.focus();
      });
      expect(document.activeElement.id).toEqual('child-a');
      document.activeElement.blur();

      // B is now the first focusable child
      await act(() => {
        root.render(<Test showA={false} showB={true} />);
      });
      await act(() => {
        fragmentRef.current.focus();
      });
      expect(document.activeElement.id).toEqual('child-b');
      document.activeElement.blur();
    });
  });

  describe('event listeners', () => {
    // @gate enableFragmentRefs
    it('adds and removes event listeners from children', async () => {
      const parentRef = React.createRef();
      const fragmentRef = React.createRef();
      const childARef = React.createRef();
      const childBRef = React.createRef();
      const root = ReactDOMClient.createRoot(container);

      let logs = [];

      function handleFragmentRefClicks() {
        logs.push('fragmentRef');
      }

      function Test() {
        React.useEffect(() => {
          fragmentRef.current.addEventListener(
            'click',
            handleFragmentRefClicks,
          );

          return () => {
            fragmentRef.current.removeEventListener(
              'click',
              handleFragmentRefClicks,
            );
          };
        }, []);
        return (
          <div ref={parentRef}>
            <Fragment ref={fragmentRef}>
              <>Text</>
              <div ref={childARef}>A</div>
              <>
                <div ref={childBRef}>B</div>
              </>
            </Fragment>
          </div>
        );
      }

      await act(() => {
        root.render(<Test />);
      });

      childARef.current.addEventListener('click', () => {
        logs.push('A');
      });

      childBRef.current.addEventListener('click', () => {
        logs.push('B');
      });

      // Clicking on the parent should not trigger any listeners
      parentRef.current.click();
      expect(logs).toEqual([]);

      // Clicking a child triggers its own listeners and the Fragment's
      childARef.current.click();
      expect(logs).toEqual(['fragmentRef', 'A']);

      logs = [];

      childBRef.current.click();
      expect(logs).toEqual(['fragmentRef', 'B']);

      logs = [];

      fragmentRef.current.removeEventListener('click', handleFragmentRefClicks);

      childARef.current.click();
      expect(logs).toEqual(['A']);

      logs = [];

      childBRef.current.click();
      expect(logs).toEqual(['B']);
    });

    // @gate enableFragmentRefs
    it('adds and removes event listeners from children with multiple fragments', async () => {
      const fragmentRef = React.createRef();
      const nestedFragmentRef = React.createRef();
      const nestedFragmentRef2 = React.createRef();
      const childARef = React.createRef();
      const childBRef = React.createRef();
      const childCRef = React.createRef();
      const root = ReactDOMClient.createRoot(container);

      await act(() => {
        root.render(
          <div>
            <Fragment ref={fragmentRef}>
              <div ref={childARef}>A</div>
              <div>
                <Fragment ref={nestedFragmentRef}>
                  <div ref={childBRef}>B</div>
                </Fragment>
              </div>
              <Fragment ref={nestedFragmentRef2}>
                <div ref={childCRef}>C</div>
              </Fragment>
            </Fragment>
          </div>,
        );
      });

      let logs = [];

      function handleFragmentRefClicks() {
        logs.push('fragmentRef');
      }

      function handleNestedFragmentRefClicks() {
        logs.push('nestedFragmentRef');
      }

      function handleNestedFragmentRef2Clicks() {
        logs.push('nestedFragmentRef2');
      }

      fragmentRef.current.addEventListener('click', handleFragmentRefClicks);
      nestedFragmentRef.current.addEventListener(
        'click',
        handleNestedFragmentRefClicks,
      );
      nestedFragmentRef2.current.addEventListener(
        'click',
        handleNestedFragmentRef2Clicks,
      );

      childBRef.current.click();
      // Event bubbles to the parent fragment
      expect(logs).toEqual(['nestedFragmentRef', 'fragmentRef']);

      logs = [];

      childARef.current.click();
      expect(logs).toEqual(['fragmentRef']);

      logs = [];
      childCRef.current.click();
      expect(logs).toEqual(['fragmentRef', 'nestedFragmentRef2']);

      logs = [];

      fragmentRef.current.removeEventListener('click', handleFragmentRefClicks);
      nestedFragmentRef.current.removeEventListener(
        'click',
        handleNestedFragmentRefClicks,
      );
      childCRef.current.click();
      expect(logs).toEqual(['nestedFragmentRef2']);
    });

    // @gate enableFragmentRefs
    it('adds an event listener to a newly added child', async () => {
      const fragmentRef = React.createRef();
      const childRef = React.createRef();
      const root = ReactDOMClient.createRoot(container);
      let showChild;

      function Component() {
        const [shouldShowChild, setShouldShowChild] = React.useState(false);
        showChild = () => {
          setShouldShowChild(true);
        };

        return (
          <div>
            <Fragment ref={fragmentRef}>
              <div id="a">A</div>
              {shouldShowChild && (
                <div ref={childRef} id="b">
                  B
                </div>
              )}
            </Fragment>
          </div>
        );
      }

      await act(() => {
        root.render(<Component />);
      });

      expect(fragmentRef.current).not.toBe(null);
      expect(childRef.current).toBe(null);

      let hasClicked = false;
      fragmentRef.current.addEventListener('click', () => {
        hasClicked = true;
      });

      await act(() => {
        showChild();
      });
      expect(childRef.current).not.toBe(null);

      childRef.current.click();
      expect(hasClicked).toBe(true);
    });

    // @gate enableFragmentRefs
    it('applies event listeners to host children nested within non-host children', async () => {
      const fragmentRef = React.createRef();
      const childRef = React.createRef();
      const nestedChildRef = React.createRef();
      const root = ReactDOMClient.createRoot(container);

      function Wrapper({children}) {
        return children;
      }

      await act(() => {
        root.render(
          <div>
            <Fragment ref={fragmentRef}>
              <div ref={childRef}>Host A</div>
              <Wrapper>
                <Wrapper>
                  <Wrapper>
                    <div ref={nestedChildRef}>Host B</div>
                  </Wrapper>
                </Wrapper>
              </Wrapper>
            </Fragment>
          </div>,
        );
      });
      const logs = [];
      fragmentRef.current.addEventListener('click', e => {
        logs.push(e.target.textContent);
      });

      expect(logs).toEqual([]);
      childRef.current.click();
      expect(logs).toEqual(['Host A']);
      nestedChildRef.current.click();
      expect(logs).toEqual(['Host A', 'Host B']);
    });

    // @gate enableFragmentRefs
    it('allows adding and cleaning up listeners in effects', async () => {
      const root = ReactDOMClient.createRoot(container);

      let logs = [];
      function logClick(e) {
        logs.push(e.currentTarget.id);
      }

      let rerender;
      let removeEventListeners;

      function Test() {
        const fragmentRef = React.useRef(null);
        // eslint-disable-next-line no-unused-vars
        const [_, setState] = React.useState(0);
        rerender = () => {
          setState(p => p + 1);
        };
        removeEventListeners = () => {
          fragmentRef.current.removeEventListener('click', logClick);
        };
        React.useEffect(() => {
          fragmentRef.current.addEventListener('click', logClick);

          return removeEventListeners;
        });

        return (
          <Fragment ref={fragmentRef}>
            <div id="child-a" />
          </Fragment>
        );
      }

      // The event listener was applied
      await act(() => root.render(<Test />));
      expect(logs).toEqual([]);
      document.querySelector('#child-a').click();
      expect(logs).toEqual(['child-a']);

      // The event listener can be removed and re-added
      logs = [];
      await act(rerender);
      document.querySelector('#child-a').click();
      expect(logs).toEqual(['child-a']);
    });

    // @gate enableFragmentRefs
    it('does not apply removed event listeners to new children', async () => {
      const root = ReactDOMClient.createRoot(container);
      const fragmentRef = React.createRef(null);
      function Test() {
        return (
          <Fragment ref={fragmentRef}>
            <div id="child-a" />
          </Fragment>
        );
      }

      let logs = [];
      function logClick(e) {
        logs.push(e.currentTarget.id);
      }
      await act(() => {
        root.render(<Test />);
      });
      fragmentRef.current.addEventListener('click', logClick);
      const childA = document.querySelector('#child-a');
      childA.click();
      expect(logs).toEqual(['child-a']);

      logs = [];
      fragmentRef.current.removeEventListener('click', logClick);
      childA.click();
      expect(logs).toEqual([]);
    });

    describe('with activity', () => {
      // @gate enableFragmentRefs && enableActivity
      it('does not apply event listeners to hidden trees', async () => {
        const parentRef = React.createRef();
        const fragmentRef = React.createRef();
        const root = ReactDOMClient.createRoot(container);

        function Test() {
          return (
            <div ref={parentRef}>
              <Fragment ref={fragmentRef}>
                <div>Child 1</div>
                <Activity mode="hidden">
                  <div>Child 2</div>
                </Activity>
                <div>Child 3</div>
              </Fragment>
            </div>
          );
        }

        await act(() => {
          root.render(<Test />);
        });

        const logs = [];
        fragmentRef.current.addEventListener('click', e => {
          logs.push(e.target.textContent);
        });

        const [child1, child2, child3] = parentRef.current.children;
        child1.click();
        child2.click();
        child3.click();
        expect(logs).toEqual(['Child 1', 'Child 3']);
      });

      // @gate enableFragmentRefs && enableActivity
      it('applies event listeners to visible trees', async () => {
        const parentRef = React.createRef();
        const fragmentRef = React.createRef();
        const root = ReactDOMClient.createRoot(container);

        function Test() {
          return (
            <div ref={parentRef}>
              <Fragment ref={fragmentRef}>
                <div>Child 1</div>
                <Activity mode="visible">
                  <div>Child 2</div>
                </Activity>
                <div>Child 3</div>
              </Fragment>
            </div>
          );
        }

        await act(() => {
          root.render(<Test />);
        });

        const logs = [];
        fragmentRef.current.addEventListener('click', e => {
          logs.push(e.target.textContent);
        });

        const [child1, child2, child3] = parentRef.current.children;
        child1.click();
        child2.click();
        child3.click();
        expect(logs).toEqual(['Child 1', 'Child 2', 'Child 3']);
      });

      // @gate enableFragmentRefs && enableActivity
      it('handles Activity modes switching', async () => {
        const fragmentRef = React.createRef();
        const fragmentRef2 = React.createRef();
        const parentRef = React.createRef();
        const root = ReactDOMClient.createRoot(container);

        function Test({mode}) {
          return (
            <div id="parent" ref={parentRef}>
              <Fragment ref={fragmentRef}>
                <Activity mode={mode}>
                  <div id="child1">Child</div>
                  <Fragment ref={fragmentRef2}>
                    <div id="child2">Child 2</div>
                  </Fragment>
                </Activity>
              </Fragment>
            </div>
          );
        }

        await act(() => {
          root.render(<Test mode="visible" />);
        });

        let logs = [];
        fragmentRef.current.addEventListener('click', () => {
          logs.push('clicked 1');
        });
        fragmentRef2.current.addEventListener('click', () => {
          logs.push('clicked 2');
        });
        parentRef.current.lastChild.click();
        expect(logs).toEqual(['clicked 1', 'clicked 2']);

        logs = [];
        await act(() => {
          root.render(<Test mode="hidden" />);
        });
        parentRef.current.firstChild.click();
        parentRef.current.lastChild.click();
        expect(logs).toEqual([]);

        logs = [];
        await act(() => {
          root.render(<Test mode="visible" />);
        });
        parentRef.current.lastChild.click();
        // Event order is flipped here because the nested child re-registers first
        expect(logs).toEqual(['clicked 2', 'clicked 1']);
      });
    });
  });
});
