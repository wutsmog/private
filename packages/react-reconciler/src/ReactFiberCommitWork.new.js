/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {
  Instance,
  TextInstance,
  SuspenseInstance,
  Container,
  ChildSet,
  UpdatePayload,
} from './ReactFiberHostConfig';
import type {Fiber} from './ReactInternalTypes';
import type {FiberRoot} from './ReactInternalTypes';
import type {SuspenseState} from './ReactFiberSuspenseComponent.new';
import type {UpdateQueue} from './ReactUpdateQueue.new';
import type {FunctionComponentUpdateQueue} from './ReactFiberHooks.new';
import type {Wakeable} from 'shared/ReactTypes';
import type {ReactPriorityLevel} from './ReactInternalTypes';
import type {OffscreenState} from './ReactFiberOffscreenComponent';
import type {HookFlags} from './ReactHookEffectTags';
import type {Flags} from './ReactFiberFlags';

import {unstable_wrap as Schedule_tracing_wrap} from 'scheduler/tracing';
import {
  enableSchedulerTracing,
  enableProfilerTimer,
  enableProfilerCommitHooks,
  enableSuspenseServerRenderer,
  enableFundamentalAPI,
  enableSuspenseCallback,
  enableScopeAPI,
  enableDoubleInvokingEffects,
  enableRecursiveCommitTraversal,
} from 'shared/ReactFeatureFlags';
import {
  FunctionComponent,
  ForwardRef,
  ClassComponent,
  HostRoot,
  HostComponent,
  HostText,
  HostPortal,
  Profiler,
  SuspenseComponent,
  DehydratedFragment,
  IncompleteClassComponent,
  MemoComponent,
  SimpleMemoComponent,
  SuspenseListComponent,
  FundamentalComponent,
  ScopeComponent,
  OffscreenComponent,
  LegacyHiddenComponent,
} from './ReactWorkTags';
import {
  invokeGuardedCallback,
  hasCaughtError,
  clearCaughtError,
} from 'shared/ReactErrorUtils';
import {
  NoFlags,
  ContentReset,
  Placement,
  Snapshot,
  Visibility,
  Update,
  Callback,
  Ref,
  PlacementAndUpdate,
  Hydrating,
  HydratingAndUpdate,
  Passive,
  PassiveStatic,
  BeforeMutationMask,
  MutationMask,
  LayoutMask,
  PassiveMask,
  MountLayoutDev,
  MountPassiveDev,
} from './ReactFiberFlags';
import getComponentName from 'shared/getComponentName';
import invariant from 'shared/invariant';
import {
  current as currentDebugFiberInDEV,
  resetCurrentFiber as resetCurrentDebugFiberInDEV,
  setCurrentFiber as setCurrentDebugFiberInDEV,
} from './ReactCurrentFiber';
import {onCommitUnmount} from './ReactFiberDevToolsHook.new';
import {resolveDefaultProps} from './ReactFiberLazyComponent.new';
import {
  getCommitTime,
  recordLayoutEffectDuration,
  startLayoutEffectTimer,
  recordPassiveEffectDuration,
  startPassiveEffectTimer,
} from './ReactProfilerTimer.new';
import {
  NoMode,
  BlockingMode,
  ConcurrentMode,
  ProfileMode,
} from './ReactTypeOfMode';
import {commitUpdateQueue} from './ReactUpdateQueue.new';
import {
  getPublicInstance,
  supportsMutation,
  supportsPersistence,
  supportsHydration,
  prepareForCommit,
  beforeActiveInstanceBlur,
  commitMount,
  commitUpdate,
  resetTextContent,
  commitTextUpdate,
  appendChild,
  appendChildToContainer,
  insertBefore,
  insertInContainerBefore,
  removeChild,
  removeChildFromContainer,
  clearSuspenseBoundary,
  clearSuspenseBoundaryFromContainer,
  replaceContainerChildren,
  createContainerChildSet,
  hideInstance,
  hideTextInstance,
  unhideInstance,
  unhideTextInstance,
  unmountFundamentalComponent,
  updateFundamentalComponent,
  commitHydratedContainer,
  commitHydratedSuspenseInstance,
  clearContainer,
  prepareScopeUpdate,
} from './ReactFiberHostConfig';
import {
  captureCommitPhaseError,
  resolveRetryWakeable,
  markCommitTimeOfFallback,
} from './ReactFiberWorkLoop.new';
import {
  NoFlags as NoHookEffect,
  HasEffect as HookHasEffect,
  Layout as HookLayout,
  Passive as HookPassive,
} from './ReactHookEffectTags';
import {didWarnAboutReassigningProps} from './ReactFiberBeginWork.new';
import {doesFiberContain} from './ReactFiberTreeReflection';

let nextEffect: Fiber | null = null;

// Used to avoid traversing the return path to find the nearest Profiler ancestor during commit.
let nearestProfilerOnStack: Fiber | null = null;

let didWarnAboutUndefinedSnapshotBeforeUpdate: Set<mixed> | null = null;
if (__DEV__) {
  didWarnAboutUndefinedSnapshotBeforeUpdate = new Set();
}

const PossiblyWeakSet = typeof WeakSet === 'function' ? WeakSet : Set;

const callComponentWillUnmountWithTimer = function(current, instance) {
  instance.props = current.memoizedProps;
  instance.state = current.memoizedState;
  if (
    enableProfilerTimer &&
    enableProfilerCommitHooks &&
    current.mode & ProfileMode
  ) {
    try {
      startLayoutEffectTimer();
      instance.componentWillUnmount();
    } finally {
      recordLayoutEffectDuration(current);
    }
  } else {
    instance.componentWillUnmount();
  }
};

// Capture errors so they don't interrupt unmounting.
function safelyCallComponentWillUnmount(
  current: Fiber,
  instance: any,
  nearestMountedAncestor: Fiber | null,
) {
  if (__DEV__) {
    invokeGuardedCallback(
      null,
      callComponentWillUnmountWithTimer,
      null,
      current,
      instance,
    );
    if (hasCaughtError()) {
      const unmountError = clearCaughtError();
      captureCommitPhaseError(current, nearestMountedAncestor, unmountError);
    }
  } else {
    try {
      callComponentWillUnmountWithTimer(current, instance);
    } catch (unmountError) {
      captureCommitPhaseError(current, nearestMountedAncestor, unmountError);
    }
  }
}

/** @noinline */
function safelyDetachRef(current: Fiber, nearestMountedAncestor: Fiber) {
  const ref = current.ref;
  if (ref !== null) {
    if (typeof ref === 'function') {
      if (__DEV__) {
        if (
          enableProfilerTimer &&
          enableProfilerCommitHooks &&
          current.mode & ProfileMode
        ) {
          startLayoutEffectTimer();
          invokeGuardedCallback(null, ref, null, null);
          recordLayoutEffectDuration(current);
        } else {
          invokeGuardedCallback(null, ref, null, null);
        }

        if (hasCaughtError()) {
          const refError = clearCaughtError();
          captureCommitPhaseError(current, nearestMountedAncestor, refError);
        }
      } else {
        try {
          if (
            enableProfilerTimer &&
            enableProfilerCommitHooks &&
            current.mode & ProfileMode
          ) {
            try {
              startLayoutEffectTimer();
              ref(null);
            } finally {
              recordLayoutEffectDuration(current);
            }
          } else {
            ref(null);
          }
        } catch (refError) {
          captureCommitPhaseError(current, nearestMountedAncestor, refError);
        }
      }
    } else {
      ref.current = null;
    }
  }
}

export function safelyCallDestroy(
  current: Fiber,
  nearestMountedAncestor: Fiber | null,
  destroy: () => void,
) {
  if (__DEV__) {
    invokeGuardedCallback(null, destroy, null);
    if (hasCaughtError()) {
      const error = clearCaughtError();
      captureCommitPhaseError(current, nearestMountedAncestor, error);
    }
  } else {
    try {
      destroy();
    } catch (error) {
      captureCommitPhaseError(current, nearestMountedAncestor, error);
    }
  }
}

/** @noinline */
function commitHookEffectListUnmount(
  flags: HookFlags,
  finishedWork: Fiber,
  nearestMountedAncestor: Fiber | null,
) {
  const updateQueue: FunctionComponentUpdateQueue | null = (finishedWork.updateQueue: any);
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;
    do {
      if ((effect.tag & flags) === flags) {
        // Unmount
        const destroy = effect.destroy;
        effect.destroy = undefined;
        if (destroy !== undefined) {
          safelyCallDestroy(finishedWork, nearestMountedAncestor, destroy);
        }
      }
      effect = effect.next;
    } while (effect !== firstEffect);
  }
}

/** @noinline */
function commitHookEffectListMount(flags: HookFlags, finishedWork: Fiber) {
  const updateQueue: FunctionComponentUpdateQueue | null = (finishedWork.updateQueue: any);
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;
    do {
      if ((effect.tag & flags) === flags) {
        // Mount
        const create = effect.create;
        effect.destroy = create();

        if (__DEV__) {
          const destroy = effect.destroy;
          if (destroy !== undefined && typeof destroy !== 'function') {
            let addendum;
            if (destroy === null) {
              addendum =
                ' You returned null. If your effect does not require clean ' +
                'up, return undefined (or nothing).';
            } else if (typeof destroy.then === 'function') {
              addendum =
                '\n\nIt looks like you wrote useEffect(async () => ...) or returned a Promise. ' +
                'Instead, write the async function inside your effect ' +
                'and call it immediately:\n\n' +
                'useEffect(() => {\n' +
                '  async function fetchData() {\n' +
                '    // You can await here\n' +
                '    const response = await MyAPI.getData(someId);\n' +
                '    // ...\n' +
                '  }\n' +
                '  fetchData();\n' +
                `}, [someId]); // Or [] if effect doesn't need props or state\n\n` +
                'Learn more about data fetching with Hooks: https://reactjs.org/link/hooks-data-fetching';
            } else {
              addendum = ' You returned: ' + destroy;
            }
            console.error(
              'An effect function must not return anything besides a function, ' +
                'which is used for clean-up.%s',
              addendum,
            );
          }
        }
      }
      effect = effect.next;
    } while (effect !== firstEffect);
  }
}

function commitProfilerPassiveEffect(
  finishedRoot: FiberRoot,
  finishedWork: Fiber,
): void {
  if (enableProfilerTimer && enableProfilerCommitHooks) {
    switch (finishedWork.tag) {
      case Profiler: {
        const {passiveEffectDuration} = finishedWork.stateNode;
        const {id, onPostCommit} = finishedWork.memoizedProps;

        // This value will still reflect the previous commit phase.
        // It does not get reset until the start of the next commit phase.
        const commitTime = getCommitTime();

        if (typeof onPostCommit === 'function') {
          if (enableSchedulerTracing) {
            onPostCommit(
              id,
              finishedWork.alternate === null ? 'mount' : 'update',
              passiveEffectDuration,
              commitTime,
              finishedRoot.memoizedInteractions,
            );
          } else {
            onPostCommit(
              id,
              finishedWork.alternate === null ? 'mount' : 'update',
              passiveEffectDuration,
              commitTime,
            );
          }
        }
        break;
      }
      default:
        break;
    }
  }
}

let focusedInstanceHandle: null | Fiber = null;
let shouldFireAfterActiveInstanceBlur: boolean = false;

