/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

let React;
let ReactNoop;
let Scheduler;
let act;

let getCacheForType;
let useState;
let Suspense;
let startTransition;

let caches;
let seededCache;

describe('ReactInteractionTracing', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');

    act = require('jest-react').act;

    useState = React.useState;
    startTransition = React.startTransition;
    Suspense = React.Suspense;

    getCacheForType = React.unstable_getCacheForType;

    caches = [];
    seededCache = null;
  });

  function createTextCache() {
    if (seededCache !== null) {
      const cache = seededCache;
      seededCache = null;
      return cache;
    }

    const data = new Map();
    const cache = {
      data,
      resolve(text) {
        const record = data.get(text);

        if (record === undefined) {
          const newRecord = {
            status: 'resolved',
            value: text,
          };
          data.set(text, newRecord);
        } else if (record.status === 'pending') {
          const thenable = record.value;
          record.status = 'resolved';
          record.value = text;
          thenable.pings.forEach(t => t());
        }
      },
      reject(text, error) {
        const record = data.get(text);
        if (record === undefined) {
          const newRecord = {
            status: 'rejected',
            value: error,
          };
          data.set(text, newRecord);
        } else if (record.status === 'pending') {
          const thenable = record.value;
          record.status = 'rejected';
          record.value = error;
          thenable.pings.forEach(t => t());
        }
      },
    };
    caches.push(cache);
    return cache;
  }

  function readText(text) {
    const textCache = getCacheForType(createTextCache);
    const record = textCache.data.get(text);
    if (record !== undefined) {
      switch (record.status) {
        case 'pending':
          Scheduler.unstable_yieldValue(`Suspend [${text}]`);
          throw record.value;
        case 'rejected':
          Scheduler.unstable_yieldValue(`Error [${text}]`);
          throw record.value;
        case 'resolved':
          return record.value;
      }
    } else {
      Scheduler.unstable_yieldValue(`Suspend [${text}]`);

      const thenable = {
        pings: [],
        then(resolve) {
          if (newRecord.status === 'pending') {
            thenable.pings.push(resolve);
          } else {
            Promise.resolve().then(() => resolve(newRecord.value));
          }
        },
      };

      const newRecord = {
        status: 'pending',
        value: thenable,
      };
      textCache.data.set(text, newRecord);

      throw thenable;
    }
  }

  function AsyncText({text}) {
    const fullText = readText(text);
    Scheduler.unstable_yieldValue(fullText);
    return fullText;
  }

  function Text({text}) {
    Scheduler.unstable_yieldValue(text);
    return text;
  }

  function resolveMostRecentTextCache(text) {
    if (caches.length === 0) {
      throw Error('Cache does not exist');
    } else {
      // Resolve the most recently created cache. An older cache can by
      // resolved with `caches[index].resolve(text)`.
      caches[caches.length - 1].resolve(text);
    }
  }

  const resolveText = resolveMostRecentTextCache;

  function advanceTimers(ms) {
    // Note: This advances Jest's virtual time but not React's. Use
    // ReactNoop.expire for that.
    if (typeof ms !== 'number') {
      throw new Error('Must specify ms');
    }
    jest.advanceTimersByTime(ms);
    // Wait until the end of the current tick
    // We cannot use a timer since we're faking them
    return Promise.resolve().then(() => {});
  }

  // @gate enableTransitionTracing
  it('should correctly trace basic interaction', async () => {
    const transitionCallbacks = {
      onTransitionStart: (name, startTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionStart(${name}, ${startTime})`,
        );
      },
      onTransitionComplete: (name, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionComplete(${name}, ${startTime}, ${endTime})`,
        );
      },
    };

    let navigateToPageTwo;
    function App() {
      const [navigate, setNavigate] = useState(false);
      navigateToPageTwo = () => {
        setNavigate(true);
      };

      return (
        <div>
          {navigate ? <Text text="Page Two" /> : <Text text="Page One" />}
        </div>
      );
    }

    const root = ReactNoop.createRoot({transitionCallbacks});
    await act(async () => {
      root.render(<App />);
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield(['Page One']);

      await act(async () => {
        startTransition(() => navigateToPageTwo(), {name: 'page transition'});

        ReactNoop.expire(1000);
        await advanceTimers(1000);

        expect(Scheduler).toFlushAndYield([
          'Page Two',
          'onTransitionStart(page transition, 1000)',
          'onTransitionComplete(page transition, 1000, 2000)',
        ]);
      });
    });
  });

  // @gate enableTransitionTracing
  it('multiple updates in transition callback should only result in one transitionStart/transitionComplete call', async () => {
    const transitionCallbacks = {
      onTransitionStart: (name, startTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionStart(${name}, ${startTime})`,
        );
      },
      onTransitionComplete: (name, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionComplete(${name}, ${startTime}, ${endTime})`,
        );
      },
    };

    let navigateToPageTwo;
    let setText;
    function App() {
      const [navigate, setNavigate] = useState(false);
      const [text, _setText] = useState('hide');
      navigateToPageTwo = () => setNavigate(true);
      setText = () => _setText('show');

      return (
        <div>
          {navigate ? (
            <Text text={`Page Two: ${text}`} />
          ) : (
            <Text text={`Page One: ${text}`} />
          )}
        </div>
      );
    }

    const root = ReactNoop.createRoot({transitionCallbacks});
    await act(async () => {
      root.render(<App />);
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield(['Page One: hide']);

      await act(async () => {
        startTransition(
          () => {
            navigateToPageTwo();
            setText();
          },
          {name: 'page transition'},
        );

        ReactNoop.expire(1000);
        await advanceTimers(1000);

        expect(Scheduler).toFlushAndYield([
          'Page Two: show',
          'onTransitionStart(page transition, 1000)',
          'onTransitionComplete(page transition, 1000, 2000)',
        ]);
      });
    });
  });

  // @gate enableTransitionTracing
  it('should correctly trace interactions for async roots', async () => {
    const transitionCallbacks = {
      onTransitionStart: (name, startTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionStart(${name}, ${startTime})`,
        );
      },
      onTransitionComplete: (name, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionComplete(${name}, ${startTime}, ${endTime})`,
        );
      },
    };
    let navigateToPageTwo;
    function App() {
      const [navigate, setNavigate] = useState(false);
      navigateToPageTwo = () => {
        setNavigate(true);
      };

      return (
        <div>
          {navigate ? (
            <Suspense
              fallback={<Text text="Loading..." />}
              name="suspense page">
              <AsyncText text="Page Two" />
            </Suspense>
          ) : (
            <Text text="Page One" />
          )}
        </div>
      );
    }

    const root = ReactNoop.createRoot({transitionCallbacks});
    await act(async () => {
      root.render(<App />);
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield(['Page One']);
    });

    await act(async () => {
      startTransition(() => navigateToPageTwo(), {name: 'page transition'});

      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield([
        'Suspend [Page Two]',
        'Loading...',
        'onTransitionStart(page transition, 1000)',
      ]);

      ReactNoop.expire(1000);
      await advanceTimers(1000);
      await resolveText('Page Two');

      expect(Scheduler).toFlushAndYield([
        'Page Two',
        'onTransitionComplete(page transition, 1000, 3000)',
      ]);
    });
  });

  // @gate enableTransitionTracing
  it('should correctly trace multiple separate root interactions', async () => {
    const transitionCallbacks = {
      onTransitionStart: (name, startTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionStart(${name}, ${startTime})`,
        );
      },
      onTransitionComplete: (name, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionComplete(${name}, ${startTime}, ${endTime})`,
        );
      },
    };

    let navigateToPageTwo;
    let showTextFn;
    function App() {
      const [navigate, setNavigate] = useState(false);
      const [showText, setShowText] = useState(false);

      navigateToPageTwo = () => {
        setNavigate(true);
      };

      showTextFn = () => {
        setShowText(true);
      };

      return (
        <div>
          {navigate ? (
            <>
              {showText ? (
                <Suspense fallback={<Text text="Show Text Loading..." />}>
                  <AsyncText text="Show Text" />
                </Suspense>
              ) : null}
              <Suspense
                fallback={<Text text="Loading..." />}
                name="suspense page">
                <AsyncText text="Page Two" />
              </Suspense>
            </>
          ) : (
            <Text text="Page One" />
          )}
        </div>
      );
    }

    const root = ReactNoop.createRoot({transitionCallbacks});
    await act(async () => {
      root.render(<App />);
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield(['Page One']);
    });

    await act(async () => {
      startTransition(() => navigateToPageTwo(), {name: 'page transition'});

      expect(Scheduler).toFlushAndYield([
        'Suspend [Page Two]',
        'Loading...',
        'onTransitionStart(page transition, 1000)',
      ]);

      await resolveText('Page Two');
      ReactNoop.expire(1000);
      await advanceTimers(1000);
      expect(Scheduler).toFlushAndYield([
        'Page Two',
        'onTransitionComplete(page transition, 1000, 2000)',
      ]);

      startTransition(() => showTextFn(), {name: 'text transition'});
      expect(Scheduler).toFlushAndYield([
        'Suspend [Show Text]',
        'Show Text Loading...',
        'Page Two',
        'onTransitionStart(text transition, 2000)',
      ]);

      await resolveText('Show Text');
      ReactNoop.expire(1000);
      await advanceTimers(1000);
      expect(Scheduler).toFlushAndYield([
        'Show Text',
        'onTransitionComplete(text transition, 2000, 3000)',
      ]);
    });
  });

  // @gate enableTransitionTracing
  it('should correctly trace multiple intertwined root interactions', async () => {
    const transitionCallbacks = {
      onTransitionStart: (name, startTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionStart(${name}, ${startTime})`,
        );
      },
      onTransitionComplete: (name, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionComplete(${name}, ${startTime}, ${endTime})`,
        );
      },
    };
    let navigateToPageTwo;
    let showTextFn;
    function App() {
      const [navigate, setNavigate] = useState(false);
      const [showText, setShowText] = useState(false);
      navigateToPageTwo = () => {
        setNavigate(true);
      };

      showTextFn = () => {
        setShowText(true);
      };

      return (
        <div>
          {navigate ? (
            <>
              {showText ? (
                <Suspense fallback={<Text text="Show Text Loading..." />}>
                  <AsyncText text="Show Text" />
                </Suspense>
              ) : null}
              <Suspense
                fallback={<Text text="Loading..." />}
                name="suspense page">
                <AsyncText text="Page Two" />
              </Suspense>
            </>
          ) : (
            <Text text="Page One" />
          )}
        </div>
      );
    }

    const root = ReactNoop.createRoot({transitionCallbacks});
    await act(async () => {
      root.render(<App />);
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield(['Page One']);
    });

    await act(async () => {
      startTransition(() => navigateToPageTwo(), {name: 'page transition'});
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield([
        'Suspend [Page Two]',
        'Loading...',
        'onTransitionStart(page transition, 1000)',
      ]);
    });

    await act(async () => {
      startTransition(() => showTextFn(), {name: 'show text'});

      expect(Scheduler).toFlushAndYield([
        'Suspend [Show Text]',
        'Show Text Loading...',
        'Suspend [Page Two]',
        'Loading...',
        'onTransitionStart(show text, 2000)',
      ]);
    });

    await act(async () => {
      await resolveText('Page Two');
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield([
        'Page Two',
        'onTransitionComplete(page transition, 1000, 3000)',
      ]);

      await resolveText('Show Text');
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield([
        'Show Text',
        'onTransitionComplete(show text, 2000, 4000)',
      ]);
    });
  });

  // @gate enableTransitionTracing
  it('should correctly trace interactions for tracing markers complete', async () => {
    const transitionCallbacks = {
      onTransitionStart: (name, startTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionStart(${name}, ${startTime})`,
        );
      },
      onTransitionComplete: (name, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionComplete(${name}, ${startTime}, ${endTime})`,
        );
      },
      onMarkerComplete: (transitioName, markerName, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onMarkerComplete(${transitioName}, ${markerName}, ${startTime}, ${endTime})`,
        );
      },
    };
    let navigateToPageTwo;
    function App() {
      const [navigate, setNavigate] = useState(false);
      navigateToPageTwo = () => {
        setNavigate(true);
      };

      return (
        <div>
          {navigate ? (
            <Suspense
              fallback={<Text text="Loading..." />}
              name="suspense page">
              <AsyncText text="Page Two" />
              <React.unstable_TracingMarker name="sync marker" />
              <React.unstable_TracingMarker name="async marker">
                <Suspense
                  fallback={<Text text="Loading..." />}
                  name="marker suspense">
                  <AsyncText text="Marker Text" />
                </Suspense>
              </React.unstable_TracingMarker>
            </Suspense>
          ) : (
            <Text text="Page One" />
          )}
        </div>
      );
    }

    const root = ReactNoop.createRoot({transitionCallbacks});
    await act(async () => {
      root.render(<App />);
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield(['Page One']);
    });

    await act(async () => {
      startTransition(() => navigateToPageTwo(), {name: 'page transition'});

      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield([
        'Suspend [Page Two]',
        'Suspend [Marker Text]',
        'Loading...',
        'Loading...',
        'onTransitionStart(page transition, 1000)',
      ]);

      ReactNoop.expire(1000);
      await advanceTimers(1000);
      await resolveText('Page Two');

      expect(Scheduler).toFlushAndYield([
        'Page Two',
        'Suspend [Marker Text]',
        'Loading...',
        'onMarkerComplete(page transition, sync marker, 1000, 3000)',
      ]);

      ReactNoop.expire(1000);
      await advanceTimers(1000);
      await resolveText('Marker Text');

      expect(Scheduler).toFlushAndYield([
        'Marker Text',
        'onMarkerComplete(page transition, async marker, 1000, 4000)',
        'onTransitionComplete(page transition, 1000, 4000)',
      ]);
    });
  });

  // @gate enableTransitionTracing
  it('trace interaction with multiple tracing markers', async () => {
    const transitionCallbacks = {
      onTransitionStart: (name, startTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionStart(${name}, ${startTime})`,
        );
      },
      onTransitionComplete: (name, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionComplete(${name}, ${startTime}, ${endTime})`,
        );
      },
      onMarkerComplete: (transitioName, markerName, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onMarkerComplete(${transitioName}, ${markerName}, ${startTime}, ${endTime})`,
        );
      },
    };

    let navigateToPageTwo;
    function App() {
      const [navigate, setNavigate] = useState(false);
      navigateToPageTwo = () => {
        setNavigate(true);
      };

      return (
        <div>
          {navigate ? (
            <React.unstable_TracingMarker name="outer marker">
              <Suspense fallback={<Text text="Outer..." />}>
                <AsyncText text="Outer Text" />
                <Suspense fallback={<Text text="Inner One..." />}>
                  <React.unstable_TracingMarker name="marker one">
                    <AsyncText text="Inner Text One" />
                  </React.unstable_TracingMarker>
                </Suspense>
                <Suspense fallback={<Text text="Inner Two..." />}>
                  <React.unstable_TracingMarker name="marker two">
                    <AsyncText text="Inner Text Two" />
                  </React.unstable_TracingMarker>
                </Suspense>
              </Suspense>
            </React.unstable_TracingMarker>
          ) : (
            <Text text="Page One" />
          )}
        </div>
      );
    }

    const root = ReactNoop.createRoot({transitionCallbacks});
    await act(async () => {
      root.render(<App />);
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield(['Page One']);
    });

    await act(async () => {
      startTransition(() => navigateToPageTwo(), {name: 'page transition'});

      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield([
        'Suspend [Outer Text]',
        'Suspend [Inner Text One]',
        'Inner One...',
        'Suspend [Inner Text Two]',
        'Inner Two...',
        'Outer...',
        'onTransitionStart(page transition, 1000)',
      ]);

      ReactNoop.expire(1000);
      await advanceTimers(1000);
      await resolveText('Inner Text Two');
      expect(Scheduler).toFlushAndYield([]);

      ReactNoop.expire(1000);
      await advanceTimers(1000);
      await resolveText('Outer Text');
      expect(Scheduler).toFlushAndYield([
        'Outer Text',
        'Suspend [Inner Text One]',
        'Inner One...',
        'Inner Text Two',
        'onMarkerComplete(page transition, marker two, 1000, 4000)',
      ]);

      ReactNoop.expire(1000);
      await advanceTimers(1000);
      await resolveText('Inner Text One');
      expect(Scheduler).toFlushAndYield([
        'Inner Text One',
        'onMarkerComplete(page transition, marker one, 1000, 5000)',
        'onMarkerComplete(page transition, outer marker, 1000, 5000)',
        'onTransitionComplete(page transition, 1000, 5000)',
      ]);
    });
  });

  // @gate enableTransitionTracing
  it.skip('marker interaction cancelled when name changes', async () => {
    const transitionCallbacks = {
      onTransitionStart: (name, startTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionStart(${name}, ${startTime})`,
        );
      },
      onTransitionComplete: (name, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionComplete(${name}, ${startTime}, ${endTime})`,
        );
      },
      onMarkerComplete: (transitioName, markerName, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onMarkerComplete(${transitioName}, ${markerName}, ${startTime}, ${endTime})`,
        );
      },
    };

    let navigateToPageTwo;
    let setMarkerNameFn;
    function App() {
      const [navigate, setNavigate] = useState(false);
      navigateToPageTwo = () => {
        setNavigate(true);
      };

      const [markerName, setMarkerName] = useState('old marker');
      setMarkerNameFn = () => setMarkerName('new marker');

      return (
        <div>
          {navigate ? (
            <React.unstable_TracingMarker name={markerName}>
              <Suspense fallback={<Text text="Loading..." />}>
                <AsyncText text="Page Two" />
              </Suspense>
            </React.unstable_TracingMarker>
          ) : (
            <Text text="Page One" />
          )}
        </div>
      );
    }

    const root = ReactNoop.createRoot({transitionCallbacks});
    await act(async () => {
      root.render(<App />);
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield(['Page One']);

      startTransition(() => navigateToPageTwo(), {name: 'page transition'});
      expect(Scheduler).toFlushAndYield([
        'Suspend [Page Two]',
        'Loading...',
        'onTransitionStart(page transition, 1000)',
      ]);

      ReactNoop.expire(1000);
      await advanceTimers(1000);
      setMarkerNameFn();

      expect(Scheduler).toFlushAndYield(['Suspend [Page Two]', 'Loading...']);
      ReactNoop.expire(1000);
      await advanceTimers(1000);
      resolveText('Page Two');

      // Marker complete is not called because the marker name changed
      expect(Scheduler).toFlushAndYield([
        'Page Two',
        'onTransitionComplete(page transition, 1000, 3000)',
      ]);
    });
  });

  // @gate enableTransitionTracing
  it.skip('marker changes to new interaction when name changes', async () => {
    const transitionCallbacks = {
      onTransitionStart: (name, startTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionStart(${name}, ${startTime})`,
        );
      },
      onTransitionComplete: (name, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onTransitionComplete(${name}, ${startTime}, ${endTime})`,
        );
      },
      onMarkerComplete: (transitioName, markerName, startTime, endTime) => {
        Scheduler.unstable_yieldValue(
          `onMarkerComplete(${transitioName}, ${markerName}, ${startTime}, ${endTime})`,
        );
      },
    };

    let navigateToPageTwo;
    let setMarkerNameFn;
    function App() {
      const [navigate, setNavigate] = useState(false);
      navigateToPageTwo = () => {
        setNavigate(true);
      };

      const [markerName, setMarkerName] = useState('old marker');
      setMarkerNameFn = () => setMarkerName('new marker');

      return (
        <div>
          {navigate ? (
            <React.unstable_TracingMarker name={markerName}>
              <Suspense fallback={<Text text="Loading..." />}>
                <AsyncText text="Page Two" />
              </Suspense>
            </React.unstable_TracingMarker>
          ) : (
            <Text text="Page One" />
          )}
        </div>
      );
    }

    const root = ReactNoop.createRoot({transitionCallbacks});
    await act(async () => {
      root.render(<App />);
      ReactNoop.expire(1000);
      await advanceTimers(1000);

      expect(Scheduler).toFlushAndYield(['Page One']);

      startTransition(() => navigateToPageTwo(), {name: 'page transition'});
      expect(Scheduler).toFlushAndYield([
        'Suspend [Page Two]',
        'Loading...',
        'onTransitionStart(page transition, 1000)',
      ]);

      ReactNoop.expire(1000);
      await advanceTimers(1000);
      startTransition(() => setMarkerNameFn(), {name: 'marker transition'});

      expect(Scheduler).toFlushAndYield([
        'Suspend [Page Two]',
        'Loading...',
        'onTransitionStart(marker transition, 2000)',
      ]);
      ReactNoop.expire(1000);
      await advanceTimers(1000);
      resolveText('Page Two');

      // Marker complete is not called because the marker name changed
      expect(Scheduler).toFlushAndYield([
        'Page Two',
        'onMarkerComplete(new marker, 2000, 3000)',
        'onTransitionComplete(page transition, 1000, 3000)',
      ]);
    });
  });
});
