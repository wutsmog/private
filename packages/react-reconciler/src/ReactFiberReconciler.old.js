/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactFiber';
import type {FiberRoot} from './ReactFiberRoot';
import type {RootTag} from 'react-reconciler/src/ReactRootTags';
import type {
  Instance,
  TextInstance,
  Container,
  PublicInstance,
} from './ReactFiberHostConfig';
import {FundamentalComponent} from './ReactWorkTags';
import type {ReactNodeList, Thenable} from 'shared/ReactTypes';
import type {ExpirationTime} from './ReactFiberExpirationTime';
import type {
  SuspenseHydrationCallbacks,
  SuspenseState,
} from './ReactFiberSuspenseComponent';

import {
  findCurrentHostFiber,
  findCurrentHostFiberWithNoPortals,
} from 'react-reconciler/src/ReactFiberTreeReflection';
import {get as getInstance} from 'shared/ReactInstanceMap';
import {
  HostComponent,
  ClassComponent,
  HostRoot,
  SuspenseComponent,
} from './ReactWorkTags';
import getComponentName from 'shared/getComponentName';
import invariant from 'shared/invariant';
import ReactSharedInternals from 'shared/ReactSharedInternals';

import {getPublicInstance} from './ReactFiberHostConfig';
import {
  findCurrentUnmaskedContext,
  processChildContext,
  emptyContextObject,
  isContextProvider as isLegacyContextProvider,
} from './ReactFiberContext';
import {createFiberRoot} from './ReactFiberRoot';
import {injectInternals, onScheduleRoot} from './ReactFiberDevToolsHook';
import {
  requestCurrentTimeForUpdate,
  computeExpirationForFiber,
  scheduleUpdateOnFiber,
  flushRoot,
  batchedEventUpdates,
  batchedUpdates,
  unbatchedUpdates,
  flushSync,
  flushControlled,
  deferredUpdates,
  syncUpdates,
  discreteUpdates,
  flushDiscreteUpdates,
  flushPassiveEffects,
  warnIfNotScopedWithMatchingAct,
  warnIfUnmockedScheduler,
  IsThisRendererActing,
} from './ReactFiberWorkLoop';
import {createUpdate, enqueueUpdate} from './ReactUpdateQueue';
import {
  getStackByFiberInDevAndProd,
  isRendering as ReactCurrentFiberIsRendering,
  current as ReactCurrentFiberCurrent,
} from './ReactCurrentFiber';
import {StrictMode} from './ReactTypeOfMode';
import {
  Sync,
  ContinuousHydration,
  computeInteractiveExpiration,
} from './ReactFiberExpirationTime';
import {requestCurrentSuspenseConfig} from './ReactFiberSuspenseConfig';
import {
  scheduleRefresh,
  scheduleRoot,
  setRefreshHandler,
  findHostInstancesForRefresh,
} from './ReactFiberHotReloading';

// used by isTestEnvironment builds
import enqueueTask from 'shared/enqueueTask';
import * as Scheduler from 'scheduler';
// end isTestEnvironment imports

export {createPortal} from './ReactPortal';

type OpaqueRoot = FiberRoot;

// 0 is PROD, 1 is DEV.
// Might add PROFILE later.
type BundleType = 0 | 1;

type DevToolsConfig = {|
  bundleType: BundleType,
  version: string,
  rendererPackageName: string,
  // Note: this actually *does* depend on Fiber internal fields.
  // Used by "inspect clicked DOM element" in React DevTools.
  findFiberByHostInstance?: (instance: Instance | TextInstance) => Fiber | null,
  // Used by RN in-app inspector.
  // This API is unfortunately RN-specific.
  // TODO: Change it to accept Fiber instead and type it properly.
  getInspectorDataForViewTag?: (tag: number) => Object,
|};

let didWarnAboutNestedUpdates;
let didWarnAboutFindNodeInStrictMode;

if (__DEV__) {
  didWarnAboutNestedUpdates = false;
  didWarnAboutFindNodeInStrictMode = {};
}

function getContextForSubtree(
  parentComponent: ?React$Component<any, any>,
): Object {
  if (!parentComponent) {
    return emptyContextObject;
  }

  const fiber = getInstance(parentComponent);
  const parentContext = findCurrentUnmaskedContext(fiber);

  if (fiber.tag === ClassComponent) {
    const Component = fiber.type;
    if (isLegacyContextProvider(Component)) {
      return processChildContext(fiber, Component, parentContext);
    }
  }

  return parentContext;
}