export function commitBeforeMutationEffects(
  root: FiberRoot,
  firstChild: Fiber,
) {
  focusedInstanceHandle = prepareForCommit(root.containerInfo);

  if (enableRecursiveCommitTraversal) {
    recursivelyCommitBeforeMutationEffects(firstChild);
  } else {
    nextEffect = firstChild;
    iterativelyCommitBeforeMutationEffects_begin();
  }

  // We no longer need to track the active instance fiber
  const shouldFire = shouldFireAfterActiveInstanceBlur;
  shouldFireAfterActiveInstanceBlur = false;
  focusedInstanceHandle = null;

  return shouldFire;
}

function recursivelyCommitBeforeMutationEffects(firstChild: Fiber) {
  let fiber = firstChild;
  while (fiber !== null) {
    // TODO: Should wrap this in flags check, too, as optimization
    if (fiber.deletions !== null) {
      commitBeforeMutationEffectsDeletions(fiber.deletions);
    }

    const child = fiber.child;
    if (fiber.subtreeFlags & BeforeMutationMask && child !== null) {
      recursivelyCommitBeforeMutationEffects(child);
    }

    if (__DEV__) {
      setCurrentDebugFiberInDEV(fiber);
      invokeGuardedCallback(
        null,
        commitBeforeMutationEffectsOnFiber,
        null,
        fiber,
      );
      if (hasCaughtError()) {
        const error = clearCaughtError();
        captureCommitPhaseError(fiber, fiber.return, error);
      }
      resetCurrentDebugFiberInDEV();
    } else {
      try {
        commitBeforeMutationEffectsOnFiber(fiber);
      } catch (error) {
        captureCommitPhaseError(fiber, fiber.return, error);
      }
    }
    fiber = fiber.sibling;
  }
}

function iterativelyCommitBeforeMutationEffects_begin() {
  while (nextEffect !== null) {
    const fiber = nextEffect;

    // TODO: Should wrap this in flags check, too, as optimization
    const deletions = fiber.deletions;
    if (deletions !== null) {
      commitBeforeMutationEffectsDeletions(deletions);
    }

    const child = fiber.child;
    if (
      (fiber.subtreeFlags & BeforeMutationMask) !== NoFlags &&
      child !== null
    ) {
      child.return = fiber;
      nextEffect = child;
    } else {
      iterativelyCommitBeforeMutationEffects_complete();
    }
  }
}

function iterativelyCommitBeforeMutationEffects_complete() {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    if (__DEV__) {
      setCurrentDebugFiberInDEV(fiber);
      invokeGuardedCallback(
        null,
        commitBeforeMutationEffectsOnFiber,
        null,
        fiber,
      );
      if (hasCaughtError()) {
        const error = clearCaughtError();
        captureCommitPhaseError(fiber, fiber.return, error);
      }
      resetCurrentDebugFiberInDEV();
    } else {
      try {
        commitBeforeMutationEffectsOnFiber(fiber);
      } catch (error) {
        captureCommitPhaseError(fiber, fiber.return, error);
      }
    }

    const sibling = fiber.sibling;
    if (sibling !== null) {
      sibling.return = fiber.return;
      nextEffect = sibling;
      return;
    }

    nextEffect = fiber.return;
  }
}

/** @noinline */
function commitBeforeMutationEffectsOnFiber(finishedWork: Fiber) {
  const current = finishedWork.alternate;
  const flags = finishedWork.flags;

  if (!shouldFireAfterActiveInstanceBlur && focusedInstanceHandle !== null) {
    // Check to see if the focused element was inside of a hidden (Suspense) subtree.
    if (
      // TODO: Can optimize this further with separate Hide and Show flags. We
      // only care about Hide here.
      (flags & Visibility) !== NoFlags &&
      finishedWork.tag === SuspenseComponent &&
      isSuspenseBoundaryBeingHidden(current, finishedWork) &&
      doesFiberContain(finishedWork, focusedInstanceHandle)
    ) {
      shouldFireAfterActiveInstanceBlur = true;
      beforeActiveInstanceBlur(finishedWork);
    }
  }

  if ((flags & Snapshot) !== NoFlags) {
    setCurrentDebugFiberInDEV(finishedWork);
    switch (finishedWork.tag) {
      case FunctionComponent:
      case ForwardRef:
      case SimpleMemoComponent: {
        break;
      }
      case ClassComponent: {
        if (finishedWork.flags & Snapshot) {
          if (current !== null) {
            const prevProps = current.memoizedProps;
            const prevState = current.memoizedState;
            const instance = finishedWork.stateNode;
            // We could update instance props and state here,
            // but instead we rely on them being set during last render.
            // TODO: revisit this when we implement resuming.
            if (__DEV__) {
              if (
                finishedWork.type === finishedWork.elementType &&
                !didWarnAboutReassigningProps
              ) {
                if (instance.props !== finishedWork.memoizedProps) {
                  console.error(
                    'Expected %s props to match memoized props before ' +
                      'getSnapshotBeforeUpdate. ' +
                      'This might either be because of a bug in React, or because ' +
                      'a component reassigns its own `this.props`. ' +
                      'Please file an issue.',
                    getComponentName(finishedWork.type) || 'instance',
                  );
                }
                if (instance.state !== finishedWork.memoizedState) {
                  console.error(
                    'Expected %s state to match memoized state before ' +
                      'getSnapshotBeforeUpdate. ' +
                      'This might either be because of a bug in React, or because ' +
                      'a component reassigns its own `this.state`. ' +
                      'Please file an issue.',
                    getComponentName(finishedWork.type) || 'instance',
                  );
                }
              }
            }
            const snapshot = instance.getSnapshotBeforeUpdate(
              finishedWork.elementType === finishedWork.type
                ? prevProps
                : resolveDefaultProps(finishedWork.type, prevProps),
              prevState,
            );
            if (__DEV__) {
              const didWarnSet = ((didWarnAboutUndefinedSnapshotBeforeUpdate: any): Set<mixed>);
              if (
                snapshot === undefined &&
                !didWarnSet.has(finishedWork.type)
              ) {
                didWarnSet.add(finishedWork.type);
                console.error(
                  '%s.getSnapshotBeforeUpdate(): A snapshot value (or null) ' +
                    'must be returned. You have returned undefined.',
                  getComponentName(finishedWork.type),
                );
              }
            }
            instance.__reactInternalSnapshotBeforeUpdate = snapshot;
          }
        }
        break;
      }
      case HostRoot: {
        if (supportsMutation) {
          if (finishedWork.flags & Snapshot) {
            const root = finishedWork.stateNode;
            clearContainer(root.containerInfo);
          }
        }
        break;
      }
      case HostComponent:
      case HostText:
      case HostPortal:
      case IncompleteClassComponent:
        // Nothing to do for these component types
        break;
      default:
        invariant(
          false,
          'This unit of work tag should not have side-effects. This error is ' +
            'likely caused by a bug in React. Please file an issue.',
        );
    }
    resetCurrentDebugFiberInDEV();
  }
}

/** @noinline */
function commitBeforeMutationEffectsDeletions(deletions: Array<Fiber>) {
  for (let i = 0; i < deletions.length; i++) {
    const fiber = deletions[i];

    // TODO (effects) It would be nice to avoid calling doesFiberContain()
    // Maybe we can repurpose one of the subtreeFlags positions for this instead?
    // Use it to store which part of the tree the focused instance is in?
    // This assumes we can safely determine that instance during the "render" phase.

    if (doesFiberContain(fiber, ((focusedInstanceHandle: any): Fiber))) {
      shouldFireAfterActiveInstanceBlur = true;
      beforeActiveInstanceBlur(fiber);
    }
  }
}

export function commitMutationEffects(
  firstChild: Fiber,
  root: FiberRoot,
  renderPriorityLevel: ReactPriorityLevel,
) {
  if (enableRecursiveCommitTraversal) {
    recursivelyCommitMutationEffects(firstChild, root, renderPriorityLevel);
  } else {
    nextEffect = firstChild;
    iterativelyCommitMutationEffects_begin(root, renderPriorityLevel);
  }
}

function recursivelyCommitMutationEffects(
  firstChild: Fiber,
  root: FiberRoot,
  renderPriorityLevel: ReactPriorityLevel,
) {
  let fiber = firstChild;
  while (fiber !== null) {
    const deletions = fiber.deletions;
    if (deletions !== null) {
      commitMutationEffectsDeletions(
        deletions,
        fiber,
        root,
        renderPriorityLevel,
      );
    }

    if (fiber.child !== null) {
      const mutationFlags = fiber.subtreeFlags & MutationMask;
      if (mutationFlags !== NoFlags) {
        recursivelyCommitMutationEffects(
          fiber.child,
          root,
          renderPriorityLevel,
        );
      }
    }

    if (__DEV__) {
      setCurrentDebugFiberInDEV(fiber);
      invokeGuardedCallback(
        null,
        commitMutationEffectsOnFiber,
        null,
        fiber,
        root,
        renderPriorityLevel,
      );
      if (hasCaughtError()) {
        const error = clearCaughtError();
        captureCommitPhaseError(fiber, fiber.return, error);
      }
      resetCurrentDebugFiberInDEV();
    } else {
      try {
        commitMutationEffectsOnFiber(fiber, root, renderPriorityLevel);
      } catch (error) {
        captureCommitPhaseError(fiber, fiber.return, error);
      }
    }
    fiber = fiber.sibling;
  }
}

function iterativelyCommitMutationEffects_begin(
  root: FiberRoot,
  renderPriorityLevel: ReactPriorityLevel,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;

    // TODO: Should wrap this in flags check, too, as optimization
    const deletions = fiber.deletions;
    if (deletions !== null) {
      commitMutationEffectsDeletions(
        deletions,
        fiber,
        root,
        renderPriorityLevel,
      );
    }

    const child = fiber.child;
    if ((fiber.subtreeFlags & MutationMask) !== NoFlags && child !== null) {
      child.return = fiber;
      nextEffect = child;
    } else {
      iterativelyCommitMutationEffects_complete(root, renderPriorityLevel);
    }
  }
}

function iterativelyCommitMutationEffects_complete(
  root: FiberRoot,
  renderPriorityLevel: ReactPriorityLevel,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    if (__DEV__) {
      setCurrentDebugFiberInDEV(fiber);
      invokeGuardedCallback(
        null,
        commitMutationEffectsOnFiber,
        null,
        fiber,
        root,
        renderPriorityLevel,
      );
      if (hasCaughtError()) {
        const error = clearCaughtError();
        captureCommitPhaseError(fiber, fiber.return, error);
      }
      resetCurrentDebugFiberInDEV();
    } else {
      try {
        commitMutationEffectsOnFiber(fiber, root, renderPriorityLevel);
      } catch (error) {
        captureCommitPhaseError(fiber, fiber.return, error);
      }
    }

    const sibling = fiber.sibling;
    if (sibling !== null) {
      sibling.return = fiber.return;
      nextEffect = sibling;
      return;
    }

    nextEffect = fiber.return;
  }
}

