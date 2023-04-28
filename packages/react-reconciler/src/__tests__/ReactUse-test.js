'use strict';

let React;
let ReactNoop;
let Scheduler;
let act;
let use;
let useDebugValue;
let useState;
let useMemo;
let useEffect;
let Suspense;
let startTransition;
let cache;
let pendingTextRequests;
let waitFor;
let waitForPaint;
let assertLog;
let waitForAll;

describe('ReactUse', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    use = React.use;
    useDebugValue = React.useDebugValue;
    useState = React.useState;
    useMemo = React.useMemo;
    useEffect = React.useEffect;
    Suspense = React.Suspense;
    startTransition = React.startTransition;
    cache = React.cache;

    const InternalTestUtils = require('internal-test-utils');
    waitForAll = InternalTestUtils.waitForAll;
    assertLog = InternalTestUtils.assertLog;
    waitForPaint = InternalTestUtils.waitForPaint;
    waitFor = InternalTestUtils.waitFor;

    pendingTextRequests = new Map();
  });

  function resolveTextRequests(text) {
    const requests = pendingTextRequests.get(text);
    if (requests !== undefined) {
      pendingTextRequests.delete(text);
      requests.forEach(resolve => resolve(text));
    }
  }

  function getAsyncText(text) {
    // getAsyncText is completely uncached — it performs a new async operation
    // every time it's called. During a transition, React should be able to
    // unwrap it anyway.
    Scheduler.log(`Async text requested [${text}]`);
    return new Promise(resolve => {
      const requests = pendingTextRequests.get(text);
      if (requests !== undefined) {
        requests.push(resolve);
        pendingTextRequests.set(text, requests);
      } else {
        pendingTextRequests.set(text, [resolve]);
      }
    });
  }

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  // This behavior was intentionally disabled to derisk the rollout of `use`.
  // It changes the behavior of old, pre-`use` Suspense implementations. We may
  // add this back; however, the plan is to migrate all existing Suspense code
  // to `use`, so the extra code probably isn't worth it.
  // @gate TODO
  test('if suspended fiber is pinged in a microtask, retry immediately without unwinding the stack', async () => {
    let fulfilled = false;
    function Async() {
      if (fulfilled) {
        return <Text text="Async" />;
      }
      Scheduler.log('Suspend!');
      throw Promise.resolve().then(() => {
        Scheduler.log('Resolve in microtask');
        fulfilled = true;
      });
    }

    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Async />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });

    assertLog([
      // React will yield when the async component suspends.
      'Suspend!',
      'Resolve in microtask',

      // Finished rendering without unwinding the stack or preparing a fallback.
      'Async',
    ]);
    expect(root).toMatchRenderedOutput('Async');
  });

  test('if suspended fiber is pinged in a microtask, it does not block a transition from completing', async () => {
    let fulfilled = false;
    function Async() {
      if (fulfilled) {
        return <Text text="Async" />;
      }
      Scheduler.log('Suspend!');
      throw Promise.resolve().then(() => {
        Scheduler.log('Resolve in microtask');
        fulfilled = true;
      });
    }

    function App() {
      return <Async />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['Suspend!', 'Resolve in microtask', 'Async']);
    expect(root).toMatchRenderedOutput('Async');
  });

  test('does not infinite loop if already fulfilled thenable is thrown', async () => {
    // An already fulfilled promise should never be thrown. Since it already
    // fulfilled, we shouldn't bother trying to render again — doing so would
    // likely lead to an infinite loop. This scenario should only happen if a
    // userspace Suspense library makes an implementation mistake.

    // Create an already fulfilled thenable
    const thenable = {
      then(ping) {},
      status: 'fulfilled',
      value: null,
    };

    let i = 0;
    function Async() {
      if (i++ > 50) {
        throw new Error('Infinite loop detected');
      }
      Scheduler.log('Suspend!');
      // This thenable should never be thrown because it already fulfilled.
      // But if it is thrown, React should handle it gracefully.
      throw thenable;
    }

    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Async />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Suspend!', 'Loading...']);
    expect(root).toMatchRenderedOutput('Loading...');
  });

  test('basic use(promise)', async () => {
    const promiseA = Promise.resolve('A');
    const promiseB = Promise.resolve('B');
    const promiseC = Promise.resolve('C');

    function Async() {
      const text = use(promiseA) + use(promiseB) + use(promiseC);
      return <Text text={text} />;
    }

    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Async />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['ABC']);
    expect(root).toMatchRenderedOutput('ABC');
  });

  test("using a promise that's not cached between attempts", async () => {
    function Async() {
      const text =
        use(Promise.resolve('A')) +
        use(Promise.resolve('B')) +
        use(Promise.resolve('C'));
      return <Text text={text} />;
    }

    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Async />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['ABC']);
    expect(root).toMatchRenderedOutput('ABC');
  });

  test('using a rejected promise will throw', async () => {
    class ErrorBoundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) {
        return {error};
      }
      render() {
        if (this.state.error) {
          return <Text text={this.state.error.message} />;
        }
        return this.props.children;
      }
    }

    const promiseA = Promise.resolve('A');
    const promiseB = Promise.reject(new Error('Oops!'));
    const promiseC = Promise.resolve('C');

    // Jest/Node will raise an unhandled rejected error unless we await this. It
    // works fine in the browser, though.
    await expect(promiseB).rejects.toThrow('Oops!');

    function Async() {
      const text = use(promiseA) + use(promiseB) + use(promiseC);
      return <Text text={text} />;
    }

    function App() {
      return (
        <ErrorBoundary>
          <Async />
        </ErrorBoundary>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['Oops!', 'Oops!']);
  });

  test('use(promise) in multiple components', async () => {
    // This tests that the state for tracking promises is reset per component.
    const promiseA = Promise.resolve('A');
    const promiseB = Promise.resolve('B');
    const promiseC = Promise.resolve('C');
    const promiseD = Promise.resolve('D');

    function Child({prefix}) {
      return <Text text={prefix + use(promiseC) + use(promiseD)} />;
    }

    function Parent() {
      return <Child prefix={use(promiseA) + use(promiseB)} />;
    }

    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Parent />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['ABCD']);
    expect(root).toMatchRenderedOutput('ABCD');
  });

  test('use(promise) in multiple sibling components', async () => {
    // This tests that the state for tracking promises is reset per component.

    const promiseA = {then: () => {}, status: 'pending', value: null};
    const promiseB = {then: () => {}, status: 'pending', value: null};
    const promiseC = {then: () => {}, status: 'fulfilled', value: 'C'};
    const promiseD = {then: () => {}, status: 'fulfilled', value: 'D'};

    function Sibling1({prefix}) {
      return <Text text={use(promiseA) + use(promiseB)} />;
    }

    function Sibling2() {
      return <Text text={use(promiseC) + use(promiseD)} />;
    }

    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Sibling1 />
          <Sibling2 />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['Loading...']);
    expect(root).toMatchRenderedOutput('Loading...');
  });

  test('erroring in the same component as an uncached promise does not result in an infinite loop', async () => {
    class ErrorBoundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) {
        return {error};
      }
      render() {
        if (this.state.error) {
          return <Text text={'Caught an error: ' + this.state.error.message} />;
        }
        return this.props.children;
      }
    }

    let i = 0;
    function Async({
      // Intentionally destrucutring a prop here so that our production error
      // stack trick is triggered at the beginning of the function
      prop,
    }) {
      if (i++ > 50) {
        throw new Error('Infinite loop detected');
      }
      try {
        use(Promise.resolve('Async'));
      } catch (e) {
        Scheduler.log('Suspend! [Async]');
        throw e;
      }
      throw new Error('Oops!');
    }

    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <ErrorBoundary>
            <Async />
          </ErrorBoundary>
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog([
      // First attempt. The uncached promise suspends.
      'Suspend! [Async]',
      // Because the promise already fulfilled, we're able to unwrap the value
      // immediately in a microtask.
      //
      // Then we proceed to the rest of the component, which throws an error.
      'Caught an error: Oops!',

      // During the sync error recovery pass, the component suspends, because
      // we were unable to unwrap the value of the promise.
      'Suspend! [Async]',
      'Loading...',

      // Because the error recovery attempt suspended, React can't tell if the
      // error was actually fixed, or it was masked by the suspended data.
      // In this case, it wasn't actually fixed, so if we were to commit the
      // suspended fallback, it would enter an endless error recovery loop.
      //
      // Instead, we disable error recovery for these lanes and start
      // over again.

      // This time, the error is thrown and we commit the result.
      'Suspend! [Async]',
      'Caught an error: Oops!',
    ]);
    expect(root).toMatchRenderedOutput('Caught an error: Oops!');
  });

  test('basic use(context)', async () => {
    const ContextA = React.createContext('');
    const ContextB = React.createContext('B');

    function Sync() {
      const text = use(ContextA) + use(ContextB);
      return text;
    }

    function App() {
      return (
        <ContextA.Provider value="A">
          <Sync />
        </ContextA.Provider>
      );
    }

    const root = ReactNoop.createRoot();
    root.render(<App />);
    await waitForAll([]);
    expect(root).toMatchRenderedOutput('AB');
  });

  test('interrupting while yielded should reset contexts', async () => {
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });

    const Context = React.createContext();

    const lazy = React.lazy(() => {
      return promise;
    });

    function ContextText() {
      return <Text text={use(Context)} />;
    }

    function App({text}) {
      return (
        <div>
          <Context.Provider value={text}>
            {lazy}
            <ContextText />
          </Context.Provider>
        </div>
      );
    }

    const root = ReactNoop.createRoot();
    startTransition(() => {
      root.render(<App text="world" />);
    });
    await waitForPaint([]);
    expect(root).toMatchRenderedOutput(null);

    await resolve({default: <Text key="hi" text="Hello " />});

    // Higher priority update that interrupts the first render
    ReactNoop.flushSync(() => {
      root.render(<App text="world!" />);
    });

    assertLog(['Hello ', 'world!']);

    expect(root).toMatchRenderedOutput(<div>Hello world!</div>);
  });

  test('warns if use(promise) is wrapped with try/catch block', async () => {
    function Async() {
      try {
        return <Text text={use(Promise.resolve('Async'))} />;
      } catch (e) {
        return <Text text="Fallback" />;
      }
    }

    spyOnDev(console, 'error').mockImplementation(() => {});
    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Async />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });

    if (__DEV__) {
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error.mock.calls[0][0]).toContain(
        'Warning: `use` was called from inside a try/catch block. This is not ' +
          'allowed and can lead to unexpected behavior. To handle errors ' +
          'triggered by `use`, wrap your component in a error boundary.',
      );
    }
  });

  test('during a transition, can unwrap async operations even if nothing is cached', async () => {
    function App() {
      return <Text text={use(getAsyncText('Async'))} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Suspense fallback={<Text text="Loading..." />}>
          <Text text="(empty)" />
        </Suspense>,
      );
    });
    assertLog(['(empty)']);
    expect(root).toMatchRenderedOutput('(empty)');

    await act(() => {
      startTransition(() => {
        root.render(
          <Suspense fallback={<Text text="Loading..." />}>
            <App />
          </Suspense>,
        );
      });
    });
    assertLog(['Async text requested [Async]']);
    expect(root).toMatchRenderedOutput('(empty)');

    await act(() => {
      resolveTextRequests('Async');
    });
    assertLog(['Async text requested [Async]', 'Async']);
    expect(root).toMatchRenderedOutput('Async');
  });

  test("does not prevent a Suspense fallback from showing if it's a new boundary, even during a transition", async () => {
    function App() {
      return <Text text={use(getAsyncText('Async'))} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(
          <Suspense fallback={<Text text="Loading..." />}>
            <App />
          </Suspense>,
        );
      });
    });
    // Even though the initial render was a transition, it shows a fallback.
    assertLog(['Async text requested [Async]', 'Loading...']);
    expect(root).toMatchRenderedOutput('Loading...');

    // Resolve the original data
    await act(() => {
      resolveTextRequests('Async');
    });
    // During the retry, a fresh request is initiated. Now we must wait for this
    // one to finish.
    // TODO: This is awkward. Intuitively, you might expect for `act` to wait
    // until the new request has finished loading. But if it's mock IO, as in
    // this test, how would the developer be able to imperatively flush it if it
    // wasn't initiated until the current `act` call? Can't think of a better
    // strategy at the moment.
    assertLog(['Async text requested [Async]']);
    expect(root).toMatchRenderedOutput('Loading...');

    // Flush the second request.
    await act(() => {
      resolveTextRequests('Async');
    });
    // This time it finishes because it was during a retry.
    assertLog(['Async text requested [Async]', 'Async']);
    expect(root).toMatchRenderedOutput('Async');
  });

  test('when waiting for data to resolve, a fresh update will trigger a restart', async () => {
    function App() {
      return <Text text={use(getAsyncText('Will never resolve'))} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<Suspense fallback={<Text text="Loading..." />} />);
    });

    await act(() => {
      startTransition(() => {
        root.render(
          <Suspense fallback={<Text text="Loading..." />}>
            <App />
          </Suspense>,
        );
      });
    });
    assertLog(['Async text requested [Will never resolve]']);

    await act(() => {
      root.render(
        <Suspense fallback={<Text text="Loading..." />}>
          <Text text="Something different" />
        </Suspense>,
      );
    });
    assertLog(['Something different']);
  });

  test('when waiting for data to resolve, an update on a different root does not cause work to be dropped', async () => {
    const getCachedAsyncText = cache(getAsyncText);

    function App() {
      return <Text text={use(getCachedAsyncText('Hi'))} />;
    }

    const root1 = ReactNoop.createRoot();
    await act(() => {
      root1.render(<Suspense fallback={<Text text="Loading..." />} />);
    });

    // Start a transition on one root. It will suspend.
    await act(() => {
      startTransition(() => {
        root1.render(
          <Suspense fallback={<Text text="Loading..." />}>
            <App />
          </Suspense>,
        );
      });
    });
    assertLog(['Async text requested [Hi]']);

    // While we're waiting for the first root's data to resolve, a second
    // root renders.
    const root2 = ReactNoop.createRoot();
    await act(() => {
      root2.render('Do re mi');
    });
    expect(root2).toMatchRenderedOutput('Do re mi');

    // Once the first root's data is ready, we should finish its transition.
    await act(async () => {
      await resolveTextRequests('Hi');
    });
    assertLog(['Hi']);
    expect(root1).toMatchRenderedOutput('Hi');
  });

  test('while suspended, hooks cannot be called (i.e. current dispatcher is unset correctly)', async () => {
    function App() {
      return <Text text={use(getAsyncText('Will never resolve'))} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<Suspense fallback={<Text text="Loading..." />} />);
    });

    await act(() => {
      startTransition(() => {
        root.render(
          <Suspense fallback={<Text text="Loading..." />}>
            <App />
          </Suspense>,
        );
      });
    });
    assertLog(['Async text requested [Will never resolve]']);

    // Calling a hook should error because we're oustide of a component.
    expect(useState).toThrow(
      'Invalid hook call. Hooks can only be called inside of the body of a ' +
        'function component.',
    );
  });

  test('unwraps thenable that fulfills synchronously without suspending', async () => {
    function App() {
      const thenable = {
        then(resolve) {
          // This thenable immediately resolves, synchronously, without waiting
          // a microtask.
          resolve('Hi');
        },
      };
      try {
        return <Text text={use(thenable)} />;
      } catch {
        throw new Error(
          '`use` should not suspend because the thenable resolved synchronously.',
        );
      }
    }
    // Because the thenable resolves synchronously, we should be able to finish
    // rendering synchronously, with no fallback.
    const root = ReactNoop.createRoot();
    ReactNoop.flushSync(() => {
      root.render(<App />);
    });
    assertLog(['Hi']);
    expect(root).toMatchRenderedOutput('Hi');
  });

  test('does not suspend indefinitely if an interleaved update was skipped', async () => {
    function Child({childShouldSuspend}) {
      return (
        <Text
          text={
            childShouldSuspend
              ? use(getAsyncText('Will never resolve'))
              : 'Child'
          }
        />
      );
    }

    let setChildShouldSuspend;
    let setShowChild;
    function Parent() {
      const [showChild, _setShowChild] = useState(true);
      setShowChild = _setShowChild;

      const [childShouldSuspend, _setChildShouldSuspend] = useState(false);
      setChildShouldSuspend = _setChildShouldSuspend;

      Scheduler.log(
        `childShouldSuspend: ${childShouldSuspend}, showChild: ${showChild}`,
      );
      return showChild ? (
        <Child childShouldSuspend={childShouldSuspend} />
      ) : (
        <Text text="(empty)" />
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<Parent />);
    });
    assertLog(['childShouldSuspend: false, showChild: true', 'Child']);
    expect(root).toMatchRenderedOutput('Child');

    await act(async () => {
      // Perform an update that causes the app to suspend
      startTransition(() => {
        setChildShouldSuspend(true);
      });
      await waitFor(['childShouldSuspend: true, showChild: true']);
      // While the update is in progress, schedule another update.
      startTransition(() => {
        setShowChild(false);
      });
    });
    assertLog([
      // Because the interleaved update is not higher priority than what we were
      // already working on, it won't interrupt. The first update will continue,
      // and will suspend.
      'Async text requested [Will never resolve]',

      // Instead of waiting for the promise to resolve, React notices there's
      // another pending update that it hasn't tried yet. It will switch to
      // rendering that instead.
      //
      // This time, the update hides the component that previous was suspending,
      // so it finishes successfully.
      'childShouldSuspend: false, showChild: false',
      '(empty)',

      // Finally, React attempts to render the first update again. It also
      // finishes successfully, because it was rebased on top of the update that
      // hid the suspended component.
      // NOTE: These this render happened to not be entangled with the previous
      // one. If they had been, this update would have been included in the
      // previous render, and there wouldn't be an extra one here. This could
      // change if we change our entanglement heurstics. Semantically, it
      // shouldn't matter, though in general we try to work on transitions in
      // parallel whenever possible. So even though in this particular case, the
      // extra render is unnecessary, it's a nice property that it wasn't
      // entangled with the other transition.
      'childShouldSuspend: true, showChild: false',
      '(empty)',
    ]);
    expect(root).toMatchRenderedOutput('(empty)');
  });

  test('when replaying a suspended component, reuses the hooks computed during the previous attempt (Memo)', async () => {
    function ExcitingText({text}) {
      // This computes the uppercased version of some text. Pretend it's an
      // expensive operation that we want to reuse.
      const uppercaseText = useMemo(() => {
        Scheduler.log('Compute uppercase: ' + text);
        return text.toUpperCase();
      }, [text]);

      // This adds an exclamation point to the text. Pretend it's an async
      // operation that is sent to a service for processing.
      const exclamatoryText = use(getAsyncText(uppercaseText + '!'));

      // This surrounds the text with sparkle emojis. The purpose in this test
      // is to show that you can suspend in the middle of a sequence of hooks
      // without breaking anything.
      const sparklingText = useMemo(() => {
        Scheduler.log('Add sparkles: ' + exclamatoryText);
        return `✨ ${exclamatoryText} ✨`;
      }, [exclamatoryText]);

      return <Text text={sparklingText} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<ExcitingText text="Hello" />);
      });
    });
    // Suspends while we wait for the async service to respond.
    assertLog(['Compute uppercase: Hello', 'Async text requested [HELLO!]']);
    expect(root).toMatchRenderedOutput(null);

    // The data is received.
    await act(() => {
      resolveTextRequests('HELLO!');
    });
    assertLog([
      // We shouldn't run the uppercase computation again, because we can reuse
      // the computation from the previous attempt.
      // 'Compute uppercase: Hello',

      'Async text requested [HELLO!]',
      'Add sparkles: HELLO!',
      '✨ HELLO! ✨',
    ]);
  });

  test('when replaying a suspended component, reuses the hooks computed during the previous attempt (State)', async () => {
    let _setFruit;
    let _setVegetable;
    function Kitchen() {
      const [fruit, setFruit] = useState('apple');
      _setFruit = setFruit;
      const usedFruit = use(getAsyncText(fruit));
      const [vegetable, setVegetable] = useState('carrot');
      _setVegetable = setVegetable;
      return <Text text={usedFruit + ' ' + vegetable} />;
    }

    // Initial render.
    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<Kitchen />);
      });
    });
    assertLog(['Async text requested [apple]']);
    expect(root).toMatchRenderedOutput(null);
    await act(() => {
      resolveTextRequests('apple');
    });
    assertLog(['Async text requested [apple]', 'apple carrot']);
    expect(root).toMatchRenderedOutput('apple carrot');

    // Update the state variable after the use().
    await act(() => {
      startTransition(() => {
        _setVegetable('dill');
      });
    });
    assertLog(['Async text requested [apple]']);
    expect(root).toMatchRenderedOutput('apple carrot');
    await act(() => {
      resolveTextRequests('apple');
    });
    assertLog(['Async text requested [apple]', 'apple dill']);
    expect(root).toMatchRenderedOutput('apple dill');

    // Update the state variable before the use(). The second state is maintained.
    await act(() => {
      startTransition(() => {
        _setFruit('banana');
      });
    });
    assertLog(['Async text requested [banana]']);
    expect(root).toMatchRenderedOutput('apple dill');
    await act(() => {
      resolveTextRequests('banana');
    });
    assertLog(['Async text requested [banana]', 'banana dill']);
    expect(root).toMatchRenderedOutput('banana dill');
  });

  test('when replaying a suspended component, reuses the hooks computed during the previous attempt (DebugValue+State)', async () => {
    // Make sure we don't get a Hook mismatch warning on updates if there were non-stateful Hooks before the use().
    let _setLawyer;
    function Lexicon() {
      useDebugValue(123);
      const avocado = use(getAsyncText('aguacate'));
      const [lawyer, setLawyer] = useState('abogado');
      _setLawyer = setLawyer;
      return <Text text={avocado + ' ' + lawyer} />;
    }

    // Initial render.
    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<Lexicon />);
      });
    });
    assertLog(['Async text requested [aguacate]']);
    expect(root).toMatchRenderedOutput(null);
    await act(() => {
      resolveTextRequests('aguacate');
    });
    assertLog(['Async text requested [aguacate]', 'aguacate abogado']);
    expect(root).toMatchRenderedOutput('aguacate abogado');

    // Now update the state.
    await act(() => {
      startTransition(() => {
        _setLawyer('avocat');
      });
    });
    assertLog(['Async text requested [aguacate]']);
    expect(root).toMatchRenderedOutput('aguacate abogado');
    await act(() => {
      resolveTextRequests('aguacate');
    });
    assertLog(['Async text requested [aguacate]', 'aguacate avocat']);
    expect(root).toMatchRenderedOutput('aguacate avocat');
  });

  test(
    'wrap an async function with useMemo to skip running the function ' +
      'twice when loading new data',
    async () => {
      function App({text}) {
        const promiseForText = useMemo(async () => getAsyncText(text), [text]);
        const asyncText = use(promiseForText);
        return <Text text={asyncText} />;
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        startTransition(() => {
          root.render(<App text="Hello" />);
        });
      });
      assertLog(['Async text requested [Hello]']);
      expect(root).toMatchRenderedOutput(null);

      await act(() => {
        resolveTextRequests('Hello');
      });
      assertLog([
        // We shouldn't request async text again, because the async function
        // was memoized
        // 'Async text requested [Hello]'

        'Hello',
      ]);
    },
  );

  test('load multiple nested Suspense boundaries', async () => {
    const getCachedAsyncText = cache(getAsyncText);

    function AsyncText({text}) {
      return <Text text={use(getCachedAsyncText(text))} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Suspense fallback={<Text text="(Loading A...)" />}>
          <AsyncText text="A" />
          <Suspense fallback={<Text text="(Loading B...)" />}>
            <AsyncText text="B" />
            <Suspense fallback={<Text text="(Loading C...)" />}>
              <AsyncText text="C" />
            </Suspense>
          </Suspense>
        </Suspense>,
      );
    });
    assertLog(['Async text requested [A]', '(Loading A...)']);
    expect(root).toMatchRenderedOutput('(Loading A...)');

    await act(() => {
      resolveTextRequests('A');
    });
    assertLog(['A', 'Async text requested [B]', '(Loading B...)']);
    expect(root).toMatchRenderedOutput('A(Loading B...)');

    await act(() => {
      resolveTextRequests('B');
    });
    assertLog(['B', 'Async text requested [C]', '(Loading C...)']);
    expect(root).toMatchRenderedOutput('AB(Loading C...)');

    await act(() => {
      resolveTextRequests('C');
    });
    assertLog(['C']);
    expect(root).toMatchRenderedOutput('ABC');
  });

  test('load multiple nested Suspense boundaries (uncached requests)', async () => {
    // This the same as the previous test, except the requests are not cached.
    // The tree should still eventually resolve, despite the
    // duplicate requests.
    function AsyncText({text}) {
      // This initiates a new request on each render.
      return <Text text={use(getAsyncText(text))} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Suspense fallback={<Text text="(Loading A...)" />}>
          <AsyncText text="A" />
          <Suspense fallback={<Text text="(Loading B...)" />}>
            <AsyncText text="B" />
            <Suspense fallback={<Text text="(Loading C...)" />}>
              <AsyncText text="C" />
            </Suspense>
          </Suspense>
        </Suspense>,
      );
    });
    assertLog(['Async text requested [A]', '(Loading A...)']);
    expect(root).toMatchRenderedOutput('(Loading A...)');

    await act(() => {
      resolveTextRequests('A');
    });
    assertLog(['Async text requested [A]']);
    expect(root).toMatchRenderedOutput('(Loading A...)');

    await act(() => {
      resolveTextRequests('A');
    });
    assertLog([
      // React suspends until A finishes loading.
      'Async text requested [A]',
      'A',

      // Now React can continue rendering the rest of the tree.

      // React does not suspend on the inner requests, because that would
      // block A from appearing. Instead it shows a fallback.
      'Async text requested [B]',
      '(Loading B...)',
    ]);
    expect(root).toMatchRenderedOutput('A(Loading B...)');

    await act(() => {
      resolveTextRequests('B');
    });
    assertLog(['Async text requested [B]']);
    expect(root).toMatchRenderedOutput('A(Loading B...)');

    await act(() => {
      resolveTextRequests('B');
    });
    assertLog([
      // React suspends until B finishes loading.
      'Async text requested [B]',
      'B',

      // React does not suspend on C, because that would block B from appearing.
      'Async text requested [C]',
      '(Loading C...)',
    ]);
    expect(root).toMatchRenderedOutput('AB(Loading C...)');

    await act(() => {
      resolveTextRequests('C');
    });
    assertLog(['Async text requested [C]']);
    expect(root).toMatchRenderedOutput('AB(Loading C...)');

    await act(() => {
      resolveTextRequests('C');
    });
    assertLog(['Async text requested [C]', 'C']);
    expect(root).toMatchRenderedOutput('ABC');
  });

  test('use() combined with render phase updates', async () => {
    function Async() {
      const a = use(Promise.resolve('A'));
      const [count, setCount] = useState(0);
      if (count === 0) {
        setCount(1);
      }
      const usedCount = use(Promise.resolve(count));
      return <Text text={a + usedCount} />;
    }

    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Async />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['A1']);
    expect(root).toMatchRenderedOutput('A1');
  });

  test('basic promise as child', async () => {
    const promise = Promise.resolve(<Text text="Hi" />);
    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(promise);
      });
    });
    assertLog(['Hi']);
    expect(root).toMatchRenderedOutput('Hi');
  });

  test('basic async component', async () => {
    async function App() {
      await getAsyncText('Hi');
      return <Text text="Hi" />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['Async text requested [Hi]']);

    await act(() => resolveTextRequests('Hi'));
    assertLog([
      // TODO: We shouldn't have to replay the function body again. Skip
      // straight to reconciliation.
      'Async text requested [Hi]',
      'Hi',
    ]);
    expect(root).toMatchRenderedOutput('Hi');
  });

  test('async child of a non-function component (e.g. a class)', async () => {
    class App extends React.Component {
      async render() {
        const text = await getAsyncText('Hi');
        return <Text text={text} />;
      }
    }

    const root = ReactNoop.createRoot();
    await act(async () => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['Async text requested [Hi]']);

    await act(async () => resolveTextRequests('Hi'));
    assertLog([
      // TODO: We shouldn't have to replay the render function again. We could
      // skip straight to reconciliation. However, it's not as urgent to fix
      // this for fiber types that aren't function components, so we can special
      // case those in the meantime.
      'Async text requested [Hi]',
      'Hi',
    ]);
    expect(root).toMatchRenderedOutput('Hi');
  });

  test('async children are recursively unwrapped', async () => {
    // This is a Usable of a Usable. `use` would only unwrap a single level, but
    // when passed as a child, the reconciler recurisvely unwraps until it
    // resolves to a non-Usable value.
    const thenable = {
      then() {},
      status: 'fulfilled',
      value: {
        then() {},
        status: 'fulfilled',
        value: <Text text="Hi" />,
      },
    };
    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(thenable);
    });
    assertLog(['Hi']);
    expect(root).toMatchRenderedOutput('Hi');
  });

  test('async children are transparently unwrapped before being reconciled (top level)', async () => {
    function Child({text}) {
      useEffect(() => {
        Scheduler.log(`Mount: ${text}`);
      }, [text]);
      return <Text text={text} />;
    }

    async function App({text}) {
      // The child returned by this component is always a promise (async
      // functions always return promises). React should unwrap it and reconcile
      // the result, not the promise itself.
      return <Child text={text} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App text="A" />);
      });
    });
    assertLog(['A', 'Mount: A']);
    expect(root).toMatchRenderedOutput('A');

    // Update the child's props. It should not remount.
    await act(() => {
      startTransition(() => {
        root.render(<App text="B" />);
      });
    });
    assertLog(['B', 'Mount: B']);
    expect(root).toMatchRenderedOutput('B');
  });

  test('async children are transparently unwrapped before being reconciled (siblings)', async () => {
    function Child({text}) {
      useEffect(() => {
        Scheduler.log(`Mount: ${text}`);
      }, [text]);
      return <Text text={text} />;
    }

    const root = ReactNoop.createRoot();
    await act(async () => {
      startTransition(() => {
        root.render(
          <>
            {Promise.resolve(<Child text="A" />)}
            {Promise.resolve(<Child text="B" />)}
            {Promise.resolve(<Child text="C" />)}
          </>,
        );
      });
    });
    assertLog(['A', 'B', 'C', 'Mount: A', 'Mount: B', 'Mount: C']);
    expect(root).toMatchRenderedOutput('ABC');

    await act(() => {
      startTransition(() => {
        root.render(
          <>
            {Promise.resolve(<Child text="A" />)}
            {Promise.resolve(<Child text="B" />)}
            {Promise.resolve(<Child text="C" />)}
          </>,
        );
      });
    });
    // Nothing should have remounted
    assertLog(['A', 'B', 'C']);
    expect(root).toMatchRenderedOutput('ABC');
  });

  test('async children are transparently unwrapped before being reconciled (siblings, reordered)', async () => {
    function Child({text}) {
      useEffect(() => {
        Scheduler.log(`Mount: ${text}`);
      }, [text]);
      return <Text text={text} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(
          <>
            {Promise.resolve(<Child key="A" text="A" />)}
            {Promise.resolve(<Child key="B" text="B" />)}
            {Promise.resolve(<Child key="C" text="C" />)}
          </>,
        );
      });
    });
    assertLog(['A', 'B', 'C', 'Mount: A', 'Mount: B', 'Mount: C']);
    expect(root).toMatchRenderedOutput('ABC');

    await act(() => {
      startTransition(() => {
        root.render(
          <>
            {Promise.resolve(<Child key="B" text="B" />)}
            {Promise.resolve(<Child key="A" text="A" />)}
            {Promise.resolve(<Child key="C" text="C" />)}
          </>,
        );
      });
    });
    // Nothing should have remounted
    assertLog(['B', 'A', 'C']);
    expect(root).toMatchRenderedOutput('BAC');
  });

  test('basic Context as node', async () => {
    const Context = React.createContext(null);

    function Indirection({children}) {
      Scheduler.log('Indirection');
      return children;
    }

    function ParentOfContextNode() {
      Scheduler.log('ParentOfContextNode');
      return Context;
    }

    function Child({text}) {
      useEffect(() => {
        Scheduler.log('Mount');
        return () => {
          Scheduler.log('Unmount');
        };
      }, []);
      return <Text text={text} />;
    }

    function App({contextValue, children}) {
      const memoizedChildren = useMemo(
        () => (
          <Indirection>
            <ParentOfContextNode />
          </Indirection>
        ),
        [children],
      );
      return (
        <Context.Provider value={contextValue}>
          {memoizedChildren}
        </Context.Provider>
      );
    }

    // Initial render
    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App contextValue={<Child text="A" />} />);
    });
    assertLog(['Indirection', 'ParentOfContextNode', 'A', 'Mount']);
    expect(root).toMatchRenderedOutput('A');

    // Update the child to a new value
    await act(async () => {
      root.render(<App contextValue={<Child text="B" />} />);
    });
    assertLog([
      // Notice that the <Indirection /> did not rerender, because the
      // update was sent via Context.

      // TODO: We shouldn't have to re-render the parent of the context node.
      // This happens because we need to reconcile the parent's children again.
      // However, we should be able to skip directly to reconcilation without
      // evaluating the component. One way to do this might be to mark the
      // context dependency with a flag that says it was added
      // during reconcilation.
      'ParentOfContextNode',

      // Notice that this was an update, not a remount.
      'B',
    ]);
    expect(root).toMatchRenderedOutput('B');

    // Delete the old child and replace it with a new one, by changing the key
    await act(async () => {
      root.render(<App contextValue={<Child key="C" text="C" />} />);
    });
    assertLog([
      'ParentOfContextNode',

      // A new instance is mounted
      'C',
      'Unmount',
      'Mount',
    ]);
  });

  test('context as node, at the root', async () => {
    const Context = React.createContext(<Text text="Hi" />);
    const root = ReactNoop.createRoot();
    await act(async () => {
      startTransition(() => {
        root.render(Context);
      });
    });
    assertLog(['Hi']);
    expect(root).toMatchRenderedOutput('Hi');
  });

  test('promises that resolves to a context, rendered as a node', async () => {
    const Context = React.createContext(<Text text="Hi" />);
    const promise = Promise.resolve(Context);
    const root = ReactNoop.createRoot();
    await act(async () => {
      startTransition(() => {
        root.render(promise);
      });
    });
    assertLog(['Hi']);
    expect(root).toMatchRenderedOutput('Hi');
  });

  test('unwrap uncached promises inside forwardRef', async () => {
    const asyncInstance = {};
    const Async = React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => asyncInstance);
      const text = use(Promise.resolve('Async'));
      return <Text text={text} />;
    });

    const ref = React.createRef();
    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Async ref={ref} />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['Async']);
    expect(root).toMatchRenderedOutput('Async');
    expect(ref.current).toBe(asyncInstance);
  });

  test('unwrap uncached promises inside memo', async () => {
    const Async = React.memo(
      props => {
        const text = use(Promise.resolve(props.text));
        return <Text text={text} />;
      },
      (a, b) => a.text === b.text,
    );

    function App({text}) {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Async text={text} />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App text="Async" />);
      });
    });
    assertLog(['Async']);
    expect(root).toMatchRenderedOutput('Async');

    // Update to the same value
    await act(() => {
      startTransition(() => {
        root.render(<App text="Async" />);
      });
    });
    // Should not have re-rendered, because it's memoized
    assertLog([]);
    expect(root).toMatchRenderedOutput('Async');

    // Update to a different value
    await act(() => {
      startTransition(() => {
        root.render(<App text="Async!" />);
      });
    });
    assertLog(['Async!']);
    expect(root).toMatchRenderedOutput('Async!');
  });

  // @gate !disableLegacyContext
  test('unwrap uncached promises in component that accesses legacy context', async () => {
    class ContextProvider extends React.Component {
      static childContextTypes = {
        legacyContext() {},
      };
      getChildContext() {
        return {legacyContext: 'Async'};
      }
      render() {
        return this.props.children;
      }
    }

    function Async({label}, context) {
      const text = use(Promise.resolve(context.legacyContext + ` (${label})`));
      return <Text text={text} />;
    }
    Async.contextTypes = {
      legacyContext: () => {},
    };

    const AsyncMemo = React.memo(Async, (a, b) => a.label === b.label);

    function App() {
      return (
        <ContextProvider>
          <Suspense fallback={<Text text="Loading..." />}>
            <div>
              <Async label="function component" />
            </div>
            <div>
              <AsyncMemo label="memo component" />
            </div>
          </Suspense>
        </ContextProvider>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<App />);
      });
    });
    assertLog(['Async (function component)', 'Async (memo component)']);
    expect(root).toMatchRenderedOutput(
      <>
        <div>Async (function component)</div>
        <div>Async (memo component)</div>
      </>,
    );
  });

  test('regression test: updates while component is suspended should not be mistaken for render phase updates', async () => {
    const getCachedAsyncText = cache(getAsyncText);

    let setState;
    function App() {
      const [state, _setState] = useState('A');
      setState = _setState;
      return <Text text={use(getCachedAsyncText(state))} />;
    }

    // Initial render
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Async text requested [A]']);
    expect(root).toMatchRenderedOutput(null);
    await act(() => resolveTextRequests('A'));
    assertLog(['A']);
    expect(root).toMatchRenderedOutput('A');

    // Update to B. This will suspend.
    await act(() => startTransition(() => setState('B')));
    assertLog(['Async text requested [B]']);
    expect(root).toMatchRenderedOutput('A');

    // While B is suspended, update to C. This should immediately interrupt
    // the render for B. In the regression, this update was mistakenly treated
    // as a render phase update.
    ReactNoop.flushSync(() => setState('C'));
    assertLog(['Async text requested [C]']);

    // Finish rendering.
    await act(() => resolveTextRequests('C'));
    assertLog(['C']);
    expect(root).toMatchRenderedOutput('C');
  });
});