function findHostInstance(component: Object): PublicInstance | null {
  const fiber = getInstance(component);
  if (fiber === undefined) {
    if (typeof component.render === 'function') {
      invariant(false, 'Unable to find node on an unmounted component.');
    } else {
      invariant(
        false,
        'Argument appears to not be a ReactComponent. Keys: %s',
        Object.keys(component),
      );
    }
  }
  const hostFiber = findCurrentHostFiber(fiber);
  if (hostFiber === null) {
    return null;
  }
  return hostFiber.stateNode;
}

function findHostInstanceWithWarning(
  component: Object,
  methodName: string,
): PublicInstance | null {
  if (__DEV__) {
    const fiber = getInstance(component);
    if (fiber === undefined) {
      if (typeof component.render === 'function') {
        invariant(false, 'Unable to find node on an unmounted component.');
      } else {
        invariant(
          false,
          'Argument appears to not be a ReactComponent. Keys: %s',
          Object.keys(component),
        );
      }
    }
    const hostFiber = findCurrentHostFiber(fiber);
    if (hostFiber === null) {
      return null;
    }
    if (hostFiber.mode & StrictMode) {
      const componentName = getComponentName(fiber.type) || 'Component';
      if (!didWarnAboutFindNodeInStrictMode[componentName]) {
        didWarnAboutFindNodeInStrictMode[componentName] = true;
        if (fiber.mode & StrictMode) {
          console.error(
            '%s is deprecated in StrictMode. ' +
              '%s was passed an instance of %s which is inside StrictMode. ' +
              'Instead, add a ref directly to the element you want to reference. ' +
              'Learn more about using refs safely here: ' +
              'https://fb.me/react-strict-mode-find-node%s',
            methodName,
            methodName,
            componentName,
            getStackByFiberInDevAndProd(hostFiber),
          );
        } else {
          console.error(
            '%s is deprecated in StrictMode. ' +
              '%s was passed an instance of %s which renders StrictMode children. ' +
              'Instead, add a ref directly to the element you want to reference. ' +
              'Learn more about using refs safely here: ' +
              'https://fb.me/react-strict-mode-find-node%s',
            methodName,
            methodName,
            componentName,
            getStackByFiberInDevAndProd(hostFiber),
          );
        }
      }
    }
    return hostFiber.stateNode;
  }
  return findHostInstance(component);
}

export function createContainer(
  containerInfo: Container,
  tag: RootTag,
  hydrate: boolean,
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
): OpaqueRoot {
  return createFiberRoot(containerInfo, tag, hydrate, hydrationCallbacks);
}

export function updateContainer(
  element: ReactNodeList,
  container: OpaqueRoot,
  parentComponent: ?React$Component<any, any>,
  callback: ?Function,
): ExpirationTime {
  if (__DEV__) {
    onScheduleRoot(container, element);
  }
  const current = container.current;
  const currentTime = requestCurrentTimeForUpdate();
  if (__DEV__) {
    // $FlowExpectedError - jest isn't a global, and isn't recognized outside of tests
    if ('undefined' !== typeof jest) {
      warnIfUnmockedScheduler(current);
      warnIfNotScopedWithMatchingAct(current);
    }
  }
  const suspenseConfig = requestCurrentSuspenseConfig();
  const expirationTime = computeExpirationForFiber(
    currentTime,
    current,
    suspenseConfig,
  );

  const context = getContextForSubtree(parentComponent);
  if (container.context === null) {
    container.context = context;
  } else {
    container.pendingContext = context;
  }

  if (__DEV__) {
    if (
      ReactCurrentFiberIsRendering &&
      ReactCurrentFiberCurrent !== null &&
      !didWarnAboutNestedUpdates
    ) {
      didWarnAboutNestedUpdates = true;
      console.error(
        'Render methods should be a pure function of props and state; ' +
          'triggering nested component updates from render is not allowed. ' +
          'If necessary, trigger nested updates in componentDidUpdate.\n\n' +
          'Check the render method of %s.',
        getComponentName(ReactCurrentFiberCurrent.type) || 'Unknown',
      );
    }
  }

  const update = createUpdate(expirationTime, suspenseConfig);
  // Caution: React DevTools currently depends on this property
  // being called "element".
  update.payload = {element};

  callback = callback === undefined ? null : callback;
  if (callback !== null) {
    if (__DEV__) {
      if (typeof callback !== 'function') {
        console.error(
          'render(...): Expected the last optional `callback` argument to be a ' +
            'function. Instead received: %s.',
          callback,
        );
      }
    }
    update.callback = callback;
  }

  enqueueUpdate(current, update);
  scheduleUpdateOnFiber(current, expirationTime);

  return expirationTime;
}