/** @noinline */
function commitMutationEffectsOnFiber(
  fiber: Fiber,
  root: FiberRoot,
  renderPriorityLevel,
) {
  const flags = fiber.flags;
  if (flags & ContentReset) {
    commitResetTextContent(fiber);
  }

  if (flags & Ref) {
    const current = fiber.alternate;
    if (current !== null) {
      commitDetachRef(current);
    }
    if (enableScopeAPI) {
      // TODO: This is a temporary solution that allowed us to transition away from React Flare on www.
      if (fiber.tag === ScopeComponent) {
        commitAttachRef(fiber);
      }
    }
  }

  // The following switch statement is only concerned about placement,
  // updates, and deletions. To avoid needing to add a case for every possible
  // bitmap value, we remove the secondary effects from the effect tag and
  // switch on that value.
  const primaryFlags = flags & (Placement | Update | Hydrating);
  switch (primaryFlags) {
    case Placement: {
      commitPlacement(fiber);
      // Clear the "placement" from effect tag so that we know that this is
      // inserted, before any life-cycles like componentDidMount gets called.
      // TODO: findDOMNode doesn't rely on this any more but isMounted does
      // and isMounted is deprecated anyway so we should be able to kill this.
      fiber.flags &= ~Placement;
      break;
    }
    case PlacementAndUpdate: {
      // Placement
      commitPlacement(fiber);
      // Clear the "placement" from effect tag so that we know that this is
      // inserted, before any life-cycles like componentDidMount gets called.
      fiber.flags &= ~Placement;

      // Update
      const current = fiber.alternate;
      commitWork(current, fiber);
      break;
    }
    case Hydrating: {
      fiber.flags &= ~Hydrating;
      break;
    }
    case HydratingAndUpdate: {
      fiber.flags &= ~Hydrating;

      // Update
      const current = fiber.alternate;
      commitWork(current, fiber);
      break;
    }
    case Update: {
      const current = fiber.alternate;
      commitWork(current, fiber);
      break;
    }
  }
}

/** @noinline */
function commitMutationEffectsDeletions(
  deletions: Array<Fiber>,
  nearestMountedAncestor: Fiber,
  root: FiberRoot,
  renderPriorityLevel,
) {
  for (let i = 0; i < deletions.length; i++) {
    const childToDelete = deletions[i];
    if (__DEV__) {
      invokeGuardedCallback(
        null,
        commitDeletion,
        null,
        root,
        childToDelete,
        nearestMountedAncestor,
        renderPriorityLevel,
      );
      if (hasCaughtError()) {
        const error = clearCaughtError();
        captureCommitPhaseError(childToDelete, nearestMountedAncestor, error);
      }
    } else {
      try {
        commitDeletion(
          root,
          childToDelete,
          nearestMountedAncestor,
          renderPriorityLevel,
        );
      } catch (error) {
        captureCommitPhaseError(childToDelete, nearestMountedAncestor, error);
      }
    }
  }
}

export function commitLayoutEffects(
  finishedWork: Fiber,
  finishedRoot: FiberRoot,
) {
  if (enableRecursiveCommitTraversal) {
    if (__DEV__) {
      setCurrentDebugFiberInDEV(finishedWork);
      invokeGuardedCallback(
        null,
        recursivelyCommitLayoutEffects,
        null,
        finishedWork,
        finishedRoot,
      );
      if (hasCaughtError()) {
        const error = clearCaughtError();
        captureCommitPhaseError(finishedWork, null, error);
      }
      resetCurrentDebugFiberInDEV();
    } else {
      try {
        recursivelyCommitLayoutEffects(finishedWork, finishedRoot);
      } catch (error) {
        captureCommitPhaseError(finishedWork, null, error);
      }
    }
  } else {
    nextEffect = finishedWork;
    iterativelyCommitLayoutEffects_begin(finishedWork, finishedRoot);
  }
}

