/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

describe('ReactProfiler DevTools integration', () => {
  let React;
  let ReactFeatureFlags;
  let ReactTestRenderer;
  let Scheduler;
  let SchedulerTracing;
  let AdvanceTime;
  let hook;

  beforeEach(() => {
    global.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook = {
      inject: () => {},
      onCommitFiberRoot: jest.fn((rendererId, root) => {}),
      onCommitFiberUnmount: () => {},
      supportsFiber: true,
    };

    jest.resetModules();

    ReactFeatureFlags = require('shared/ReactFeatureFlags');
    ReactFeatureFlags.enableProfilerTimer = true;
    ReactFeatureFlags.enableSchedulerTracing = true;
    Scheduler = require('scheduler');
    SchedulerTracing = require('scheduler/tracing');
    React = require('react');
    ReactTestRenderer = require('react-test-renderer');

    AdvanceTime = class extends React.Component {
      static defaultProps = {
        byAmount: 10,
        shouldComponentUpdate: true,
      };
      shouldComponentUpdate(nextProps) {
        return nextProps.shouldComponentUpdate;
      }
      render() {
        // Simulate time passing when this component is rendered
        Scheduler.unstable_advanceTime(this.props.byAmount);
        return this.props.children || null;
      }
    };
  });

  it('should auto-Profile all fibers if the DevTools hook is detected', () => {
    const App = ({multiplier}) => {
      Scheduler.unstable_advanceTime(2);
      return (
        <React.Profiler id="Profiler" onRender={onRender}>
          <AdvanceTime byAmount={3 * multiplier} shouldComponentUpdate={true} />
          <AdvanceTime
            byAmount={7 * multiplier}
            shouldComponentUpdate={false}
          />
        </React.Profiler>
      );
    };

    const onRender = jest.fn(() => {});
    const rendered = ReactTestRenderer.create(<App multiplier={1} />);

    expect(hook.onCommitFiberRoot).toHaveBeenCalledTimes(1);

    // Measure observable timing using the Profiler component.
    // The time spent in App (above the Profiler) won't be included in the durations,
    // But needs to be accounted for in the offset times.
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenCalledWith(
      'Profiler',
      'mount',
      10,
      10,
      2,
      12,
      new Set(),
    );
    onRender.mockClear();

    // Measure unobservable timing required by the DevTools profiler.
    // At this point, the base time should include both:
    // The time 2ms in the App component itself, and
    // The 10ms spend in the Profiler sub-tree beneath.
    expect(rendered.root.findByType(App)._currentFiber().treeBaseDuration).toBe(
      12,
    );

    rendered.update(<App multiplier={2} />);

    // Measure observable timing using the Profiler component.
    // The time spent in App (above the Profiler) won't be included in the durations,
    // But needs to be accounted for in the offset times.
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenCalledWith(
      'Profiler',
      'update',
      6,
      13,
      14,
      20,
      new Set(),
    );

    // Measure unobservable timing required by the DevTools profiler.
    // At this point, the base time should include both:
    // The initial 9ms for the components that do not re-render, and
    // The updated 6ms for the component that does.
    expect(rendered.root.findByType(App)._currentFiber().treeBaseDuration).toBe(
      15,
    );
  });

  it('should reset the fiber stack correctly after an error when profiling host roots', () => {
    Scheduler.unstable_advanceTime(20);

    const rendered = ReactTestRenderer.create(
      <div>
        <AdvanceTime byAmount={2} />
      </div>,
    );

    Scheduler.unstable_advanceTime(20);

    expect(() => {
      rendered.update(
        <div ref="this-will-cause-an-error">
          <AdvanceTime byAmount={3} />
        </div>,
      );
    }).toThrow();

    Scheduler.unstable_advanceTime(20);

    // But this should render correctly, if the profiler's fiber stack has been reset.
    rendered.update(
      <div>
        <AdvanceTime byAmount={7} />
      </div>,
    );

    // Measure unobservable timing required by the DevTools profiler.
    // At this point, the base time should include only the most recent (not failed) render.
    // It should not include time spent on the initial render,
    // Or time that elapsed between any of the above renders.
    expect(
      rendered.root.findByType('div')._currentFiber().treeBaseDuration,
    ).toBe(7);
  });

  it('should store traced interactions on the HostNode so DevTools can access them', () => {
    // Render without an interaction
    const rendered = ReactTestRenderer.create(<div />);

    const root = rendered.root._currentFiber().return;
    expect(root.stateNode.memoizedInteractions).toContainNoInteractions();

    Scheduler.unstable_advanceTime(10);

    const eventTime = Scheduler.unstable_now();

    // Render with an interaction
    SchedulerTracing.unstable_trace('some event', eventTime, () => {
      rendered.update(<div />);
    });

    expect(root.stateNode.memoizedInteractions).toMatchInteractions([
      {name: 'some event', timestamp: eventTime},
    ]);
  });

  // @gate experimental || !enableSyncDefaultUpdates
  it('regression test: #17159', () => {
    function Text({text}) {
      Scheduler.unstable_yieldValue(text);
      return text;
    }

    const root = ReactTestRenderer.create(null, {unstable_isConcurrent: true});

    // Commit something
    root.update(<Text text="A" />);
    expect(Scheduler).toFlushAndYield(['A']);
    expect(root).toMatchRenderedOutput('A');

    // Advance time by many seconds, larger than the default expiration time
    // for updates.
    Scheduler.unstable_advanceTime(10000);
    // Schedule an update.
    if (gate(flags => flags.enableSyncDefaultUpdates)) {
      React.unstable_startTransition(() => {
        root.update(<Text text="B" />);
      });
    } else {
      root.update(<Text text="B" />);
    }

    // Update B should not instantly expire.
    expect(Scheduler).toFlushAndYieldThrough([]);

    expect(Scheduler).toFlushAndYield(['B']);
    expect(root).toMatchRenderedOutput('B');
  });
});