export {
  batchedEventUpdates,
  batchedUpdates,
  unbatchedUpdates,
  deferredUpdates,
  syncUpdates,
  discreteUpdates,
  flushDiscreteUpdates,
  flushControlled,
  flushSync,
  flushPassiveEffects,
  IsThisRendererActing,
};

export function getPublicRootInstance(
  container: OpaqueRoot,
): React$Component<any, any> | PublicInstance | null {
  const containerFiber = container.current;
  if (!containerFiber.child) {
    return null;
  }
  switch (containerFiber.child.tag) {
    case HostComponent:
      return getPublicInstance(containerFiber.child.stateNode);
    default:
      return containerFiber.child.stateNode;
  }
}

export function attemptSynchronousHydration(fiber: Fiber): void {
  switch (fiber.tag) {
    case HostRoot:
      let root: FiberRoot = fiber.stateNode;
      if (root.hydrate) {
        // Flush the first scheduled "update".
        flushRoot(root, root.firstPendingTime);
      }
      break;
    case SuspenseComponent:
      flushSync(() => scheduleUpdateOnFiber(fiber, Sync));
      // If we're still blocked after this, we need to increase
      // the priority of any promises resolving within this
      // boundary so that they next attempt also has higher pri.
      let retryExpTime = computeInteractiveExpiration(
        requestCurrentTimeForUpdate(),
      );
      markRetryTimeIfNotHydrated(fiber, retryExpTime);
      break;
  }
}

function markRetryTimeImpl(fiber: Fiber, retryTime: ExpirationTime) {
  let suspenseState: null | SuspenseState = fiber.memoizedState;
  if (suspenseState !== null && suspenseState.dehydrated !== null) {
    if (suspenseState.retryTime < retryTime) {
      suspenseState.retryTime = retryTime;
    }
  }
}

// Increases the priority of thennables when they resolve within this boundary.
function markRetryTimeIfNotHydrated(fiber: Fiber, retryTime: ExpirationTime) {
  markRetryTimeImpl(fiber, retryTime);
  let alternate = fiber.alternate;
  if (alternate) {
    markRetryTimeImpl(alternate, retryTime);
  }
}

export function attemptUserBlockingHydration(fiber: Fiber): void {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority and they should not suspend on I/O,
    // since you have to wrap anything that might suspend in
    // Suspense.
    return;
  }
  let expTime = computeInteractiveExpiration(requestCurrentTimeForUpdate());
  scheduleUpdateOnFiber(fiber, expTime);
  markRetryTimeIfNotHydrated(fiber, expTime);
}

export function attemptContinuousHydration(fiber: Fiber): void {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority and they should not suspend on I/O,
    // since you have to wrap anything that might suspend in
    // Suspense.
    return;
  }
  scheduleUpdateOnFiber(fiber, ContinuousHydration);
  markRetryTimeIfNotHydrated(fiber, ContinuousHydration);
}

export function attemptHydrationAtCurrentPriority(fiber: Fiber): void {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority other than synchronously flush it.
    return;
  }
  const currentTime = requestCurrentTimeForUpdate();
  const expTime = computeExpirationForFiber(currentTime, fiber, null);
  scheduleUpdateOnFiber(fiber, expTime);
  markRetryTimeIfNotHydrated(fiber, expTime);
}

export {findHostInstance};

export {findHostInstanceWithWarning};

export function findHostInstanceWithNoPortals(
  fiber: Fiber,
): PublicInstance | null {
  const hostFiber = findCurrentHostFiberWithNoPortals(fiber);
  if (hostFiber === null) {
    return null;
  }
  if (hostFiber.tag === FundamentalComponent) {
    return hostFiber.stateNode.instance;
  }
  return hostFiber.stateNode;
}

let shouldSuspendImpl = fiber => false;

export function shouldSuspend(fiber: Fiber): boolean {
  return shouldSuspendImpl(fiber);
}

let overrideHookState = null;
let overrideProps = null;
let scheduleUpdate = null;
let setSuspenseHandler = null;