function recursivelyCommitLayoutEffects(
  finishedWork: Fiber,
  finishedRoot: FiberRoot,
) {
  const {flags, tag} = finishedWork;
  switch (tag) {
    case Profiler: {
      let prevProfilerOnStack = null;
      if (enableProfilerTimer && enableProfilerCommitHooks) {
        prevProfilerOnStack = nearestProfilerOnStack;
        nearestProfilerOnStack = finishedWork;
      }

      let child = finishedWork.child;
      while (child !== null) {
        const primarySubtreeFlags = finishedWork.subtreeFlags & LayoutMask;
        if (primarySubtreeFlags !== NoFlags) {
          if (__DEV__) {
            const prevCurrentFiberInDEV = currentDebugFiberInDEV;
            setCurrentDebugFiberInDEV(child);
            invokeGuardedCallback(
              null,
              recursivelyCommitLayoutEffects,
              null,
              child,
              finishedRoot,
            );
            if (hasCaughtError()) {
              const error = clearCaughtError();
              captureCommitPhaseError(child, finishedWork, error);
            }
            if (prevCurrentFiberInDEV !== null) {
              setCurrentDebugFiberInDEV(prevCurrentFiberInDEV);
            } else {
              resetCurrentDebugFiberInDEV();
            }
          } else {
            try {
              recursivelyCommitLayoutEffects(child, finishedRoot);
            } catch (error) {
              captureCommitPhaseError(child, finishedWork, error);
            }
          }
        }
        child = child.sibling;
      }

      const primaryFlags = flags & (Update | Callback);
      if (primaryFlags !== NoFlags) {
        if (enableProfilerTimer) {
          if (__DEV__) {
            const prevCurrentFiberInDEV = currentDebugFiberInDEV;
            setCurrentDebugFiberInDEV(finishedWork);
            invokeGuardedCallback(
              null,
              commitLayoutEffectsForProfiler,
              null,
              finishedWork,
              finishedRoot,
            );
            if (hasCaughtError()) {
              const error = clearCaughtError();
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
            if (prevCurrentFiberInDEV !== null) {
              setCurrentDebugFiberInDEV(prevCurrentFiberInDEV);
            } else {
              resetCurrentDebugFiberInDEV();
            }
          } else {
            try {
              commitLayoutEffectsForProfiler(finishedWork, finishedRoot);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
        }
      }

      if (enableProfilerTimer && enableProfilerCommitHooks) {
        // Propagate layout effect durations to the next nearest Profiler ancestor.
        // Do not reset these values until the next render so DevTools has a chance to read them first.
        if (prevProfilerOnStack !== null) {
          prevProfilerOnStack.stateNode.effectDuration +=
            finishedWork.stateNode.effectDuration;
        }

        nearestProfilerOnStack = prevProfilerOnStack;
      }
      break;
    }

    // case Offscreen: {
    //   TODO: Fast path to invoke all nested layout effects when Offscren goes from hidden to visible.
    //   break;
    // }

    default: {
      let child = finishedWork.child;
      while (child !== null) {
        const primarySubtreeFlags = finishedWork.subtreeFlags & LayoutMask;
        if (primarySubtreeFlags !== NoFlags) {
          if (__DEV__) {
            const prevCurrentFiberInDEV = currentDebugFiberInDEV;
            setCurrentDebugFiberInDEV(child);
            invokeGuardedCallback(
              null,
              recursivelyCommitLayoutEffects,
              null,
              child,
              finishedRoot,
            );
            if (hasCaughtError()) {
              const error = clearCaughtError();
              captureCommitPhaseError(child, finishedWork, error);
            }
            if (prevCurrentFiberInDEV !== null) {
              setCurrentDebugFiberInDEV(prevCurrentFiberInDEV);
            } else {
              resetCurrentDebugFiberInDEV();
            }
          } else {
            try {
              recursivelyCommitLayoutEffects(child, finishedRoot);
            } catch (error) {
              captureCommitPhaseError(child, finishedWork, error);
            }
          }
        }
        child = child.sibling;
      }

      const primaryFlags = flags & (Update | Callback);
      if (primaryFlags !== NoFlags) {
        switch (tag) {
          case FunctionComponent:
          case ForwardRef:
          case SimpleMemoComponent: {
            if (
              enableProfilerTimer &&
              enableProfilerCommitHooks &&
              finishedWork.mode & ProfileMode
            ) {
              try {
                startLayoutEffectTimer();
                commitHookEffectListMount(
                  HookLayout | HookHasEffect,
                  finishedWork,
                );
              } finally {
                recordLayoutEffectDuration(finishedWork);
              }
            } else {
              commitHookEffectListMount(
                HookLayout | HookHasEffect,
                finishedWork,
              );
            }
            break;
          }
          case ClassComponent: {
            // NOTE: Layout effect durations are measured within this function.
            commitLayoutEffectsForClassComponent(finishedWork);
            break;
          }
          case HostRoot: {
            commitLayoutEffectsForHostRoot(finishedWork);
            break;
          }
          case HostComponent: {
            commitLayoutEffectsForHostComponent(finishedWork);
            break;
          }
          case SuspenseComponent: {
            commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
            break;
          }
          case FundamentalComponent:
          case HostPortal:
          case HostText:
          case IncompleteClassComponent:
          case LegacyHiddenComponent:
          case OffscreenComponent:
          case ScopeComponent:
          case SuspenseListComponent: {
            // We have no life-cycles associated with these component types.
            break;
          }
          default: {
            invariant(
              false,
              'This unit of work tag should not have side-effects. This error is ' +
                'likely caused by a bug in React. Please file an issue.',
            );
          }
        }
      }

      if (enableScopeAPI) {
        // TODO: This is a temporary solution that allowed us to transition away from React Flare on www.
        if (flags & Ref && tag !== ScopeComponent) {
          commitAttachRef(finishedWork);
        }
      } else {
        if (flags & Ref) {
          commitAttachRef(finishedWork);
        }
      }
      break;
    }
  }
}

function iterativelyCommitLayoutEffects_begin(
  subtreeRoot: Fiber,
  finishedRoot: FiberRoot,
) {
  while (nextEffect !== null) {
    const finishedWork: Fiber = nextEffect;
    const firstChild = finishedWork.child;

    if (
      (finishedWork.subtreeFlags & LayoutMask) !== NoFlags &&
      firstChild !== null
    ) {
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        finishedWork.tag === Profiler
      ) {
        const prevProfilerOnStack = nearestProfilerOnStack;
        nearestProfilerOnStack = finishedWork;

        let child = firstChild;
        while (child !== null) {
          nextEffect = child;
          iterativelyCommitLayoutEffects_begin(child, finishedRoot);
          child = child.sibling;
        }
        nextEffect = finishedWork;

        if ((finishedWork.flags & LayoutMask) !== NoFlags) {
          if (__DEV__) {
            setCurrentDebugFiberInDEV(finishedWork);
            invokeGuardedCallback(
              null,
              commitLayoutEffectsForProfiler,
              null,
              finishedWork,
              finishedRoot,
            );
            if (hasCaughtError()) {
              const error = clearCaughtError();
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
            resetCurrentDebugFiberInDEV();
          } else {
            try {
              commitLayoutEffectsForProfiler(finishedWork, finishedRoot);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
        }

        // Propagate layout effect durations to the next nearest Profiler ancestor.
        // Do not reset these values until the next render so DevTools has a chance to read them first.
        if (prevProfilerOnStack !== null) {
          prevProfilerOnStack.stateNode.effectDuration +=
            finishedWork.stateNode.effectDuration;
        }
        nearestProfilerOnStack = prevProfilerOnStack;

        if (finishedWork === subtreeRoot) {
          nextEffect = null;
          return;
        }
        const sibling = finishedWork.sibling;
        if (sibling !== null) {
          sibling.return = finishedWork.return;
          nextEffect = sibling;
        } else {
          nextEffect = finishedWork.return;
          iterativelyCommitLayoutEffects_complete(subtreeRoot, finishedRoot);
        }
      } else {
        firstChild.return = finishedWork;
        nextEffect = firstChild;
      }
    } else {
      iterativelyCommitLayoutEffects_complete(subtreeRoot, finishedRoot);
    }
  }
}

function iterativelyCommitLayoutEffects_complete(
  subtreeRoot: Fiber,
  finishedRoot: FiberRoot,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;

    if ((fiber.flags & LayoutMask) !== NoFlags) {
      if (__DEV__) {
        setCurrentDebugFiberInDEV(fiber);
        invokeGuardedCallback(
          null,
          commitLayoutEffectsOnFiber,
          null,
          finishedRoot,
          fiber,
        );
        if (hasCaughtError()) {
          const error = clearCaughtError();
          captureCommitPhaseError(fiber, fiber.return, error);
        }
        resetCurrentDebugFiberInDEV();
      } else {
        try {
          commitLayoutEffectsOnFiber(finishedRoot, fiber);
        } catch (error) {
          captureCommitPhaseError(fiber, fiber.return, error);
        }
      }
    }

    if (fiber === subtreeRoot) {
      nextEffect = null;
      return;
    }

    const sibling = fiber.sibling;
    if (sibling !== null) {
      sibling.return = fiber.return;
      nextEffect = sibling;
      return;
    }

    nextEffect = nextEffect.return;
  }
}

function commitLayoutEffectsOnFiber(
  finishedRoot: FiberRoot,
  finishedWork: Fiber,
) {
  const tag = finishedWork.tag;
  const flags = finishedWork.flags;
  if ((flags & (Update | Callback)) !== NoFlags) {
    switch (tag) {
      case FunctionComponent:
      case ForwardRef:
      case SimpleMemoComponent: {
        if (
          enableProfilerTimer &&
          enableProfilerCommitHooks &&
          finishedWork.mode & ProfileMode
        ) {
          try {
            startLayoutEffectTimer();
            commitHookEffectListMount(HookLayout | HookHasEffect, finishedWork);
          } finally {
            recordLayoutEffectDuration(finishedWork);
          }
        } else {
          commitHookEffectListMount(HookLayout | HookHasEffect, finishedWork);
        }
        break;
      }
      case ClassComponent: {
        // NOTE: Layout effect durations are measured within this function.
        commitLayoutEffectsForClassComponent(finishedWork);
        break;
      }
      case HostRoot: {
        commitLayoutEffectsForHostRoot(finishedWork);
        break;
      }
      case HostComponent: {
        commitLayoutEffectsForHostComponent(finishedWork);
        break;
      }
      case Profiler: {
        commitLayoutEffectsForProfiler(finishedWork, finishedRoot);
        break;
      }
      case SuspenseComponent: {
        commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
        break;
      }
      case FundamentalComponent:
      case HostPortal:
      case HostText:
      case IncompleteClassComponent:
      case LegacyHiddenComponent:
      case OffscreenComponent:
      case ScopeComponent:
      case SuspenseListComponent: {
        // We have no life-cycles associated with these component types.
        break;
      }
      default: {
        invariant(
          false,
          'This unit of work tag should not have side-effects. This error is ' +
            'likely caused by a bug in React. Please file an issue.',
        );
      }
    }
  }

  if (enableScopeAPI) {
    // TODO: This is a temporary solution that allowed us to transition away from React Flare on www.
    if (flags & Ref && tag !== ScopeComponent) {
      commitAttachRef(finishedWork);
    }
  } else {
    if (flags & Ref) {
      commitAttachRef(finishedWork);
    }
  }
}

/** @noinline */
function commitLayoutEffectsForProfiler(
  finishedWork: Fiber,
  finishedRoot: FiberRoot,
) {
  if (enableProfilerTimer) {
    const flags = finishedWork.flags;
    const current = finishedWork.alternate;

    const {onCommit, onRender} = finishedWork.memoizedProps;
    const {effectDuration} = finishedWork.stateNode;

    const commitTime = getCommitTime();

    const OnRenderFlag = Update;
    const OnCommitFlag = Callback;

    if ((flags & OnRenderFlag) !== NoFlags && typeof onRender === 'function') {
      if (enableSchedulerTracing) {
        onRender(
          finishedWork.memoizedProps.id,
          current === null ? 'mount' : 'update',
          finishedWork.actualDuration,
          finishedWork.treeBaseDuration,
          finishedWork.actualStartTime,
          commitTime,
          finishedRoot.memoizedInteractions,
        );
      } else {
        onRender(
          finishedWork.memoizedProps.id,
          current === null ? 'mount' : 'update',
          finishedWork.actualDuration,
          finishedWork.treeBaseDuration,
          finishedWork.actualStartTime,
          commitTime,
        );
      }
    }

    if (enableProfilerCommitHooks) {
      if (
        (flags & OnCommitFlag) !== NoFlags &&
        typeof onCommit === 'function'
      ) {
        if (enableSchedulerTracing) {
          onCommit(
            finishedWork.memoizedProps.id,
            current === null ? 'mount' : 'update',
            effectDuration,
            commitTime,
            finishedRoot.memoizedInteractions,
          );
        } else {
          onCommit(
            finishedWork.memoizedProps.id,
            current === null ? 'mount' : 'update',
            effectDuration,
            commitTime,
          );
        }
      }
    }
  }
}

/** @noinline */
function commitLayoutEffectsForClassComponent(finishedWork: Fiber) {
  const instance = finishedWork.stateNode;
  const current = finishedWork.alternate;
  if (finishedWork.flags & Update) {
    if (current === null) {
      // We could update instance props and state here,
      // but instead we rely on them being set during last render.
      // TODO: revisit this when we implement resuming.
      if (__DEV__) {
        if (
          finishedWork.type === finishedWork.elementType &&
          !didWarnAboutReassigningProps
        ) {
          if (instance.props !== finishedWork.memoizedProps) {
            console.error(
              'Expected %s props to match memoized props before ' +
                'componentDidMount. ' +
                'This might either be because of a bug in React, or because ' +
                'a component reassigns its own `this.props`. ' +
                'Please file an issue.',
              getComponentName(finishedWork.type) || 'instance',
            );
          }
          if (instance.state !== finishedWork.memoizedState) {
            console.error(
              'Expected %s state to match memoized state before ' +
                'componentDidMount. ' +
                'This might either be because of a bug in React, or because ' +
                'a component reassigns its own `this.state`. ' +
                'Please file an issue.',
              getComponentName(finishedWork.type) || 'instance',
            );
          }
        }
      }
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        finishedWork.mode & ProfileMode
      ) {
        try {
          startLayoutEffectTimer();
          instance.componentDidMount();
        } finally {
          recordLayoutEffectDuration(finishedWork);
        }
      } else {
        instance.componentDidMount();
      }
    } else {
      const prevProps =
        finishedWork.elementType === finishedWork.type
          ? current.memoizedProps
          : resolveDefaultProps(finishedWork.type, current.memoizedProps);
      const prevState = current.memoizedState;
      // We could update instance props and state here,
      // but instead we rely on them being set during last render.
      // TODO: revisit this when we implement resuming.
      if (__DEV__) {
        if (
          finishedWork.type === finishedWork.elementType &&
          !didWarnAboutReassigningProps
        ) {
          if (instance.props !== finishedWork.memoizedProps) {
            console.error(
              'Expected %s props to match memoized props before ' +
                'componentDidUpdate. ' +
                'This might either be because of a bug in React, or because ' +
                'a component reassigns its own `this.props`. ' +
                'Please file an issue.',
              getComponentName(finishedWork.type) || 'instance',
            );
          }
          if (instance.state !== finishedWork.memoizedState) {
            console.error(
              'Expected %s state to match memoized state before ' +
                'componentDidUpdate. ' +
                'This might either be because of a bug in React, or because ' +
                'a component reassigns its own `this.state`. ' +
                'Please file an issue.',
              getComponentName(finishedWork.type) || 'instance',
            );
          }
        }
      }
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        finishedWork.mode & ProfileMode
      ) {
        try {
          startLayoutEffectTimer();
          instance.componentDidUpdate(
            prevProps,
            prevState,
            instance.__reactInternalSnapshotBeforeUpdate,
          );
        } finally {
          recordLayoutEffectDuration(finishedWork);
        }
      } else {
        instance.componentDidUpdate(
          prevProps,
          prevState,
          instance.__reactInternalSnapshotBeforeUpdate,
        );
      }
    }
  }

  // TODO: I think this is now always non-null by the time it reaches the
  // commit phase. Consider removing the type check.
  const updateQueue: UpdateQueue<*> | null = (finishedWork.updateQueue: any);
  if (updateQueue !== null) {
    if (__DEV__) {
      if (
        finishedWork.type === finishedWork.elementType &&
        !didWarnAboutReassigningProps
      ) {
        if (instance.props !== finishedWork.memoizedProps) {
          console.error(
            'Expected %s props to match memoized props before ' +
              'processing the update queue. ' +
              'This might either be because of a bug in React, or because ' +
              'a component reassigns its own `this.props`. ' +
              'Please file an issue.',
            getComponentName(finishedWork.type) || 'instance',
          );
        }
        if (instance.state !== finishedWork.memoizedState) {
          console.error(
            'Expected %s state to match memoized state before ' +
              'processing the update queue. ' +
              'This might either be because of a bug in React, or because ' +
              'a component reassigns its own `this.state`. ' +
              'Please file an issue.',
            getComponentName(finishedWork.type) || 'instance',
          );
        }
      }
    }
    // We could update instance props and state here,
    // but instead we rely on them being set during last render.
    // TODO: revisit this when we implement resuming.
    commitUpdateQueue(finishedWork, updateQueue, instance);
  }
}

/** @noinline */
function commitLayoutEffectsForHostRoot(finishedWork: Fiber) {
  // TODO: I think this is now always non-null by the time it reaches the
  // commit phase. Consider removing the type check.
  const updateQueue: UpdateQueue<*> | null = (finishedWork.updateQueue: any);
  if (updateQueue !== null) {
    let instance = null;
    if (finishedWork.child !== null) {
      switch (finishedWork.child.tag) {
        case HostComponent:
          instance = getPublicInstance(finishedWork.child.stateNode);
          break;
        case ClassComponent:
          instance = finishedWork.child.stateNode;
          break;
      }
    }
    commitUpdateQueue(finishedWork, updateQueue, instance);
  }
}

/** @noinline */
function commitLayoutEffectsForHostComponent(finishedWork: Fiber) {
  const instance: Instance = finishedWork.stateNode;
  const current = finishedWork.alternate;

  // Renderers may schedule work to be done after host components are mounted
  // (eg DOM renderer may schedule auto-focus for inputs and form controls).
  // These effects should only be committed when components are first mounted,
  // aka when there is no current/alternate.
  if (current === null && finishedWork.flags & Update) {
    const type = finishedWork.type;
    const props = finishedWork.memoizedProps;
    commitMount(instance, type, props, finishedWork);
  }
}

/** @noinline */
function hideOrUnhideAllChildren(finishedWork, isHidden) {
  if (supportsMutation) {
    // We only have the top Fiber that was inserted but we need to recurse down its
    // children to find all the terminal nodes.
    let node: Fiber = finishedWork;
    while (true) {
      if (node.tag === HostComponent) {
        const instance = node.stateNode;
        if (isHidden) {
          hideInstance(instance);
        } else {
          unhideInstance(node.stateNode, node.memoizedProps);
        }
      } else if (node.tag === HostText) {
        const instance = node.stateNode;
        if (isHidden) {
          hideTextInstance(instance);
        } else {
          unhideTextInstance(instance, node.memoizedProps);
        }
      } else if (
        (node.tag === OffscreenComponent ||
          node.tag === LegacyHiddenComponent) &&
        (node.memoizedState: OffscreenState) !== null &&
        node !== finishedWork
      ) {
        // Found a nested Offscreen component that is hidden. Don't search
        // any deeper. This tree should remain hidden.
      } else if (node.child !== null) {
        node.child.return = node;
        node = node.child;
        continue;
      }
      if (node === finishedWork) {
        return;
      }
      while (node.sibling === null) {
        if (node.return === null || node.return === finishedWork) {
          return;
        }
        node = node.return;
      }
      node.sibling.return = node.return;
      node = node.sibling;
    }
  }
}

export function commitPassiveMountEffects(
  root: FiberRoot,
  firstChild: Fiber,
): void {
  if (enableRecursiveCommitTraversal) {
    recursivelyCommitPassiveMountEffects(root, firstChild);
  } else {
    nextEffect = firstChild;
    iterativelyCommitPassiveMountEffects_begin(firstChild, root);
  }
}

function recursivelyCommitPassiveMountEffects(
  root: FiberRoot,
  firstChild: Fiber,
): void {
  let fiber = firstChild;
  while (fiber !== null) {
    let prevProfilerOnStack = null;
    if (enableProfilerTimer && enableProfilerCommitHooks) {
      if (fiber.tag === Profiler) {
        prevProfilerOnStack = nearestProfilerOnStack;
        nearestProfilerOnStack = fiber;
      }
    }

    const primarySubtreeFlags = fiber.subtreeFlags & PassiveMask;

    if (fiber.child !== null && primarySubtreeFlags !== NoFlags) {
      recursivelyCommitPassiveMountEffects(root, fiber.child);
    }

    if ((fiber.flags & Passive) !== NoFlags) {
      if (__DEV__) {
        setCurrentDebugFiberInDEV(fiber);
        invokeGuardedCallback(
          null,
          commitPassiveMountOnFiber,
          null,
          root,
          fiber,
        );
        if (hasCaughtError()) {
          const error = clearCaughtError();
          captureCommitPhaseError(fiber, fiber.return, error);
        }
        resetCurrentDebugFiberInDEV();
      } else {
        try {
          commitPassiveMountOnFiber(root, fiber);
        } catch (error) {
          captureCommitPhaseError(fiber, fiber.return, error);
        }
      }
    }

    if (enableProfilerTimer && enableProfilerCommitHooks) {
      if (fiber.tag === Profiler) {
        // Bubble times to the next nearest ancestor Profiler.
        // After we process that Profiler, we'll bubble further up.
        if (prevProfilerOnStack !== null) {
          prevProfilerOnStack.stateNode.passiveEffectDuration +=
            fiber.stateNode.passiveEffectDuration;
        }

        nearestProfilerOnStack = prevProfilerOnStack;
      }
    }

    fiber = fiber.sibling;
  }
}

function iterativelyCommitPassiveMountEffects_begin(
  subtreeRoot: Fiber,
  root: FiberRoot,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    const firstChild = fiber.child;
    if ((fiber.subtreeFlags & PassiveMask) !== NoFlags && firstChild !== null) {
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        fiber.tag === Profiler
      ) {
        const prevProfilerOnStack = nearestProfilerOnStack;
        nearestProfilerOnStack = fiber;

        let child = firstChild;
        while (child !== null) {
          nextEffect = child;
          iterativelyCommitPassiveMountEffects_begin(child, root);
          child = child.sibling;
        }
        nextEffect = fiber;

        if ((fiber.flags & PassiveMask) !== NoFlags) {
          if (__DEV__) {
            setCurrentDebugFiberInDEV(fiber);
            invokeGuardedCallback(
              null,
              commitProfilerPassiveEffect,
              null,
              root,
              fiber,
            );
            if (hasCaughtError()) {
              const error = clearCaughtError();
              captureCommitPhaseError(fiber, fiber.return, error);
            }
            resetCurrentDebugFiberInDEV();
          } else {
            try {
              commitProfilerPassiveEffect(root, fiber);
            } catch (error) {
              captureCommitPhaseError(fiber, fiber.return, error);
            }
          }
        }

        // Bubble times to the next nearest ancestor Profiler.
        // After we process that Profiler, we'll bubble further up.
        if (prevProfilerOnStack !== null) {
          prevProfilerOnStack.stateNode.passiveEffectDuration +=
            fiber.stateNode.passiveEffectDuration;
        }

        nearestProfilerOnStack = prevProfilerOnStack;

        if (fiber === subtreeRoot) {
          nextEffect = null;
          return;
        }
        const sibling = fiber.sibling;
        if (sibling !== null) {
          sibling.return = fiber.return;
          nextEffect = sibling;
        } else {
          nextEffect = fiber.return;
          iterativelyCommitPassiveMountEffects_complete(subtreeRoot, root);
        }
      } else {
        firstChild.return = fiber;
        nextEffect = firstChild;
      }
    } else {
      iterativelyCommitPassiveMountEffects_complete(subtreeRoot, root);
    }
  }
}

function iterativelyCommitPassiveMountEffects_complete(
  subtreeRoot: Fiber,
  root: FiberRoot,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    if ((fiber.flags & Passive) !== NoFlags) {
      if (__DEV__) {
        setCurrentDebugFiberInDEV(fiber);
        invokeGuardedCallback(
          null,
          commitPassiveMountOnFiber,
          null,
          root,
          fiber,
        );
        if (hasCaughtError()) {
          const error = clearCaughtError();
          captureCommitPhaseError(fiber, fiber.return, error);
        }
        resetCurrentDebugFiberInDEV();
      } else {
        try {
          commitPassiveMountOnFiber(root, fiber);
        } catch (error) {
          captureCommitPhaseError(fiber, fiber.return, error);
        }
      }
    }

    if (fiber === subtreeRoot) {
      nextEffect = null;
      return;
    }

    const sibling = fiber.sibling;
    if (sibling !== null) {
      sibling.return = fiber.return;
      nextEffect = sibling;
      return;
    }

    nextEffect = fiber.return;
  }
}

export function commitPassiveUnmountEffects(firstChild: Fiber): void {
  if (enableRecursiveCommitTraversal) {
    recursivelyCommitPassiveUnmountEffects(firstChild);
  } else {
    nextEffect = firstChild;
    iterativelyCommitPassiveUnmountEffects_begin();
  }
}

function recursivelyCommitPassiveUnmountEffects(firstChild: Fiber): void {
  let fiber = firstChild;
  while (fiber !== null) {
    const deletions = fiber.deletions;
    if (deletions !== null) {
      for (let i = 0; i < deletions.length; i++) {
        const fiberToDelete = deletions[i];
        recursivelyCommitPassiveUnmountEffectsInsideOfDeletedTree(
          fiberToDelete,
          fiber,
        );

        // Now that passive effects have been processed, it's safe to detach lingering pointers.
        detachFiberAfterEffects(fiberToDelete);
      }
    }

    const child = fiber.child;
    if (child !== null) {
      // If any children have passive effects then traverse the subtree.
      // Note that this requires checking subtreeFlags of the current Fiber,
      // rather than the subtreeFlags/effectsTag of the first child,
      // since that would not cover passive effects in siblings.
      const passiveFlags = fiber.subtreeFlags & PassiveMask;
      if (passiveFlags !== NoFlags) {
        recursivelyCommitPassiveUnmountEffects(child);
      }
    }

    const primaryFlags = fiber.flags & Passive;
    if (primaryFlags !== NoFlags) {
      setCurrentDebugFiberInDEV(fiber);
      commitPassiveUnmountOnFiber(fiber);
      resetCurrentDebugFiberInDEV();
    }

    fiber = fiber.sibling;
  }
}

function iterativelyCommitPassiveUnmountEffects_begin() {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    const child = fiber.child;

    // TODO: Should wrap this in flags check, too, as optimization
    const deletions = fiber.deletions;
    if (deletions !== null) {
      for (let i = 0; i < deletions.length; i++) {
        const fiberToDelete = deletions[i];
        nextEffect = fiberToDelete;
        iterativelyCommitPassiveUnmountEffectsInsideOfDeletedTree_begin(
          fiberToDelete,
          fiber,
        );

        // Now that passive effects have been processed, it's safe to detach lingering pointers.
        detachFiberAfterEffects(fiberToDelete);
      }
      nextEffect = fiber;
    }

    if ((fiber.subtreeFlags & PassiveMask) !== NoFlags && child !== null) {
      child.return = fiber;
      nextEffect = child;
    } else {
      iterativelyCommitPassiveUnmountEffects_complete();
    }
  }
}

function iterativelyCommitPassiveUnmountEffects_complete() {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    if ((fiber.flags & Passive) !== NoFlags) {
      setCurrentDebugFiberInDEV(fiber);
      commitPassiveUnmountOnFiber(fiber);
      resetCurrentDebugFiberInDEV();
    }

    const sibling = fiber.sibling;
    if (sibling !== null) {
      sibling.return = fiber.return;
      nextEffect = sibling;
      return;
    }

    nextEffect = fiber.return;
  }
}

function recursivelyCommitPassiveUnmountEffectsInsideOfDeletedTree(
  fiberToDelete: Fiber,
  nearestMountedAncestor: Fiber,
): void {
  if ((fiberToDelete.subtreeFlags & PassiveStatic) !== NoFlags) {
    // If any children have passive effects then traverse the subtree.
    // Note that this requires checking subtreeFlags of the current Fiber,
    // rather than the subtreeFlags/effectsTag of the first child,
    // since that would not cover passive effects in siblings.
    let child = fiberToDelete.child;
    while (child !== null) {
      recursivelyCommitPassiveUnmountEffectsInsideOfDeletedTree(
        child,
        nearestMountedAncestor,
      );
      child = child.sibling;
    }
  }

  if ((fiberToDelete.flags & PassiveStatic) !== NoFlags) {
    setCurrentDebugFiberInDEV(fiberToDelete);
    commitPassiveUnmountInsideDeletedTreeOnFiber(
      fiberToDelete,
      nearestMountedAncestor,
    );
    resetCurrentDebugFiberInDEV();
  }
}

function iterativelyCommitPassiveUnmountEffectsInsideOfDeletedTree_begin(
  deletedSubtreeRoot: Fiber,
  nearestMountedAncestor: Fiber,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    const child = fiber.child;
    if ((fiber.subtreeFlags & PassiveStatic) !== NoFlags && child !== null) {
      child.return = fiber;
      nextEffect = child;
    } else {
      iterativelyCommitPassiveUnmountEffectsInsideOfDeletedTree_complete(
        deletedSubtreeRoot,
        nearestMountedAncestor,
      );
    }
  }
}

function iterativelyCommitPassiveUnmountEffectsInsideOfDeletedTree_complete(
  deletedSubtreeRoot: Fiber,
  nearestMountedAncestor: Fiber,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    if ((fiber.flags & PassiveStatic) !== NoFlags) {
      setCurrentDebugFiberInDEV(fiber);
      commitPassiveUnmountInsideDeletedTreeOnFiber(
        fiber,
        nearestMountedAncestor,
      );
      resetCurrentDebugFiberInDEV();
    }

    if (fiber === deletedSubtreeRoot) {
      nextEffect = null;
      return;
    }

    const sibling = fiber.sibling;
    if (sibling !== null) {
      sibling.return = fiber.return;
      nextEffect = sibling;
      return;
    }

    nextEffect = fiber.return;
  }
}

function detachFiberAfterEffects(fiber: Fiber): void {
  // Null out fields to improve GC for references that may be lingering (e.g. DevTools).
  // Note that we already cleared the return pointer in detachFiberMutation().
  fiber.child = null;
  fiber.deletions = null;
  fiber.dependencies = null;
  fiber.memoizedProps = null;
  fiber.memoizedState = null;
  fiber.pendingProps = null;
  fiber.sibling = null;
  fiber.stateNode = null;
  fiber.updateQueue = null;

  if (__DEV__) {
    fiber._debugOwner = null;
  }
}