if (__DEV__) {
  const copyWithSetImpl = (
    obj: Object | Array<any>,
    path: Array<string | number>,
    idx: number,
    value: any,
  ) => {
    if (idx >= path.length) {
      return value;
    }
    const key = path[idx];
    const updated = Array.isArray(obj) ? obj.slice() : {...obj};
    // $FlowFixMe number or string is fine here
    updated[key] = copyWithSetImpl(obj[key], path, idx + 1, value);
    return updated;
  };

  const copyWithSet = (
    obj: Object | Array<any>,
    path: Array<string | number>,
    value: any,
  ): Object | Array<any> => {
    return copyWithSetImpl(obj, path, 0, value);
  };

  // Support DevTools editable values for useState and useReducer.
  overrideHookState = (
    fiber: Fiber,
    id: number,
    path: Array<string | number>,
    value: any,
  ) => {
    // For now, the "id" of stateful hooks is just the stateful hook index.
    // This may change in the future with e.g. nested hooks.
    let currentHook = fiber.memoizedState;
    while (currentHook !== null && id > 0) {
      currentHook = currentHook.next;
      id--;
    }
    if (currentHook !== null) {
      const newState = copyWithSet(currentHook.memoizedState, path, value);
      currentHook.memoizedState = newState;
      currentHook.baseState = newState;

      // We aren't actually adding an update to the queue,
      // because there is no update we can add for useReducer hooks that won't trigger an error.
      // (There's no appropriate action type for DevTools overrides.)
      // As a result though, React will see the scheduled update as a noop and bailout.
      // Shallow cloning props works as a workaround for now to bypass the bailout check.
      fiber.memoizedProps = {...fiber.memoizedProps};

      scheduleUpdateOnFiber(fiber, Sync);
    }
  };

  // Support DevTools props for function components, forwardRef, memo, host components, etc.
  overrideProps = (fiber: Fiber, path: Array<string | number>, value: any) => {
    fiber.pendingProps = copyWithSet(fiber.memoizedProps, path, value);
    if (fiber.alternate) {
      fiber.alternate.pendingProps = fiber.pendingProps;
    }
    scheduleUpdateOnFiber(fiber, Sync);
  };

  scheduleUpdate = (fiber: Fiber) => {
    scheduleUpdateOnFiber(fiber, Sync);
  };

  setSuspenseHandler = (newShouldSuspendImpl: Fiber => boolean) => {
    shouldSuspendImpl = newShouldSuspendImpl;
  };
}

export function injectIntoDevTools(devToolsConfig: DevToolsConfig): boolean {
  const {findFiberByHostInstance} = devToolsConfig;
  const {ReactCurrentDispatcher} = ReactSharedInternals;

  return injectInternals({
    bundleType: devToolsConfig.bundleType,
    version: devToolsConfig.version,
    rendererPackageName: devToolsConfig.rendererPackageName,
    getInspectorDataForViewTag: devToolsConfig.getInspectorDataForViewTag,
    overrideHookState,
    overrideProps,
    setSuspenseHandler,
    scheduleUpdate,
    currentDispatcherRef: ReactCurrentDispatcher,
    findHostInstanceByFiber(fiber: Fiber): Instance | TextInstance | null {
      const hostFiber = findCurrentHostFiber(fiber);
      if (hostFiber === null) {
        return null;
      }
      return hostFiber.stateNode;
    },
    findFiberByHostInstance(instance: Instance | TextInstance): Fiber | null {
      if (!findFiberByHostInstance) {
        // Might not be implemented by the renderer.
        return null;
      }
      return findFiberByHostInstance(instance);
    },
    // React Refresh
    findHostInstancesForRefresh: __DEV__ ? findHostInstancesForRefresh : null,
    scheduleRefresh: __DEV__ ? scheduleRefresh : null,
    scheduleRoot: __DEV__ ? scheduleRoot : null,
    setRefreshHandler: __DEV__ ? setRefreshHandler : null,
    // Enables DevTools to append owner stacks to error messages in DEV mode.
    getCurrentFiber: __DEV__ ? () => ReactCurrentFiberCurrent : null,
  });
}

const {IsSomeRendererActing} = ReactSharedInternals;
const isSchedulerMocked =
  typeof Scheduler.unstable_flushAllWithoutAsserting === 'function';
const flushWork =
  Scheduler.unstable_flushAllWithoutAsserting ||
  function() {
    let didFlushWork = false;
    while (flushPassiveEffects()) {
      didFlushWork = true;
    }

    return didFlushWork;
  };