function commitAttachRef(finishedWork: Fiber) {
  const ref = finishedWork.ref;
  if (ref !== null) {
    const instance = finishedWork.stateNode;
    let instanceToUse;
    switch (finishedWork.tag) {
      case HostComponent:
        instanceToUse = getPublicInstance(instance);
        break;
      default:
        instanceToUse = instance;
    }
    // Moved outside to ensure DCE works with this flag
    if (enableScopeAPI && finishedWork.tag === ScopeComponent) {
      instanceToUse = instance;
    }
    if (typeof ref === 'function') {
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        finishedWork.mode & ProfileMode
      ) {
        try {
          startLayoutEffectTimer();
          ref(instanceToUse);
        } finally {
          recordLayoutEffectDuration(finishedWork);
        }
      } else {
        ref(instanceToUse);
      }
    } else {
      if (__DEV__) {
        if (!ref.hasOwnProperty('current')) {
          console.error(
            'Unexpected ref object provided for %s. ' +
              'Use either a ref-setter function or React.createRef().',
            getComponentName(finishedWork.type),
          );
        }
      }

      ref.current = instanceToUse;
    }
  }
}

function commitDetachRef(current: Fiber) {
  const currentRef = current.ref;
  if (currentRef !== null) {
    if (typeof currentRef === 'function') {
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        current.mode & ProfileMode
      ) {
        try {
          startLayoutEffectTimer();
          currentRef(null);
        } finally {
          recordLayoutEffectDuration(current);
        }
      } else {
        currentRef(null);
      }
    } else {
      currentRef.current = null;
    }
  }
}

// User-originating errors (lifecycles and refs) should not interrupt
// deletion, so don't let them throw. Host-originating errors should
// interrupt deletion, so it's okay
function commitUnmount(
  finishedRoot: FiberRoot,
  current: Fiber,
  nearestMountedAncestor: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {
  onCommitUnmount(current);

  switch (current.tag) {
    case FunctionComponent:
    case ForwardRef:
    case MemoComponent:
    case SimpleMemoComponent: {
      const updateQueue: FunctionComponentUpdateQueue | null = (current.updateQueue: any);
      if (updateQueue !== null) {
        const lastEffect = updateQueue.lastEffect;
        if (lastEffect !== null) {
          const firstEffect = lastEffect.next;

          let effect = firstEffect;
          do {
            const {destroy, tag} = effect;
            if (destroy !== undefined) {
              if ((tag & HookLayout) !== NoHookEffect) {
                if (
                  enableProfilerTimer &&
                  enableProfilerCommitHooks &&
                  current.mode & ProfileMode
                ) {
                  startLayoutEffectTimer();
                  safelyCallDestroy(current, nearestMountedAncestor, destroy);
                  recordLayoutEffectDuration(current);
                } else {
                  safelyCallDestroy(current, nearestMountedAncestor, destroy);
                }
              }
            }
            effect = effect.next;
          } while (effect !== firstEffect);
        }
      }
      return;
    }
    case ClassComponent: {
      safelyDetachRef(current, nearestMountedAncestor);
      const instance = current.stateNode;
      if (typeof instance.componentWillUnmount === 'function') {
        safelyCallComponentWillUnmount(
          current,
          instance,
          nearestMountedAncestor,
        );
      }
      return;
    }
    case HostComponent: {
      safelyDetachRef(current, nearestMountedAncestor);
      return;
    }
    case HostPortal: {
      // TODO: this is recursive.
      // We are also not using this parent because
      // the portal will get pushed immediately.
      if (supportsMutation) {
        unmountHostComponents(
          finishedRoot,
          current,
          nearestMountedAncestor,
          renderPriorityLevel,
        );
      } else if (supportsPersistence) {
        emptyPortalContainer(current);
      }
      return;
    }
    case FundamentalComponent: {
      if (enableFundamentalAPI) {
        const fundamentalInstance = current.stateNode;
        if (fundamentalInstance !== null) {
          unmountFundamentalComponent(fundamentalInstance);
          current.stateNode = null;
        }
      }
      return;
    }
    case DehydratedFragment: {
      if (enableSuspenseCallback) {
        const hydrationCallbacks = finishedRoot.hydrationCallbacks;
        if (hydrationCallbacks !== null) {
          const onDeleted = hydrationCallbacks.onDeleted;
          if (onDeleted) {
            onDeleted((current.stateNode: SuspenseInstance));
          }
        }
      }
      return;
    }
    case ScopeComponent: {
      if (enableScopeAPI) {
        safelyDetachRef(current, nearestMountedAncestor);
      }
      return;
    }
  }
}

function commitNestedUnmounts(
  finishedRoot: FiberRoot,
  root: Fiber,
  nearestMountedAncestor: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {
  // While we're inside a removed host node we don't want to call
  // removeChild on the inner nodes because they're removed by the top
  // call anyway. We also want to call componentWillUnmount on all
  // composites before this host node is removed from the tree. Therefore
  // we do an inner loop while we're still inside the host node.
  let node: Fiber = root;
  while (true) {
    commitUnmount(
      finishedRoot,
      node,
      nearestMountedAncestor,
      renderPriorityLevel,
    );
    // Visit children because they may contain more composite or host nodes.
    // Skip portals because commitUnmount() currently visits them recursively.
    if (
      node.child !== null &&
      // If we use mutation we drill down into portals using commitUnmount above.
      // If we don't use mutation we drill down into portals here instead.
      (!supportsMutation || node.tag !== HostPortal)
    ) {
      node.child.return = node;
      node = node.child;
      continue;
    }
    if (node === root) {
      return;
    }
    while (node.sibling === null) {
      if (node.return === null || node.return === root) {
        return;
      }
      node = node.return;
    }
    node.sibling.return = node.return;
    node = node.sibling;
  }
}

function detachFiberMutation(fiber: Fiber) {
  // Cut off the return pointer to disconnect it from the tree.
  // This enables us to detect and warn against state updates on an unmounted component.
  // It also prevents events from bubbling from within disconnected components.
  //
  // Ideally, we should also clear the child pointer of the parent alternate to let this
  // get GC:ed but we don't know which for sure which parent is the current
  // one so we'll settle for GC:ing the subtree of this child.
  // This child itself will be GC:ed when the parent updates the next time.
  //
  // Note that we can't clear child or sibling pointers yet.
  // They're needed for passive effects and for findDOMNode.
  // We defer those fields, and all other cleanup, to the passive phase (see detachFiberAfterEffects).
  const alternate = fiber.alternate;
  if (alternate !== null) {
    alternate.return = null;
    fiber.alternate = null;
  }
  fiber.return = null;
}

function emptyPortalContainer(current: Fiber) {
  if (!supportsPersistence) {
    return;
  }

  const portal: {
    containerInfo: Container,
    pendingChildren: ChildSet,
    ...
  } = current.stateNode;
  const {containerInfo} = portal;
  const emptyChildSet = createContainerChildSet(containerInfo);
  replaceContainerChildren(containerInfo, emptyChildSet);
}

function commitContainer(finishedWork: Fiber) {
  if (!supportsPersistence) {
    return;
  }

  switch (finishedWork.tag) {
    case ClassComponent:
    case HostComponent:
    case HostText:
    case FundamentalComponent: {
      return;
    }
    case HostRoot:
    case HostPortal: {
      const portalOrRoot: {
        containerInfo: Container,
        pendingChildren: ChildSet,
        ...
      } = finishedWork.stateNode;
      const {containerInfo, pendingChildren} = portalOrRoot;
      replaceContainerChildren(containerInfo, pendingChildren);
      return;
    }
  }
  invariant(
    false,
    'This unit of work tag should not have side-effects. This error is ' +
      'likely caused by a bug in React. Please file an issue.',
  );
}

function getHostParentFiber(fiber: Fiber): Fiber {
  let parent = fiber.return;
  while (parent !== null) {
    if (isHostParent(parent)) {
      return parent;
    }
    parent = parent.return;
  }
  invariant(
    false,
    'Expected to find a host parent. This error is likely caused by a bug ' +
      'in React. Please file an issue.',
  );
}

function isHostParent(fiber: Fiber): boolean {
  return (
    fiber.tag === HostComponent ||
    fiber.tag === HostRoot ||
    fiber.tag === HostPortal
  );
}

function getHostSibling(fiber: Fiber): ?Instance {
  // We're going to search forward into the tree until we find a sibling host
  // node. Unfortunately, if multiple insertions are done in a row we have to
  // search past them. This leads to exponential search for the next sibling.
  // TODO: Find a more efficient way to do this.
  let node: Fiber = fiber;
  siblings: while (true) {
    // If we didn't find anything, let's try the next sibling.
    while (node.sibling === null) {
      if (node.return === null || isHostParent(node.return)) {
        // If we pop out of the root or hit the parent the fiber we are the
        // last sibling.
        return null;
      }
      node = node.return;
    }
    node.sibling.return = node.return;
    node = node.sibling;
    while (
      node.tag !== HostComponent &&
      node.tag !== HostText &&
      node.tag !== DehydratedFragment
    ) {
      // If it is not host node and, we might have a host node inside it.
      // Try to search down until we find one.
      if (node.flags & Placement) {
        // If we don't have a child, try the siblings instead.
        continue siblings;
      }
      // If we don't have a child, try the siblings instead.
      // We also skip portals because they are not part of this host tree.
      if (node.child === null || node.tag === HostPortal) {
        continue siblings;
      } else {
        node.child.return = node;
        node = node.child;
      }
    }
    // Check if this host node is stable or about to be placed.
    if (!(node.flags & Placement)) {
      // Found it!
      return node.stateNode;
    }
  }
}

function commitPlacement(finishedWork: Fiber): void {
  if (!supportsMutation) {
    return;
  }

  // Recursively insert all host nodes into the parent.
  const parentFiber = getHostParentFiber(finishedWork);

  // Note: these two variables *must* always be updated together.
  let parent;
  let isContainer;
  const parentStateNode = parentFiber.stateNode;
  switch (parentFiber.tag) {
    case HostComponent:
      parent = parentStateNode;
      isContainer = false;
      break;
    case HostRoot:
      parent = parentStateNode.containerInfo;
      isContainer = true;
      break;
    case HostPortal:
      parent = parentStateNode.containerInfo;
      isContainer = true;
      break;
    case FundamentalComponent:
      if (enableFundamentalAPI) {
        parent = parentStateNode.instance;
        isContainer = false;
      }
    // eslint-disable-next-line-no-fallthrough
    default:
      invariant(
        false,
        'Invalid host parent fiber. This error is likely caused by a bug ' +
          'in React. Please file an issue.',
      );
  }
  if (parentFiber.flags & ContentReset) {
    // Reset the text content of the parent before doing any insertions
    resetTextContent(parent);
    // Clear ContentReset from the effect tag
    parentFiber.flags &= ~ContentReset;
  }

  const before = getHostSibling(finishedWork);
  // We only have the top Fiber that was inserted but we need to recurse down its
  // children to find all the terminal nodes.
  if (isContainer) {
    insertOrAppendPlacementNodeIntoContainer(finishedWork, before, parent);
  } else {
    insertOrAppendPlacementNode(finishedWork, before, parent);
  }
}

function insertOrAppendPlacementNodeIntoContainer(
  node: Fiber,
  before: ?Instance,
  parent: Container,
): void {
  const {tag} = node;
  const isHost = tag === HostComponent || tag === HostText;
  if (isHost || (enableFundamentalAPI && tag === FundamentalComponent)) {
    const stateNode = isHost ? node.stateNode : node.stateNode.instance;
    if (before) {
      insertInContainerBefore(parent, stateNode, before);
    } else {
      appendChildToContainer(parent, stateNode);
    }
  } else if (tag === HostPortal) {
    // If the insertion itself is a portal, then we don't want to traverse
    // down its children. Instead, we'll get insertions from each child in
    // the portal directly.
  } else {
    const child = node.child;
    if (child !== null) {
      insertOrAppendPlacementNodeIntoContainer(child, before, parent);
      let sibling = child.sibling;
      while (sibling !== null) {
        insertOrAppendPlacementNodeIntoContainer(sibling, before, parent);
        sibling = sibling.sibling;
      }
    }
  }
}

function insertOrAppendPlacementNode(
  node: Fiber,
  before: ?Instance,
  parent: Instance,
): void {
  const {tag} = node;
  const isHost = tag === HostComponent || tag === HostText;
  if (isHost || (enableFundamentalAPI && tag === FundamentalComponent)) {
    const stateNode = isHost ? node.stateNode : node.stateNode.instance;
    if (before) {
      insertBefore(parent, stateNode, before);
    } else {
      appendChild(parent, stateNode);
    }
  } else if (tag === HostPortal) {
    // If the insertion itself is a portal, then we don't want to traverse
    // down its children. Instead, we'll get insertions from each child in
    // the portal directly.
  } else {
    const child = node.child;
    if (child !== null) {
      insertOrAppendPlacementNode(child, before, parent);
      let sibling = child.sibling;
      while (sibling !== null) {
        insertOrAppendPlacementNode(sibling, before, parent);
        sibling = sibling.sibling;
      }
    }
  }
}

function unmountHostComponents(
  finishedRoot: FiberRoot,
  current: Fiber,
  nearestMountedAncestor: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {
  // We only have the top Fiber that was deleted but we need to recurse down its
  // children to find all the terminal nodes.
  let node: Fiber = current;

  // Each iteration, currentParent is populated with node's host parent if not
  // currentParentIsValid.
  let currentParentIsValid = false;

  // Note: these two variables *must* always be updated together.
  let currentParent;
  let currentParentIsContainer;

  while (true) {
    if (!currentParentIsValid) {
      let parent = node.return;
      findParent: while (true) {
        invariant(
          parent !== null,
          'Expected to find a host parent. This error is likely caused by ' +
            'a bug in React. Please file an issue.',
        );
        const parentStateNode = parent.stateNode;
        switch (parent.tag) {
          case HostComponent:
            currentParent = parentStateNode;
            currentParentIsContainer = false;
            break findParent;
          case HostRoot:
            currentParent = parentStateNode.containerInfo;
            currentParentIsContainer = true;
            break findParent;
          case HostPortal:
            currentParent = parentStateNode.containerInfo;
            currentParentIsContainer = true;
            break findParent;
          case FundamentalComponent:
            if (enableFundamentalAPI) {
              currentParent = parentStateNode.instance;
              currentParentIsContainer = false;
            }
        }
        parent = parent.return;
      }
      currentParentIsValid = true;
    }

    if (node.tag === HostComponent || node.tag === HostText) {
      commitNestedUnmounts(
        finishedRoot,
        node,
        nearestMountedAncestor,
        renderPriorityLevel,
      );
      // After all the children have unmounted, it is now safe to remove the
      // node from the tree.
      if (currentParentIsContainer) {
        removeChildFromContainer(
          ((currentParent: any): Container),
          (node.stateNode: Instance | TextInstance),
        );
      } else {
        removeChild(
          ((currentParent: any): Instance),
          (node.stateNode: Instance | TextInstance),
        );
      }
      // Don't visit children because we already visited them.
    } else if (enableFundamentalAPI && node.tag === FundamentalComponent) {
      const fundamentalNode = node.stateNode.instance;
      commitNestedUnmounts(
        finishedRoot,
        node,
        nearestMountedAncestor,
        renderPriorityLevel,
      );
      // After all the children have unmounted, it is now safe to remove the
      // node from the tree.
      if (currentParentIsContainer) {
        removeChildFromContainer(
          ((currentParent: any): Container),
          (fundamentalNode: Instance),
        );
      } else {
        removeChild(
          ((currentParent: any): Instance),
          (fundamentalNode: Instance),
        );
      }
    } else if (
      enableSuspenseServerRenderer &&
      node.tag === DehydratedFragment
    ) {
      if (enableSuspenseCallback) {
        const hydrationCallbacks = finishedRoot.hydrationCallbacks;
        if (hydrationCallbacks !== null) {
          const onDeleted = hydrationCallbacks.onDeleted;
          if (onDeleted) {
            onDeleted((node.stateNode: SuspenseInstance));
          }
        }
      }

      // Delete the dehydrated suspense boundary and all of its content.
      if (currentParentIsContainer) {
        clearSuspenseBoundaryFromContainer(
          ((currentParent: any): Container),
          (node.stateNode: SuspenseInstance),
        );
      } else {
        clearSuspenseBoundary(
          ((currentParent: any): Instance),
          (node.stateNode: SuspenseInstance),
        );
      }
    } else if (node.tag === HostPortal) {
      if (node.child !== null) {
        // When we go into a portal, it becomes the parent to remove from.
        // We will reassign it back when we pop the portal on the way up.
        currentParent = node.stateNode.containerInfo;
        currentParentIsContainer = true;
        // Visit children because portals might contain host components.
        node.child.return = node;
        node = node.child;
        continue;
      }
    } else {
      commitUnmount(
        finishedRoot,
        node,
        nearestMountedAncestor,
        renderPriorityLevel,
      );
      // Visit children because we may find more host components below.
      if (node.child !== null) {
        node.child.return = node;
        node = node.child;
        continue;
      }
    }
    if (node === current) {
      return;
    }
    while (node.sibling === null) {
      if (node.return === null || node.return === current) {
        return;
      }
      node = node.return;
      if (node.tag === HostPortal) {
        // When we go out of the portal, we need to restore the parent.
        // Since we don't keep a stack of them, we will search for it.
        currentParentIsValid = false;
      }
    }
    node.sibling.return = node.return;
    node = node.sibling;
  }
}

function commitDeletion(
  finishedRoot: FiberRoot,
  current: Fiber,
  nearestMountedAncestor: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {
  if (supportsMutation) {
    // Recursively delete all host nodes from the parent.
    // Detach refs and call componentWillUnmount() on the whole subtree.
    unmountHostComponents(
      finishedRoot,
      current,
      nearestMountedAncestor,
      renderPriorityLevel,
    );
  } else {
    // Detach refs and call componentWillUnmount() on the whole subtree.
    commitNestedUnmounts(
      finishedRoot,
      current,
      nearestMountedAncestor,
      renderPriorityLevel,
    );
  }
  const alternate = current.alternate;
  detachFiberMutation(current);
  if (alternate !== null) {
    detachFiberMutation(alternate);
  }
}

function commitWork(current: Fiber | null, finishedWork: Fiber): void {
  if (!supportsMutation) {
    switch (finishedWork.tag) {
      case FunctionComponent:
      case ForwardRef:
      case MemoComponent:
      case SimpleMemoComponent: {
        // Layout effects are destroyed during the mutation phase so that all
        // destroy functions for all fibers are called before any create functions.
        // This prevents sibling component effects from interfering with each other,
        // e.g. a destroy function in one component should never override a ref set
        // by a create function in another component during the same commit.
        if (
          enableProfilerTimer &&
          enableProfilerCommitHooks &&
          finishedWork.mode & ProfileMode
        ) {
          try {
            startLayoutEffectTimer();
            commitHookEffectListUnmount(
              HookLayout | HookHasEffect,
              finishedWork,
              finishedWork.return,
            );
          } finally {
            recordLayoutEffectDuration(finishedWork);
          }
        } else {
          commitHookEffectListUnmount(
            HookLayout | HookHasEffect,
            finishedWork,
            finishedWork.return,
          );
        }
        return;
      }
      case Profiler: {
        return;
      }
      case SuspenseComponent: {
        commitSuspenseComponent(finishedWork);
        attachSuspenseRetryListeners(finishedWork);
        return;
      }
      case SuspenseListComponent: {
        attachSuspenseRetryListeners(finishedWork);
        return;
      }
      case HostRoot: {
        if (supportsHydration) {
          const root: FiberRoot = finishedWork.stateNode;
          if (root.hydrate) {
            // We've just hydrated. No need to hydrate again.
            root.hydrate = false;
            commitHydratedContainer(root.containerInfo);
          }
        }
        break;
      }
      case OffscreenComponent:
      case LegacyHiddenComponent: {
        return;
      }
    }

    commitContainer(finishedWork);
    return;
  }

  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case MemoComponent:
    case SimpleMemoComponent: {
      // Layout effects are destroyed during the mutation phase so that all
      // destroy functions for all fibers are called before any create functions.
      // This prevents sibling component effects from interfering with each other,
      // e.g. a destroy function in one component should never override a ref set
      // by a create function in another component during the same commit.
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        finishedWork.mode & ProfileMode
      ) {
        try {
          startLayoutEffectTimer();
          commitHookEffectListUnmount(
            HookLayout | HookHasEffect,
            finishedWork,
            finishedWork.return,
          );
        } finally {
          recordLayoutEffectDuration(finishedWork);
        }
      } else {
        commitHookEffectListUnmount(
          HookLayout | HookHasEffect,
          finishedWork,
          finishedWork.return,
        );
      }
      return;
    }
    case ClassComponent: {
      return;
    }
    case HostComponent: {
      const instance: Instance = finishedWork.stateNode;
      if (instance != null) {
        // Commit the work prepared earlier.
        const newProps = finishedWork.memoizedProps;
        // For hydration we reuse the update path but we treat the oldProps
        // as the newProps. The updatePayload will contain the real change in
        // this case.
        const oldProps = current !== null ? current.memoizedProps : newProps;
        const type = finishedWork.type;
        // TODO: Type the updateQueue to be specific to host components.
        const updatePayload: null | UpdatePayload = (finishedWork.updateQueue: any);
        finishedWork.updateQueue = null;
        if (updatePayload !== null) {
          commitUpdate(
            instance,
            updatePayload,
            type,
            oldProps,
            newProps,
            finishedWork,
          );
        }
      }
      return;
    }
    case HostText: {
      invariant(
        finishedWork.stateNode !== null,
        'This should have a text node initialized. This error is likely ' +
          'caused by a bug in React. Please file an issue.',
      );
      const textInstance: TextInstance = finishedWork.stateNode;
      const newText: string = finishedWork.memoizedProps;
      // For hydration we reuse the update path but we treat the oldProps
      // as the newProps. The updatePayload will contain the real change in
      // this case.
      const oldText: string =
        current !== null ? current.memoizedProps : newText;
      commitTextUpdate(textInstance, oldText, newText);
      return;
    }
    case HostRoot: {
      if (supportsHydration) {
        const root: FiberRoot = finishedWork.stateNode;
        if (root.hydrate) {
          // We've just hydrated. No need to hydrate again.
          root.hydrate = false;
          commitHydratedContainer(root.containerInfo);
        }
      }
      return;
    }
    case Profiler: {
      return;
    }
    case SuspenseComponent: {
      commitSuspenseComponent(finishedWork);
      attachSuspenseRetryListeners(finishedWork);
      return;
    }
    case SuspenseListComponent: {
      attachSuspenseRetryListeners(finishedWork);
      return;
    }
    case IncompleteClassComponent: {
      return;
    }
    case FundamentalComponent: {
      if (enableFundamentalAPI) {
        const fundamentalInstance = finishedWork.stateNode;
        updateFundamentalComponent(fundamentalInstance);
        return;
      }
      break;
    }
    case ScopeComponent: {
      if (enableScopeAPI) {
        const scopeInstance = finishedWork.stateNode;
        prepareScopeUpdate(scopeInstance, finishedWork);
        return;
      }
      break;
    }
    case OffscreenComponent:
    case LegacyHiddenComponent: {
      const newState: OffscreenState | null = finishedWork.memoizedState;
      const isHidden = newState !== null;
      hideOrUnhideAllChildren(finishedWork, isHidden);
      return;
    }
  }
  invariant(
    false,
    'This unit of work tag should not have side-effects. This error is ' +
      'likely caused by a bug in React. Please file an issue.',
  );
}

function commitSuspenseComponent(finishedWork: Fiber) {
  const newState: SuspenseState | null = finishedWork.memoizedState;

  if (newState !== null) {
    markCommitTimeOfFallback();

    if (supportsMutation) {
      // Hide the Offscreen component that contains the primary children. TODO:
      // Ideally, this effect would have been scheduled on the Offscreen fiber
      // itself. That's how unhiding works: the Offscreen component schedules an
      // effect on itself. However, in this case, the component didn't complete,
      // so the fiber was never added to the effect list in the normal path. We
      // could have appended it to the effect list in the Suspense component's
      // second pass, but doing it this way is less complicated. This would be
      // simpler if we got rid of the effect list and traversed the tree, like
      // we're planning to do.
      const primaryChildParent: Fiber = (finishedWork.child: any);
      hideOrUnhideAllChildren(primaryChildParent, true);
    }
  }

  if (enableSuspenseCallback && newState !== null) {
    const suspenseCallback = finishedWork.memoizedProps.suspenseCallback;
    if (typeof suspenseCallback === 'function') {
      const wakeables: Set<Wakeable> | null = (finishedWork.updateQueue: any);
      if (wakeables !== null) {
        suspenseCallback(new Set(wakeables));
      }
    } else if (__DEV__) {
      if (suspenseCallback !== undefined) {
        console.error('Unexpected type for suspenseCallback.');
      }
    }
  }
}

/** @noinline */
function commitSuspenseHydrationCallbacks(
  finishedRoot: FiberRoot,
  finishedWork: Fiber,
) {
  if (!supportsHydration) {
    return;
  }
  const newState: SuspenseState | null = finishedWork.memoizedState;
  if (newState === null) {
    const current = finishedWork.alternate;
    if (current !== null) {
      const prevState: SuspenseState | null = current.memoizedState;
      if (prevState !== null) {
        const suspenseInstance = prevState.dehydrated;
        if (suspenseInstance !== null) {
          commitHydratedSuspenseInstance(suspenseInstance);
          if (enableSuspenseCallback) {
            const hydrationCallbacks = finishedRoot.hydrationCallbacks;
            if (hydrationCallbacks !== null) {
              const onHydrated = hydrationCallbacks.onHydrated;
              if (onHydrated) {
                onHydrated(suspenseInstance);
              }
            }
          }
        }
      }
    }
  }
}

function attachSuspenseRetryListeners(finishedWork: Fiber) {
  // If this boundary just timed out, then it will have a set of wakeables.
  // For each wakeable, attach a listener so that when it resolves, React
  // attempts to re-render the boundary in the primary (pre-timeout) state.
  const wakeables: Set<Wakeable> | null = (finishedWork.updateQueue: any);
  if (wakeables !== null) {
    finishedWork.updateQueue = null;
    let retryCache = finishedWork.stateNode;
    if (retryCache === null) {
      retryCache = finishedWork.stateNode = new PossiblyWeakSet();
    }
    wakeables.forEach(wakeable => {
      // Memoize using the boundary fiber to prevent redundant listeners.
      let retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);
      if (!retryCache.has(wakeable)) {
        if (enableSchedulerTracing) {
          if (wakeable.__reactDoNotTraceInteractions !== true) {
            retry = Schedule_tracing_wrap(retry);
          }
        }
        retryCache.add(wakeable);
        wakeable.then(retry, retry);
      }
    });
  }
}

// This function detects when a Suspense boundary goes from visible to hidden.
// It returns false if the boundary is already hidden.
// TODO: Use an effect tag.
function isSuspenseBoundaryBeingHidden(
  current: Fiber | null,
  finishedWork: Fiber,
): boolean {
  if (current !== null) {
    const oldState: SuspenseState | null = current.memoizedState;
    if (oldState === null || oldState.dehydrated !== null) {
      const newState: SuspenseState | null = finishedWork.memoizedState;
      return newState !== null && newState.dehydrated === null;
    }
  }
  return false;
}

function commitResetTextContent(current: Fiber): void {
  if (!supportsMutation) {
    return;
  }
  resetTextContent(current.stateNode);
}

function commitPassiveUnmountOnFiber(finishedWork: Fiber): void {
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        finishedWork.mode & ProfileMode
      ) {
        startPassiveEffectTimer();
        commitHookEffectListUnmount(
          HookPassive | HookHasEffect,
          finishedWork,
          finishedWork.return,
        );
        recordPassiveEffectDuration(finishedWork);
      } else {
        commitHookEffectListUnmount(
          HookPassive | HookHasEffect,
          finishedWork,
          finishedWork.return,
        );
      }
      break;
    }
  }
}