function flushWorkAndMicroTasks(onDone: (err: ?Error) => void) {
  try {
    flushWork();
    enqueueTask(() => {
      if (flushWork()) {
        flushWorkAndMicroTasks(onDone);
      } else {
        onDone();
      }
    });
  } catch (err) {
    onDone(err);
  }
}

// we track the 'depth' of the act() calls with this counter,
// so we can tell if any async act() calls try to run in parallel.

let actingUpdatesScopeDepth = 0;
let didWarnAboutUsingActInProd = false;

// eslint-disable-next-line no-inner-declarations
export function act(callback: () => Thenable<mixed>): Thenable<void> {
  if (!__DEV__) {
    if (didWarnAboutUsingActInProd === false) {
      didWarnAboutUsingActInProd = true;
      // eslint-disable-next-line react-internal/no-production-logging
      console.error(
        'act(...) is not supported in production builds of React, and might not behave as expected.',
      );
    }
  }

  let previousActingUpdatesScopeDepth = actingUpdatesScopeDepth;
  let previousIsSomeRendererActing;
  let previousIsThisRendererActing;
  actingUpdatesScopeDepth++;

  previousIsSomeRendererActing = IsSomeRendererActing.current;
  previousIsThisRendererActing = IsThisRendererActing.current;
  IsSomeRendererActing.current = true;
  IsThisRendererActing.current = true;

  function onDone() {
    actingUpdatesScopeDepth--;
    IsSomeRendererActing.current = previousIsSomeRendererActing;
    IsThisRendererActing.current = previousIsThisRendererActing;
    if (__DEV__) {
      if (actingUpdatesScopeDepth > previousActingUpdatesScopeDepth) {
        // if it's _less than_ previousActingUpdatesScopeDepth, then we can assume the 'other' one has warned
        console.error(
          'You seem to have overlapping act() calls, this is not supported. ' +
            'Be sure to await previous act() calls before making a new one. ',
        );
      }
    }
  }

  let result;
  try {
    result = batchedUpdates(callback);
  } catch (error) {
    // on sync errors, we still want to 'cleanup' and decrement actingUpdatesScopeDepth
    onDone();
    throw error;
  }

  if (
    result !== null &&
    typeof result === 'object' &&
    typeof result.then === 'function'
  ) {
    // setup a boolean that gets set to true only
    // once this act() call is await-ed
    let called = false;
    if (__DEV__) {
      if (typeof Promise !== 'undefined') {
        //eslint-disable-next-line no-undef
        Promise.resolve()
          .then(() => {})
          .then(() => {
            if (called === false) {
              console.error(
                'You called act(async () => ...) without await. ' +
                  'This could lead to unexpected testing behaviour, interleaving multiple act ' +
                  'calls and mixing their scopes. You should - await act(async () => ...);',
              );
            }
          });
      }
    }

    // in the async case, the returned thenable runs the callback, flushes
    // effects and  microtasks in a loop until flushPassiveEffects() === false,
    // and cleans up
    return {
      then(resolve, reject) {
        called = true;
        result.then(
          () => {
            if (
              actingUpdatesScopeDepth > 1 ||
              (isSchedulerMocked === true &&
                previousIsSomeRendererActing === true)
            ) {
              onDone();
              resolve();
              return;
            }
            // we're about to exit the act() scope,
            // now's the time to flush tasks/effects
            flushWorkAndMicroTasks((err: ?Error) => {
              onDone();
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          },
          err => {
            onDone();
            reject(err);
          },
        );
      },
    };
  } else {
    if (__DEV__) {
      if (result !== undefined) {
        console.error(
          'The callback passed to act(...) function ' +
            'must return undefined, or a Promise. You returned %s',
          result,
        );
      }
    }

    // flush effects until none remain, and cleanup
    try {
      if (
        actingUpdatesScopeDepth === 1 &&
        (isSchedulerMocked === false || previousIsSomeRendererActing === false)
      ) {
        // we're about to exit the act() scope,
        // now's the time to flush effects
        flushWork();
      }
      onDone();
    } catch (err) {
      onDone();
      throw err;
    }

    // in the sync case, the returned thenable only warns *if* await-ed
    return {
      then(resolve) {
        if (__DEV__) {
          console.error(
            'Do not await the result of calling act(...) with sync logic, it is not a Promise.',
          );
        }
        resolve();
      },
    };
  }
}