function commitPassiveUnmountInsideDeletedTreeOnFiber(
  current: Fiber,
  nearestMountedAncestor: Fiber | null,
): void {
  switch (current.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        current.mode & ProfileMode
      ) {
        startPassiveEffectTimer();
        commitHookEffectListUnmount(
          HookPassive,
          current,
          nearestMountedAncestor,
        );
        recordPassiveEffectDuration(current);
      } else {
        commitHookEffectListUnmount(
          HookPassive,
          current,
          nearestMountedAncestor,
        );
      }
      break;
    }
  }
}

function commitPassiveMountOnFiber(
  finishedRoot: FiberRoot,
  finishedWork: Fiber,
): void {
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        finishedWork.mode & ProfileMode
      ) {
        startPassiveEffectTimer();
        try {
          commitHookEffectListMount(HookPassive | HookHasEffect, finishedWork);
        } finally {
          recordPassiveEffectDuration(finishedWork);
        }
      } else {
        commitHookEffectListMount(HookPassive | HookHasEffect, finishedWork);
      }
      break;
    }
    case Profiler: {
      commitProfilerPassiveEffect(finishedRoot, finishedWork);
      break;
    }
  }
}

function invokeLayoutEffectMountInDEV(fiber: Fiber): void {
  if (__DEV__ && enableDoubleInvokingEffects) {
    // We don't need to re-check for legacy roots here.
    // This function will not be called within legacy roots.
    switch (fiber.tag) {
      case FunctionComponent:
      case ForwardRef:
      case SimpleMemoComponent: {
        invokeGuardedCallback(
          null,
          commitHookEffectListMount,
          null,
          HookLayout | HookHasEffect,
          fiber,
        );
        if (hasCaughtError()) {
          const mountError = clearCaughtError();
          captureCommitPhaseError(fiber, fiber.return, mountError);
        }
        break;
      }
      case ClassComponent: {
        const instance = fiber.stateNode;
        invokeGuardedCallback(null, instance.componentDidMount, instance);
        if (hasCaughtError()) {
          const mountError = clearCaughtError();
          captureCommitPhaseError(fiber, fiber.return, mountError);
        }
        break;
      }
    }
  }
}

function invokePassiveEffectMountInDEV(fiber: Fiber): void {
  if (__DEV__ && enableDoubleInvokingEffects) {
    // We don't need to re-check for legacy roots here.
    // This function will not be called within legacy roots.
    switch (fiber.tag) {
      case FunctionComponent:
      case ForwardRef:
      case SimpleMemoComponent: {
        invokeGuardedCallback(
          null,
          commitHookEffectListMount,
          null,
          HookPassive | HookHasEffect,
          fiber,
        );
        if (hasCaughtError()) {
          const mountError = clearCaughtError();
          captureCommitPhaseError(fiber, fiber.return, mountError);
        }
        break;
      }
    }
  }
}

function invokeLayoutEffectUnmountInDEV(fiber: Fiber): void {
  if (__DEV__ && enableDoubleInvokingEffects) {
    // We don't need to re-check for legacy roots here.
    // This function will not be called within legacy roots.
    switch (fiber.tag) {
      case FunctionComponent:
      case ForwardRef:
      case SimpleMemoComponent: {
        invokeGuardedCallback(
          null,
          commitHookEffectListUnmount,
          null,
          HookLayout | HookHasEffect,
          fiber,
          fiber.return,
        );
        if (hasCaughtError()) {
          const unmountError = clearCaughtError();
          captureCommitPhaseError(fiber, fiber.return, unmountError);
        }
        break;
      }
      case ClassComponent: {
        const instance = fiber.stateNode;
        if (typeof instance.componentWillUnmount === 'function') {
          safelyCallComponentWillUnmount(fiber, instance, fiber.return);
        }
        break;
      }
    }
  }
}

function invokePassiveEffectUnmountInDEV(fiber: Fiber): void {
  if (__DEV__ && enableDoubleInvokingEffects) {
    // We don't need to re-check for legacy roots here.
    // This function will not be called within legacy roots.
    switch (fiber.tag) {
      case FunctionComponent:
      case ForwardRef:
      case SimpleMemoComponent: {
        invokeGuardedCallback(
          null,
          commitHookEffectListUnmount,
          null,
          HookPassive | HookHasEffect,
          fiber,
          fiber.return,
        );
        if (hasCaughtError()) {
          const unmountError = clearCaughtError();
          captureCommitPhaseError(fiber, fiber.return, unmountError);
        }
        break;
      }
    }
  }
}

// TODO: Convert this to iteration instead of recursion, too. Leaving this for
// a follow up because the flag is off.
export function commitDoubleInvokeEffectsInDEV(
  fiber: Fiber,
  hasPassiveEffects: boolean,
) {
  if (__DEV__ && enableDoubleInvokingEffects) {
    // Never double-invoke effects for legacy roots.
    if ((fiber.mode & (BlockingMode | ConcurrentMode)) === NoMode) {
      return;
    }

    setCurrentDebugFiberInDEV(fiber);
    invokeEffectsInDev(fiber, MountLayoutDev, invokeLayoutEffectUnmountInDEV);
    if (hasPassiveEffects) {
      invokeEffectsInDev(
        fiber,
        MountPassiveDev,
        invokePassiveEffectUnmountInDEV,
      );
    }

    invokeEffectsInDev(fiber, MountLayoutDev, invokeLayoutEffectMountInDEV);
    if (hasPassiveEffects) {
      invokeEffectsInDev(fiber, MountPassiveDev, invokePassiveEffectMountInDEV);
    }
    resetCurrentDebugFiberInDEV();
  }
}

function invokeEffectsInDev(
  firstChild: Fiber,
  fiberFlags: Flags,
  invokeEffectFn: (fiber: Fiber) => void,
): void {
  if (__DEV__ && enableDoubleInvokingEffects) {
    // We don't need to re-check for legacy roots here.
    // This function will not be called within legacy roots.
    let fiber = firstChild;
    while (fiber !== null) {
      if (fiber.child !== null) {
        const primarySubtreeFlag = fiber.subtreeFlags & fiberFlags;
        if (primarySubtreeFlag !== NoFlags) {
          invokeEffectsInDev(fiber.child, fiberFlags, invokeEffectFn);
        }
      }

      if ((fiber.flags & fiberFlags) !== NoFlags) {
        invokeEffectFn(fiber);
      }
      fiber = fiber.sibling;
    }
  }
}
