/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
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
  HoistableRoot,
  FormInstance,
  InstanceMeasurement,
  Props,
} from './ReactFiberConfig';
import type {Fiber, FiberRoot} from './ReactInternalTypes';
import type {Lanes} from './ReactFiberLane';
import {
  includesOnlyViewTransitionEligibleLanes,
  SyncLane,
} from './ReactFiberLane';
import type {SuspenseState, RetryQueue} from './ReactFiberSuspenseComponent';
import type {UpdateQueue} from './ReactFiberClassUpdateQueue';
import type {FunctionComponentUpdateQueue} from './ReactFiberHooks';
import type {Wakeable} from 'shared/ReactTypes';
import {isOffscreenManual} from './ReactFiberActivityComponent';
import type {
  OffscreenState,
  OffscreenInstance,
  OffscreenQueue,
  OffscreenProps,
} from './ReactFiberActivityComponent';
import type {Cache} from './ReactFiberCacheComponent';
import type {RootState} from './ReactFiberRoot';
import type {
  Transition,
  TracingMarkerInstance,
  TransitionAbort,
} from './ReactFiberTracingMarkerComponent';
import type {
  ViewTransitionProps,
  ViewTransitionState,
} from './ReactFiberViewTransitionComponent';

import {
  alwaysThrottleRetries,
  enableCreateEventHandleAPI,
  enableHiddenSubtreeInsertionEffectCleanup,
  enablePersistedModeClonedFlag,
  enableProfilerTimer,
  enableProfilerCommitHooks,
  enableSuspenseCallback,
  enableScopeAPI,
  enableUpdaterTracking,
  enableTransitionTracing,
  enableUseEffectEventHook,
  enableLegacyHidden,
  disableLegacyMode,
  enableComponentPerformanceTrack,
  enableViewTransition,
} from 'shared/ReactFeatureFlags';
import {
  FunctionComponent,
  ForwardRef,
  ClassComponent,
  HostRoot,
  HostComponent,
  HostHoistable,
  HostSingleton,
  HostText,
  HostPortal,
  Profiler,
  SuspenseComponent,
  DehydratedFragment,
  IncompleteClassComponent,
  MemoComponent,
  SimpleMemoComponent,
  SuspenseListComponent,
  ScopeComponent,
  OffscreenComponent,
  LegacyHiddenComponent,
  CacheComponent,
  TracingMarkerComponent,
  ViewTransitionComponent,
} from './ReactWorkTags';
import {
  NoFlags,
  ContentReset,
  Placement,
  ChildDeletion,
  Snapshot,
  Update,
  Callback,
  Ref,
  Hydrating,
  Passive,
  BeforeMutationMask,
  BeforeMutationTransitionMask,
  MutationMask,
  LayoutMask,
  PassiveMask,
  PassiveTransitionMask,
  Visibility,
  ShouldSuspendCommit,
  MaySuspendCommit,
  FormReset,
  Cloned,
  PerformedWork,
  ForceClientRender,
  DidCapture,
  ViewTransitionStatic,
  AffectedParentLayout,
  ViewTransitionNamedStatic,
} from './ReactFiberFlags';
import {
  commitStartTime,
  pushNestedEffectDurations,
  popNestedEffectDurations,
  bubbleNestedEffectDurations,
  resetComponentEffectTimers,
  pushComponentEffectStart,
  popComponentEffectStart,
  pushComponentEffectErrors,
  popComponentEffectErrors,
  componentEffectStartTime,
  componentEffectEndTime,
  componentEffectDuration,
  componentEffectErrors,
} from './ReactProfilerTimer';
import {
  logComponentRender,
  logComponentErrored,
  logComponentEffect,
} from './ReactFiberPerformanceTrack';
import {ConcurrentMode, NoMode, ProfileMode} from './ReactTypeOfMode';
import {deferHiddenCallbacks} from './ReactFiberClassUpdateQueue';
import {
  supportsMutation,
  supportsPersistence,
  supportsHydration,
  supportsResources,
  supportsSingletons,
  clearSuspenseBoundary,
  clearSuspenseBoundaryFromContainer,
  createContainerChildSet,
  clearContainer,
  prepareScopeUpdate,
  prepareForCommit,
  beforeActiveInstanceBlur,
  detachDeletedInstance,
  getHoistableRoot,
  acquireResource,
  releaseResource,
  hydrateHoistable,
  mountHoistable,
  unmountHoistable,
  prepareToCommitHoistables,
  suspendInstance,
  suspendResource,
  resetFormInstance,
  registerSuspenseInstanceRetry,
  applyViewTransitionName,
  restoreViewTransitionName,
  cancelViewTransitionName,
  cancelRootViewTransitionName,
  restoreRootViewTransitionName,
  measureInstance,
  hasInstanceChanged,
  hasInstanceAffectedParent,
  wasInstanceInViewport,
  isSingletonScope,
} from './ReactFiberConfig';
import {
  captureCommitPhaseError,
  resolveRetryWakeable,
  markCommitTimeOfFallback,
  restorePendingUpdaters,
  addTransitionStartCallbackToPendingTransition,
  addTransitionProgressCallbackToPendingTransition,
  addTransitionCompleteCallbackToPendingTransition,
  addMarkerProgressCallbackToPendingTransition,
  addMarkerIncompleteCallbackToPendingTransition,
  addMarkerCompleteCallbackToPendingTransition,
  retryDehydratedSuspenseBoundary,
  scheduleViewTransitionEvent,
} from './ReactFiberWorkLoop';
import {
  HasEffect as HookHasEffect,
  Layout as HookLayout,
  Insertion as HookInsertion,
  Passive as HookPassive,
} from './ReactHookEffectTags';
import {doesFiberContain} from './ReactFiberTreeReflection';
import {isDevToolsPresent, onCommitUnmount} from './ReactFiberDevToolsHook';
import {releaseCache, retainCache} from './ReactFiberCacheComponent';
import {clearTransitionsForLanes} from './ReactFiberLane';
import {
  OffscreenVisible,
  OffscreenDetached,
  OffscreenPassiveEffectsConnected,
} from './ReactFiberActivityComponent';
import {
  getViewTransitionName,
  getViewTransitionClassName,
} from './ReactFiberViewTransitionComponent';
import {
  TransitionRoot,
  TransitionTracingMarker,
} from './ReactFiberTracingMarkerComponent';
import {scheduleUpdateOnFiber} from './ReactFiberWorkLoop';
import {enqueueConcurrentRenderForLane} from './ReactFiberConcurrentUpdates';
import {
  commitHookLayoutEffects,
  commitHookLayoutUnmountEffects,
  commitHookEffectListMount,
  commitHookEffectListUnmount,
  commitHookPassiveMountEffects,
  commitHookPassiveUnmountEffects,
  commitClassLayoutLifecycles,
  commitClassDidMount,
  commitClassCallbacks,
  commitClassHiddenCallbacks,
  commitClassSnapshot,
  safelyCallComponentWillUnmount,
  safelyAttachRef,
  safelyDetachRef,
  commitProfilerUpdate,
  commitProfilerPostCommit,
  commitRootCallbacks,
} from './ReactFiberCommitEffects';
import {
  commitHostMount,
  commitHostUpdate,
  commitHostTextUpdate,
  commitHostResetTextContent,
  commitShowHideHostInstance,
  commitShowHideHostTextInstance,
  commitHostPlacement,
  commitHostRootContainerChildren,
  commitHostPortalContainerChildren,
  commitHostHydratedContainer,
  commitHostHydratedSuspense,
  commitHostRemoveChildFromContainer,
  commitHostRemoveChild,
  commitHostSingletonAcquisition,
  commitHostSingletonRelease,
} from './ReactFiberCommitHostEffects';
import {
  viewTransitionMutationContext,
  pushMutationContext,
  popMutationContext,
} from './ReactFiberMutationTracking';

// Used during the commit phase to track the state of the Offscreen component stack.
// Allows us to avoid traversing the return path to find the nearest Offscreen ancestor.
let offscreenSubtreeIsHidden: boolean = false;
let offscreenSubtreeWasHidden: boolean = false;

// Used to track if a form needs to be reset at the end of the mutation phase.
let needsFormReset = false;

const PossiblyWeakSet = typeof WeakSet === 'function' ? WeakSet : Set;

let nextEffect: Fiber | null = null;

// Used for Profiling builds to track updaters.
let inProgressLanes: Lanes | null = null;
let inProgressRoot: FiberRoot | null = null;

let focusedInstanceHandle: null | Fiber = null;
export let shouldFireAfterActiveInstanceBlur: boolean = false;

export let shouldStartViewTransition: boolean = false;

// This tracks named ViewTransition components found in the accumulateSuspenseyCommit
// phase that might need to find deleted pairs in the beforeMutation phase.
let appearingViewTransitions: Map<string, ViewTransitionState> | null = null;

// Used during the commit phase to track whether a parent ViewTransition component
// might have been affected by any mutations / relayouts below.
let viewTransitionContextChanged: boolean = false;
// We can't cancel view transition children until we know that their parent also
// don't need to transition.
let viewTransitionCancelableChildren: null | Array<Instance | string | Props> =
  null; // tupled array where each entry is [instance: Instance, oldName: string, props: Props]

export function commitBeforeMutationEffects(
  root: FiberRoot,
  firstChild: Fiber,
  committedLanes: Lanes,
): void {
  focusedInstanceHandle = prepareForCommit(root.containerInfo);
  shouldFireAfterActiveInstanceBlur = false;
  shouldStartViewTransition = false;

  const isViewTransitionEligible =
    enableViewTransition &&
    includesOnlyViewTransitionEligibleLanes(committedLanes);

  nextEffect = firstChild;
  commitBeforeMutationEffects_begin(isViewTransitionEligible);

  // We no longer need to track the active instance fiber
  focusedInstanceHandle = null;
  // We've found any matched pairs and can now reset.
  appearingViewTransitions = null;
}

function commitBeforeMutationEffects_begin(isViewTransitionEligible: boolean) {
  // If this commit is eligible for a View Transition we look into all mutated subtrees.
  // TODO: We could optimize this by marking these with the Snapshot subtree flag in the render phase.
  const subtreeMask = isViewTransitionEligible
    ? BeforeMutationTransitionMask
    : BeforeMutationMask;
  while (nextEffect !== null) {
    const fiber = nextEffect;

    // This phase is only used for beforeActiveInstanceBlur.
    // Let's skip the whole loop if it's off.
    if (enableCreateEventHandleAPI || isViewTransitionEligible) {
      // TODO: Should wrap this in flags check, too, as optimization
      const deletions = fiber.deletions;
      if (deletions !== null) {
        for (let i = 0; i < deletions.length; i++) {
          const deletion = deletions[i];
          commitBeforeMutationEffectsDeletion(
            deletion,
            isViewTransitionEligible,
          );
        }
      }
    }

    if (
      enableViewTransition &&
      fiber.alternate === null &&
      (fiber.flags & Placement) !== NoFlags
    ) {
      // Skip before mutation effects of the children because we don't want
      // to trigger updates of any nested view transitions and we shouldn't
      // have any other before mutation effects since snapshot effects are
      // only applied to updates. TODO: Model this using only flags.
      commitBeforeMutationEffects_complete(isViewTransitionEligible);
      continue;
    }

    // TODO: This should really unify with the switch in commitBeforeMutationEffectsOnFiber recursively.
    if (enableViewTransition && fiber.tag === OffscreenComponent) {
      const isModernRoot =
        disableLegacyMode || (fiber.mode & ConcurrentMode) !== NoMode;
      if (isModernRoot) {
        const current = fiber.alternate;
        const isHidden = fiber.memoizedState !== null;
        if (isHidden) {
          if (
            current !== null &&
            current.memoizedState === null &&
            isViewTransitionEligible
          ) {
            // Was previously mounted as visible but is now hidden.
            commitExitViewTransitions(current);
          }
          // Skip before mutation effects of the children because they're hidden.
          commitBeforeMutationEffects_complete(isViewTransitionEligible);
          continue;
        } else if (current !== null && current.memoizedState !== null) {
          // Was previously mounted as hidden but is now visible.
          // Skip before mutation effects of the children because we don't want
          // to trigger updates of any nested view transitions and we shouldn't
          // have any other before mutation effects since snapshot effects are
          // only applied to updates. TODO: Model this using only flags.
          commitBeforeMutationEffects_complete(isViewTransitionEligible);
          continue;
        }
      }
    }

    const child = fiber.child;
    if ((fiber.subtreeFlags & subtreeMask) !== NoFlags && child !== null) {
      child.return = fiber;
      nextEffect = child;
    } else {
      if (isViewTransitionEligible) {
        // We are inside an updated subtree. Any mutations that affected the
        // parent HostInstance's layout or set of children (such as reorders)
        // might have also affected the positioning or size of the inner
        // ViewTransitions. Therefore we need to find them inside.
        commitNestedViewTransitions(fiber);
      }
      commitBeforeMutationEffects_complete(isViewTransitionEligible);
    }
  }
}

function commitBeforeMutationEffects_complete(
  isViewTransitionEligible: boolean,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    commitBeforeMutationEffectsOnFiber(fiber, isViewTransitionEligible);

    const sibling = fiber.sibling;
    if (sibling !== null) {
      sibling.return = fiber.return;
      nextEffect = sibling;
      return;
    }

    nextEffect = fiber.return;
  }
}

function commitBeforeMutationEffectsOnFiber(
  finishedWork: Fiber,
  isViewTransitionEligible: boolean,
) {
  const current = finishedWork.alternate;
  const flags = finishedWork.flags;

  if (enableCreateEventHandleAPI) {
    if (!shouldFireAfterActiveInstanceBlur && focusedInstanceHandle !== null) {
      // Check to see if the focused element was inside of a hidden (Suspense) subtree.
      // TODO: Move this out of the hot path using a dedicated effect tag.
      if (
        finishedWork.tag === SuspenseComponent &&
        isSuspenseBoundaryBeingHidden(current, finishedWork) &&
        // $FlowFixMe[incompatible-call] found when upgrading Flow
        doesFiberContain(finishedWork, focusedInstanceHandle)
      ) {
        shouldFireAfterActiveInstanceBlur = true;
        beforeActiveInstanceBlur(finishedWork);
      }
    }
  }

  switch (finishedWork.tag) {
    case FunctionComponent: {
      if (enableUseEffectEventHook) {
        if ((flags & Update) !== NoFlags) {
          const updateQueue: FunctionComponentUpdateQueue | null =
            (finishedWork.updateQueue: any);
          const eventPayloads =
            updateQueue !== null ? updateQueue.events : null;
          if (eventPayloads !== null) {
            for (let ii = 0; ii < eventPayloads.length; ii++) {
              const {ref, nextImpl} = eventPayloads[ii];
              ref.impl = nextImpl;
            }
          }
        }
      }
      break;
    }
    case ForwardRef:
    case SimpleMemoComponent: {
      break;
    }
    case ClassComponent: {
      if ((flags & Snapshot) !== NoFlags) {
        if (current !== null) {
          commitClassSnapshot(finishedWork, current);
        }
      }
      break;
    }
    case HostRoot: {
      if ((flags & Snapshot) !== NoFlags) {
        if (supportsMutation) {
          const root = finishedWork.stateNode;
          clearContainer(root.containerInfo);
        }
      }
      break;
    }
    case HostComponent:
    case HostHoistable:
    case HostSingleton:
    case HostText:
    case HostPortal:
    case IncompleteClassComponent:
      // Nothing to do for these component types
      break;
    case ViewTransitionComponent:
      if (enableViewTransition) {
        if (isViewTransitionEligible) {
          if (current === null) {
            // This is a new mount. We should have handled this as part of the
            // Placement effect or it is deeper inside a entering transition.
          } else if (
            (finishedWork.subtreeFlags &
              (Placement |
                Update |
                ChildDeletion |
                ContentReset |
                Visibility)) !==
            NoFlags
          ) {
            // Something mutated within this subtree. This might need to cause
            // a cross-fade of this parent. We first assign old names to the
            // previous tree in the before mutation phase in case we need to.
            // TODO: This walks the tree that we might continue walking anyway.
            // We should just stash the parent ViewTransitionComponent and continue
            // walking the tree until we find HostComponent but to do that we need
            // to use a stack which requires refactoring this phase.
            commitBeforeUpdateViewTransition(current, finishedWork);
          }
        }
        break;
      }
    // Fallthrough
    default: {
      if ((flags & Snapshot) !== NoFlags) {
        throw new Error(
          'This unit of work tag should not have side-effects. This error is ' +
            'likely caused by a bug in React. Please file an issue.',
        );
      }
    }
  }
}

function commitBeforeMutationEffectsDeletion(
  deletion: Fiber,
  isViewTransitionEligible: boolean,
) {
  if (enableCreateEventHandleAPI) {
    // TODO (effects) It would be nice to avoid calling doesFiberContain()
    // Maybe we can repurpose one of the subtreeFlags positions for this instead?
    // Use it to store which part of the tree the focused instance is in?
    // This assumes we can safely determine that instance during the "render" phase.
    if (doesFiberContain(deletion, ((focusedInstanceHandle: any): Fiber))) {
      shouldFireAfterActiveInstanceBlur = true;
      beforeActiveInstanceBlur(deletion);
    }
  }
  if (isViewTransitionEligible) {
    commitExitViewTransitions(deletion);
  }
}

let viewTransitionHostInstanceIdx = 0;

function applyViewTransitionToHostInstances(
  child: null | Fiber,
  name: string,
  className: ?string,
  collectMeasurements: null | Array<InstanceMeasurement>,
  stopAtNestedViewTransitions: boolean,
): boolean {
  if (!supportsMutation) {
    return false;
  }
  let inViewport = false;
  while (child !== null) {
    if (child.tag === HostComponent) {
      shouldStartViewTransition = true;
      const instance: Instance = child.stateNode;
      if (collectMeasurements !== null) {
        const measurement = measureInstance(instance);
        collectMeasurements.push(measurement);
        if (wasInstanceInViewport(measurement)) {
          inViewport = true;
        }
      } else if (!inViewport) {
        if (wasInstanceInViewport(measureInstance(instance))) {
          inViewport = true;
        }
      }
      applyViewTransitionName(
        instance,
        viewTransitionHostInstanceIdx === 0
          ? name
          : // If we have multiple Host Instances below, we add a suffix to the name to give
            // each one a unique name.
            name + '_' + viewTransitionHostInstanceIdx,
        className,
      );
      viewTransitionHostInstanceIdx++;
    } else if (
      child.tag === OffscreenComponent &&
      child.memoizedState !== null
    ) {
      // Skip any hidden subtrees. They were or are effectively not there.
    } else if (
      child.tag === ViewTransitionComponent &&
      stopAtNestedViewTransitions
    ) {
      // Skip any nested view transitions for updates since in that case the
      // inner most one is the one that handles the update.
    } else {
      if (
        applyViewTransitionToHostInstances(
          child.child,
          name,
          className,
          collectMeasurements,
          stopAtNestedViewTransitions,
        )
      ) {
        inViewport = true;
      }
    }
    child = child.sibling;
  }
  return inViewport;
}

function restoreViewTransitionOnHostInstances(
  child: null | Fiber,
  stopAtNestedViewTransitions: boolean,
): void {
  if (!supportsMutation) {
    return;
  }
  while (child !== null) {
    if (child.tag === HostComponent) {
      const instance: Instance = child.stateNode;
      restoreViewTransitionName(instance, child.memoizedProps);
    } else if (
      child.tag === OffscreenComponent &&
      child.memoizedState !== null
    ) {
      // Skip any hidden subtrees. They were or are effectively not there.
    } else if (
      child.tag === ViewTransitionComponent &&
      stopAtNestedViewTransitions
    ) {
      // Skip any nested view transitions for updates since in that case the
      // inner most one is the one that handles the update.
    } else {
      restoreViewTransitionOnHostInstances(
        child.child,
        stopAtNestedViewTransitions,
      );
    }
    child = child.sibling;
  }
}

function commitAppearingPairViewTransitions(placement: Fiber): void {
  if ((placement.subtreeFlags & ViewTransitionNamedStatic) === NoFlags) {
    // This has no named view transitions in its subtree.
    return;
  }
  let child = placement.child;
  while (child !== null) {
    if (child.tag === OffscreenComponent && child.memoizedState === null) {
      // This tree was already hidden so we skip it.
    } else {
      commitAppearingPairViewTransitions(child);
      if (
        child.tag === ViewTransitionComponent &&
        (child.flags & ViewTransitionNamedStatic) !== NoFlags
      ) {
        const instance: ViewTransitionState = child.stateNode;
        if (instance.paired) {
          const props: ViewTransitionProps = child.memoizedProps;
          if (props.name == null || props.name === 'auto') {
            throw new Error(
              'Found a pair with an auto name. This is a bug in React.',
            );
          }
          const name = props.name;
          const className: ?string = getViewTransitionClassName(
            props.className,
            props.share,
          );
          if (className !== 'none') {
            // We found a new appearing view transition with the same name as this deletion.
            // We'll transition between them.
            viewTransitionHostInstanceIdx = 0;
            const inViewport = applyViewTransitionToHostInstances(
              child.child,
              name,
              className,
              null,
              false,
            );
            if (!inViewport) {
              // This boundary is exiting within the viewport but is going to leave the viewport.
              // Instead, we treat this as an exit of the previous entry by reverting the new name.
              // Ideally we could undo the old transition but it's now too late. It's also on its
              // on snapshot. We have know was for it to paint onto the original group.
              // TODO: This will lead to things unexpectedly having exit animations that normally
              // wouldn't happen. Consider if we should just let this fly off the screen instead.
              restoreViewTransitionOnHostInstances(child.child, false);
            }
          }
        }
      }
    }
    child = child.sibling;
  }
}

function commitEnterViewTransitions(placement: Fiber): void {
  if (placement.tag === ViewTransitionComponent) {
    const state: ViewTransitionState = placement.stateNode;
    const props: ViewTransitionProps = placement.memoizedProps;
    const name = getViewTransitionName(props, state);
    const className: ?string = getViewTransitionClassName(
      props.className,
      state.paired ? props.share : props.enter,
    );
    if (className !== 'none') {
      viewTransitionHostInstanceIdx = 0;
      const inViewport = applyViewTransitionToHostInstances(
        placement.child,
        name,
        className,
        null,
        false,
      );
      if (!inViewport) {
        // TODO: If this was part of a pair we will still run the onShare callback.
        // Revert the transition names. This boundary is not in the viewport
        // so we won't bother animating it.
        restoreViewTransitionOnHostInstances(placement.child, false);
        // TODO: Should we still visit the children in case a named one was in the viewport?
      } else {
        commitAppearingPairViewTransitions(placement);

        if (!state.paired) {
          scheduleViewTransitionEvent(placement, props.onEnter);
        }
      }
    } else {
      commitAppearingPairViewTransitions(placement);
    }
  } else if ((placement.subtreeFlags & ViewTransitionStatic) !== NoFlags) {
    let child = placement.child;
    while (child !== null) {
      commitEnterViewTransitions(child);
      child = child.sibling;
    }
  } else {
    commitAppearingPairViewTransitions(placement);
  }
}

function commitDeletedPairViewTransitions(deletion: Fiber): void {
  if (
    appearingViewTransitions === null ||
    appearingViewTransitions.size === 0
  ) {
    // We've found all.
    return;
  }
  const pairs = appearingViewTransitions;
  if ((deletion.subtreeFlags & ViewTransitionNamedStatic) === NoFlags) {
    // This has no named view transitions in its subtree.
    return;
  }
  let child = deletion.child;
  while (child !== null) {
    if (child.tag === OffscreenComponent && child.memoizedState === null) {
      // This tree was already hidden so we skip it.
    } else {
      if (
        child.tag === ViewTransitionComponent &&
        (child.flags & ViewTransitionNamedStatic) !== NoFlags
      ) {
        const props: ViewTransitionProps = child.memoizedProps;
        const name = props.name;
        if (name != null && name !== 'auto') {
          const pair = pairs.get(name);
          if (pair !== undefined) {
            const className: ?string = getViewTransitionClassName(
              props.className,
              props.share,
            );
            if (className !== 'none') {
              // We found a new appearing view transition with the same name as this deletion.
              viewTransitionHostInstanceIdx = 0;
              const inViewport = applyViewTransitionToHostInstances(
                child.child,
                name,
                className,
                null,
                false,
              );
              if (!inViewport) {
                // This boundary is not in the viewport so we won't treat it as a matched pair.
                // Revert the transition names. This avoids it flying onto the screen which can
                // be disruptive and doesn't really preserve any continuity anyway.
                restoreViewTransitionOnHostInstances(child.child, false);
              } else {
                // We'll transition between them.
                const oldinstance: ViewTransitionState = child.stateNode;
                const newInstance: ViewTransitionState = pair;
                newInstance.paired = oldinstance;
                // Note: If the other side ends up outside the viewport, we'll still run this.
                // Therefore it's possible for onShare to be called with only an old snapshot.
                scheduleViewTransitionEvent(child, props.onShare);
              }
            }
            // Delete the entry so that we know when we've found all of them
            // and can stop searching (size reaches zero).
            pairs.delete(name);
            if (pairs.size === 0) {
              break;
            }
          }
        }
      }
      commitDeletedPairViewTransitions(child);
    }
    child = child.sibling;
  }
}

function commitExitViewTransitions(deletion: Fiber): void {
  if (deletion.tag === ViewTransitionComponent) {
    const props: ViewTransitionProps = deletion.memoizedProps;
    const name = getViewTransitionName(props, deletion.stateNode);
    const pair =
      appearingViewTransitions !== null
        ? appearingViewTransitions.get(name)
        : undefined;
    const className: ?string = getViewTransitionClassName(
      props.className,
      pair !== undefined ? props.share : props.exit,
    );
    if (className !== 'none') {
      viewTransitionHostInstanceIdx = 0;
      const inViewport = applyViewTransitionToHostInstances(
        deletion.child,
        name,
        className,
        null,
        false,
      );
      if (!inViewport) {
        // Revert the transition names. This boundary is not in the viewport
        // so we won't bother animating it.
        restoreViewTransitionOnHostInstances(deletion.child, false);
        // TODO: Should we still visit the children in case a named one was in the viewport?
      } else if (pair !== undefined) {
        // We found a new appearing view transition with the same name as this deletion.
        // We'll transition between them instead of running the normal exit.
        const oldinstance: ViewTransitionState = deletion.stateNode;
        const newInstance: ViewTransitionState = pair;
        newInstance.paired = oldinstance;
        // Delete the entry so that we know when we've found all of them
        // and can stop searching (size reaches zero).
        // $FlowFixMe[incompatible-use]: Refined by the pair.
        appearingViewTransitions.delete(name);
        // Note: If the other side ends up outside the viewport, we'll still run this.
        // Therefore it's possible for onShare to be called with only an old snapshot.
        scheduleViewTransitionEvent(deletion, props.onShare);
      } else {
        scheduleViewTransitionEvent(deletion, props.onExit);
      }
    }
    if (appearingViewTransitions !== null) {
      // Look for more pairs deeper in the tree.
      commitDeletedPairViewTransitions(deletion);
    }
  } else if ((deletion.subtreeFlags & ViewTransitionStatic) !== NoFlags) {
    let child = deletion.child;
    while (child !== null) {
      commitExitViewTransitions(child);
      child = child.sibling;
    }
  } else {
    if (appearingViewTransitions !== null) {
      commitDeletedPairViewTransitions(deletion);
    }
  }
}

function commitBeforeUpdateViewTransition(
  current: Fiber,
  finishedWork: Fiber,
): void {
  // The way we deal with multiple HostInstances as children of a View Transition in an
  // update can get tricky. The important bit is that if you swap out n HostInstances
  // from n HostInstances then they match up in order. Similarly, if you don't swap
  // any HostInstances each instance just transitions as is.
  //
  // We call this function twice. First we apply the view transition names on the
  // "current" tree in the snapshot phase. Then in the mutation phase we apply view
  // transition names to the "finishedWork" tree.
  //
  // This means that if there were insertions or deletions before an updated Instance
  // that same Instance might get different names in the "old" and the "new" state.
  // For example if you swap two HostInstances inside a ViewTransition they don't
  // animate to swap position but rather cross-fade into the other instance. This might
  // be unexpected but it is in line with the semantics that the ViewTransition is its
  // own layer that cross-fades its content when it updates. If you want to reorder then
  // each child needs its own ViewTransition.
  const oldProps: ViewTransitionProps = current.memoizedProps;
  const oldName = getViewTransitionName(oldProps, current.stateNode);
  const newProps: ViewTransitionProps = finishedWork.memoizedProps;
  // This className applies only if there are fewer child DOM nodes than
  // before or if this update should've been cancelled but we ended up with
  // a parent animating so we need to animate the child too.
  // For example, if update="foo" layout="none" and it turns out this was
  // a layout only change, then the "foo" class will be applied even though
  // it was not actually an update. Which is a bug.
  let className: ?string = getViewTransitionClassName(
    newProps.className,
    newProps.update,
  );
  if (className === 'none') {
    className = getViewTransitionClassName(newProps.className, newProps.layout);
    if (className === 'none') {
      // If both update and layout are both "none" then we don't have to
      // apply a name. Since we won't animate this boundary.
      return;
    }
  }
  viewTransitionHostInstanceIdx = 0;
  applyViewTransitionToHostInstances(
    current.child,
    oldName,
    className,
    (current.memoizedState = []),
    true,
  );
}

function commitNestedViewTransitions(changedParent: Fiber): void {
  let child = changedParent.child;
  while (child !== null) {
    if (child.tag === ViewTransitionComponent) {
      // In this case the outer ViewTransition component wins but if there
      // was an update through this component then the inner one wins.
      const props: ViewTransitionProps = child.memoizedProps;
      const name = getViewTransitionName(props, child.stateNode);
      const className: ?string = getViewTransitionClassName(
        props.className,
        props.layout,
      );
      if (className !== 'none') {
        viewTransitionHostInstanceIdx = 0;
        applyViewTransitionToHostInstances(
          child.child,
          name,
          className,
          (child.memoizedState = []),
          false,
        );
      }
    } else if ((child.subtreeFlags & ViewTransitionStatic) !== NoFlags) {
      commitNestedViewTransitions(child);
    }
    child = child.sibling;
  }
}

function restorePairedViewTransitions(parent: Fiber): void {
  if ((parent.subtreeFlags & ViewTransitionNamedStatic) === NoFlags) {
    // This has no named view transitions in its subtree.
    return;
  }
  let child = parent.child;
  while (child !== null) {
    if (child.tag === OffscreenComponent && child.memoizedState === null) {
      // This tree was already hidden so we skip it.
    } else {
      if (
        child.tag === ViewTransitionComponent &&
        (child.flags & ViewTransitionNamedStatic) !== NoFlags
      ) {
        const instance: ViewTransitionState = child.stateNode;
        if (instance.paired !== null) {
          instance.paired = null;
          restoreViewTransitionOnHostInstances(child.child, false);
        }
      }
      restorePairedViewTransitions(child);
    }
    child = child.sibling;
  }
}

function restoreEnterViewTransitions(placement: Fiber): void {
  if (placement.tag === ViewTransitionComponent) {
    const instance: ViewTransitionState = placement.stateNode;
    instance.paired = null;
    restoreViewTransitionOnHostInstances(placement.child, false);
    restorePairedViewTransitions(placement);
  } else if ((placement.subtreeFlags & ViewTransitionStatic) !== NoFlags) {
    let child = placement.child;
    while (child !== null) {
      restoreEnterViewTransitions(child);
      child = child.sibling;
    }
  } else {
    restorePairedViewTransitions(placement);
  }
}

function restoreExitViewTransitions(deletion: Fiber): void {
  if (deletion.tag === ViewTransitionComponent) {
    const instance: ViewTransitionState = deletion.stateNode;
    instance.paired = null;
    restoreViewTransitionOnHostInstances(deletion.child, false);
    restorePairedViewTransitions(deletion);
  } else if ((deletion.subtreeFlags & ViewTransitionStatic) !== NoFlags) {
    let child = deletion.child;
    while (child !== null) {
      restoreExitViewTransitions(child);
      child = child.sibling;
    }
  } else {
    restorePairedViewTransitions(deletion);
  }
}

function restoreUpdateViewTransition(
  current: Fiber,
  finishedWork: Fiber,
): void {
  finishedWork.memoizedState = null;
  restoreViewTransitionOnHostInstances(current.child, true);
  restoreViewTransitionOnHostInstances(finishedWork.child, true);
}

function restoreNestedViewTransitions(changedParent: Fiber): void {
  let child = changedParent.child;
  while (child !== null) {
    if (child.tag === ViewTransitionComponent) {
      child.memoizedState = null;
      restoreViewTransitionOnHostInstances(child.child, false);
    } else if ((child.subtreeFlags & ViewTransitionStatic) !== NoFlags) {
      restoreNestedViewTransitions(child);
    }
    child = child.sibling;
  }
}

function cancelViewTransitionHostInstances(
  currentViewTransition: Fiber,
  child: null | Fiber,
  stopAtNestedViewTransitions: boolean,
): void {
  if (!supportsMutation) {
    return;
  }
  while (child !== null) {
    if (child.tag === HostComponent) {
      const instance: Instance = child.stateNode;
      const oldName = getViewTransitionName(
        currentViewTransition.memoizedProps,
        currentViewTransition.stateNode,
      );
      if (viewTransitionCancelableChildren === null) {
        viewTransitionCancelableChildren = [];
      }
      viewTransitionCancelableChildren.push(
        instance,
        oldName,
        child.memoizedProps,
      );
      viewTransitionHostInstanceIdx++;
    } else if (
      child.tag === OffscreenComponent &&
      child.memoizedState !== null
    ) {
      // Skip any hidden subtrees. They were or are effectively not there.
    } else if (
      child.tag === ViewTransitionComponent &&
      stopAtNestedViewTransitions
    ) {
      // Skip any nested view transitions for updates since in that case the
      // inner most one is the one that handles the update.
    } else {
      cancelViewTransitionHostInstances(
        currentViewTransition,
        child.child,
        stopAtNestedViewTransitions,
      );
    }
    child = child.sibling;
  }
}

function measureViewTransitionHostInstances(
  currentViewTransition: Fiber,
  parentViewTransition: Fiber,
  child: null | Fiber,
  name: string,
  className: ?string,
  previousMeasurements: null | Array<InstanceMeasurement>,
  stopAtNestedViewTransitions: boolean,
): boolean {
  if (!supportsMutation) {
    return true;
  }
  let inViewport = false;
  while (child !== null) {
    if (child.tag === HostComponent) {
      const instance: Instance = child.stateNode;
      if (
        previousMeasurements !== null &&
        viewTransitionHostInstanceIdx < previousMeasurements.length
      ) {
        // The previous measurement of the Instance in this location within the ViewTransition.
        // Note that this might not be the same exact Instance if the Instances within the
        // ViewTransition changed.
        const previousMeasurement =
          previousMeasurements[viewTransitionHostInstanceIdx];
        const nextMeasurement = measureInstance(instance);
        if (
          wasInstanceInViewport(previousMeasurement) ||
          wasInstanceInViewport(nextMeasurement)
        ) {
          // If either the old or new state was within the viewport we have to animate this.
          // But if it turns out that none of them were we'll be able to skip it.
          inViewport = true;
        }
        if (
          (parentViewTransition.flags & Update) === NoFlags &&
          hasInstanceChanged(previousMeasurement, nextMeasurement)
        ) {
          parentViewTransition.flags |= Update;
        }
        if (hasInstanceAffectedParent(previousMeasurement, nextMeasurement)) {
          // If this instance size within its parent has changed it might have caused the
          // parent to relayout which needs a cross fade.
          parentViewTransition.flags |= AffectedParentLayout;
        }
      } else {
        // If there was an insertion of extra nodes, we have to assume they affected the parent.
        // It should have already been marked as an Update due to the mutation.
        parentViewTransition.flags |= AffectedParentLayout;
      }
      if ((parentViewTransition.flags & Update) !== NoFlags) {
        // We might update this node so we need to apply its new name for the new state.
        applyViewTransitionName(
          instance,
          viewTransitionHostInstanceIdx === 0
            ? name
            : // If we have multiple Host Instances below, we add a suffix to the name to give
              // each one a unique name.
              name + '_' + viewTransitionHostInstanceIdx,
          className,
        );
      }
      if (!inViewport || (parentViewTransition.flags & Update) === NoFlags) {
        // It turns out that we had no other deeper mutations, the child transitions didn't
        // affect the parent layout and this instance hasn't changed size. So we can skip
        // animating it. However, in the current model this only works if the parent also
        // doesn't animate. So we have to queue these and wait until we complete the parent
        // to cancel them.
        const oldName = getViewTransitionName(
          currentViewTransition.memoizedProps,
          currentViewTransition.stateNode,
        );
        if (viewTransitionCancelableChildren === null) {
          viewTransitionCancelableChildren = [];
        }
        viewTransitionCancelableChildren.push(
          instance,
          oldName,
          child.memoizedProps,
        );
      }
      viewTransitionHostInstanceIdx++;
    } else if (
      child.tag === OffscreenComponent &&
      child.memoizedState !== null
    ) {
      // Skip any hidden subtrees. They were or are effectively not there.
    } else if (
      child.tag === ViewTransitionComponent &&
      stopAtNestedViewTransitions
    ) {
      // Skip any nested view transitions for updates since in that case the
      // inner most one is the one that handles the update.
      // If this inner boundary resized we need to bubble that information up.
      parentViewTransition.flags |= child.flags & AffectedParentLayout;
    } else {
      if (
        measureViewTransitionHostInstances(
          currentViewTransition,
          parentViewTransition,
          child.child,
          name,
          className,
          previousMeasurements,
          stopAtNestedViewTransitions,
        )
      ) {
        inViewport = true;
      }
    }
    child = child.sibling;
  }
  return inViewport;
}

function measureUpdateViewTransition(
  current: Fiber,
  finishedWork: Fiber,
): boolean {
  const props: ViewTransitionProps = finishedWork.memoizedProps;
  const updateClassName: ?string = getViewTransitionClassName(
    props.className,
    props.update,
  );
  const layoutClassName: ?string = getViewTransitionClassName(
    props.className,
    props.layout,
  );
  let className: ?string;
  if (updateClassName === 'none') {
    if (layoutClassName === 'none') {
      // If both update and layout class name were none, then we didn't apply any
      // names in the before update phase so we shouldn't now neither.
      return false;
    }
    // We don't care if this is mutated or children layout changed, but we still
    // measure each instance to see if it moved and therefore should apply layout.
    finishedWork.flags &= ~Update;
    className = layoutClassName;
  } else if ((finishedWork.flags & Update) !== NoFlags) {
    // It was updated and we have an appropriate class name to apply.
    className = updateClassName;
  } else {
    if (layoutClassName === 'none') {
      // If we did not update, then all changes are considered a layout. We'll
      // attempt to cancel.
      viewTransitionHostInstanceIdx = 0;
      cancelViewTransitionHostInstances(current, finishedWork.child, true);
      return false;
    }
    // We didn't update but we might still apply layout so we measure each
    // instance to see if it moved or resized.
    className = layoutClassName;
  }
  const name = getViewTransitionName(props, finishedWork.stateNode);
  // If nothing changed due to a mutation, or children changing size
  // and the measurements end up unchanged, we should restore it to not animate.
  viewTransitionHostInstanceIdx = 0;
  const previousMeasurements = current.memoizedState;
  const inViewport = measureViewTransitionHostInstances(
    current,
    finishedWork,
    finishedWork.child,
    name,
    className,
    previousMeasurements,
    true,
  );
  const previousCount =
    previousMeasurements === null ? 0 : previousMeasurements.length;
  if (viewTransitionHostInstanceIdx !== previousCount) {
    // If we found a different number of child DOM nodes we need to assume that
    // the parent layout may have changed as a result. This is not necessarily
    // true if those nodes were absolutely positioned.
    finishedWork.flags |= AffectedParentLayout;
  }
  return inViewport;
}

function measureNestedViewTransitions(changedParent: Fiber): void {
  let child = changedParent.child;
  while (child !== null) {
    if (child.tag === ViewTransitionComponent) {
      const current = child.alternate;
      if (current !== null) {
        const props: ViewTransitionProps = child.memoizedProps;
        const name = getViewTransitionName(props, child.stateNode);
        const className: ?string = getViewTransitionClassName(
          props.className,
          props.layout,
        );
        viewTransitionHostInstanceIdx = 0;
        const inViewport = measureViewTransitionHostInstances(
          current,
          child,
          child.child,
          name,
          className,
          child.memoizedState,
          false,
        );
        if ((child.flags & Update) === NoFlags || !inViewport) {
          // Nothing changed.
        } else {
          scheduleViewTransitionEvent(child, props.onLayout);
        }
      }
    } else if ((child.subtreeFlags & ViewTransitionStatic) !== NoFlags) {
      measureNestedViewTransitions(child);
    }
    child = child.sibling;
  }
}

function commitLayoutEffectOnFiber(
  finishedRoot: FiberRoot,
  current: Fiber | null,
  finishedWork: Fiber,
  committedLanes: Lanes,
): void {
  const prevEffectStart = pushComponentEffectStart();
  const prevEffectErrors = pushComponentEffectErrors();
  // When updating this function, also update reappearLayoutEffects, which does
  // most of the same things when an offscreen tree goes from hidden -> visible.
  const flags = finishedWork.flags;
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      recursivelyTraverseLayoutEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
      );
      if (flags & Update) {
        commitHookLayoutEffects(finishedWork, HookLayout | HookHasEffect);
      }
      break;
    }
    case ClassComponent: {
      recursivelyTraverseLayoutEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
      );
      if (flags & Update) {
        commitClassLayoutLifecycles(finishedWork, current);
      }

      if (flags & Callback) {
        commitClassCallbacks(finishedWork);
      }

      if (flags & Ref) {
        safelyAttachRef(finishedWork, finishedWork.return);
      }
      break;
    }
    case HostRoot: {
      const prevEffectDuration = pushNestedEffectDurations();
      recursivelyTraverseLayoutEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
      );
      if (flags & Callback) {
        commitRootCallbacks(finishedWork);
      }
      if (enableProfilerTimer && enableProfilerCommitHooks) {
        finishedRoot.effectDuration +=
          popNestedEffectDurations(prevEffectDuration);
      }
      break;
    }
    case HostSingleton: {
      if (supportsSingletons) {
        // We acquire the singleton instance first so it has appropriate
        // styles before other layout effects run. This isn't perfect because
        // an early sibling of the singleton may have an effect that can
        // observe the singleton before it is acquired.
        // @TODO move this to the mutation phase. The reason it isn't there yet
        // is it seemingly requires an extra traversal because we need to move the
        // disappear effect into a phase before the appear phase
        if (current === null && flags & Update) {
          // Unlike in the reappear path we only acquire on new mount
          commitHostSingletonAcquisition(finishedWork);
        }
        // We fall through to the HostComponent case below.
      }
      // Fallthrough
    }
    case HostHoistable:
    case HostComponent: {
      recursivelyTraverseLayoutEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
      );

      // Renderers may schedule work to be done after host components are mounted
      // (eg DOM renderer may schedule auto-focus for inputs and form controls).
      // These effects should only be committed when components are first mounted,
      // aka when there is no current/alternate.
      if (current === null && flags & Update) {
        commitHostMount(finishedWork);
      }

      if (flags & Ref) {
        safelyAttachRef(finishedWork, finishedWork.return);
      }
      break;
    }
    case Profiler: {
      // TODO: Should this fire inside an offscreen tree? Or should it wait to
      // fire when the tree becomes visible again.
      if (flags & Update) {
        const prevEffectDuration = pushNestedEffectDurations();

        recursivelyTraverseLayoutEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
        );

        const profilerInstance = finishedWork.stateNode;

        if (enableProfilerTimer && enableProfilerCommitHooks) {
          // Propagate layout effect durations to the next nearest Profiler ancestor.
          // Do not reset these values until the next render so DevTools has a chance to read them first.
          profilerInstance.effectDuration +=
            bubbleNestedEffectDurations(prevEffectDuration);
        }

        commitProfilerUpdate(
          finishedWork,
          current,
          commitStartTime,
          profilerInstance.effectDuration,
        );
      } else {
        recursivelyTraverseLayoutEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
        );
      }
      break;
    }
    case SuspenseComponent: {
      recursivelyTraverseLayoutEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
      );
      if (flags & Update) {
        commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
      }
      if (flags & Callback) {
        // This Boundary is in fallback and has a dehydrated Suspense instance.
        // We could in theory assume the dehydrated state but we recheck it for
        // certainty.
        const finishedState: SuspenseState | null = finishedWork.memoizedState;
        if (finishedState !== null) {
          const dehydrated = finishedState.dehydrated;
          if (dehydrated !== null) {
            // Register a callback to retry this boundary once the server has sent the result.
            const retry = retryDehydratedSuspenseBoundary.bind(
              null,
              finishedWork,
            );
            registerSuspenseInstanceRetry(dehydrated, retry);
          }
        }
      }
      break;
    }
    case OffscreenComponent: {
      const isModernRoot =
        disableLegacyMode || (finishedWork.mode & ConcurrentMode) !== NoMode;
      if (isModernRoot) {
        const isHidden = finishedWork.memoizedState !== null;
        const newOffscreenSubtreeIsHidden =
          isHidden || offscreenSubtreeIsHidden;
        if (newOffscreenSubtreeIsHidden) {
          // The Offscreen tree is hidden. Skip over its layout effects.
        } else {
          // The Offscreen tree is visible.

          const wasHidden = current !== null && current.memoizedState !== null;
          const newOffscreenSubtreeWasHidden =
            wasHidden || offscreenSubtreeWasHidden;
          const prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden;
          const prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
          offscreenSubtreeIsHidden = newOffscreenSubtreeIsHidden;
          offscreenSubtreeWasHidden = newOffscreenSubtreeWasHidden;

          if (offscreenSubtreeWasHidden && !prevOffscreenSubtreeWasHidden) {
            // This is the root of a reappearing boundary. As we continue
            // traversing the layout effects, we must also re-mount layout
            // effects that were unmounted when the Offscreen subtree was
            // hidden. So this is a superset of the normal commitLayoutEffects.
            const includeWorkInProgressEffects =
              (finishedWork.subtreeFlags & LayoutMask) !== NoFlags;
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              includeWorkInProgressEffects,
            );
          } else {
            recursivelyTraverseLayoutEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
            );
          }
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
        }
      } else {
        recursivelyTraverseLayoutEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
        );
      }
      if (flags & Ref) {
        const props: OffscreenProps = finishedWork.memoizedProps;
        if (props.mode === 'manual') {
          safelyAttachRef(finishedWork, finishedWork.return);
        } else {
          safelyDetachRef(finishedWork, finishedWork.return);
        }
      }
      break;
    }
    case ViewTransitionComponent: {
      if (enableViewTransition) {
        recursivelyTraverseLayoutEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
        );
        if (flags & Ref) {
          safelyAttachRef(finishedWork, finishedWork.return);
        }
        break;
      }
      // Fallthrough
    }
    default: {
      recursivelyTraverseLayoutEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
      );
      break;
    }
  }

  if (
    enableProfilerTimer &&
    enableProfilerCommitHooks &&
    enableComponentPerformanceTrack &&
    (finishedWork.mode & ProfileMode) !== NoMode &&
    componentEffectStartTime >= 0 &&
    componentEffectEndTime >= 0 &&
    componentEffectDuration > 0.05
  ) {
    logComponentEffect(
      finishedWork,
      componentEffectStartTime,
      componentEffectEndTime,
      componentEffectDuration,
      componentEffectErrors,
    );
  }

  popComponentEffectStart(prevEffectStart);
  popComponentEffectErrors(prevEffectErrors);
}

function abortRootTransitions(
  root: FiberRoot,
  abort: TransitionAbort,
  deletedTransitions: Set<Transition>,
  deletedOffscreenInstance: OffscreenInstance | null,
  isInDeletedTree: boolean,
) {
  if (enableTransitionTracing) {
    const rootTransitions = root.incompleteTransitions;
    deletedTransitions.forEach(transition => {
      if (rootTransitions.has(transition)) {
        const transitionInstance: TracingMarkerInstance = (rootTransitions.get(
          transition,
        ): any);
        if (transitionInstance.aborts === null) {
          transitionInstance.aborts = [];
        }
        transitionInstance.aborts.push(abort);

        if (deletedOffscreenInstance !== null) {
          if (
            transitionInstance.pendingBoundaries !== null &&
            transitionInstance.pendingBoundaries.has(deletedOffscreenInstance)
          ) {
            // $FlowFixMe[incompatible-use] found when upgrading Flow
            transitionInstance.pendingBoundaries.delete(
              deletedOffscreenInstance,
            );
          }
        }
      }
    });
  }
}

function abortTracingMarkerTransitions(
  abortedFiber: Fiber,
  abort: TransitionAbort,
  deletedTransitions: Set<Transition>,
  deletedOffscreenInstance: OffscreenInstance | null,
  isInDeletedTree: boolean,
) {
  if (enableTransitionTracing) {
    const markerInstance: TracingMarkerInstance = abortedFiber.stateNode;
    const markerTransitions = markerInstance.transitions;
    const pendingBoundaries = markerInstance.pendingBoundaries;
    if (markerTransitions !== null) {
      // TODO: Refactor this code. Is there a way to move this code to
      // the deletions phase instead of calculating it here while making sure
      // complete is called appropriately?
      deletedTransitions.forEach(transition => {
        // If one of the transitions on the tracing marker is a transition
        // that was in an aborted subtree, we will abort that tracing marker
        if (
          abortedFiber !== null &&
          markerTransitions.has(transition) &&
          (markerInstance.aborts === null ||
            !markerInstance.aborts.includes(abort))
        ) {
          if (markerInstance.transitions !== null) {
            if (markerInstance.aborts === null) {
              markerInstance.aborts = [abort];
              addMarkerIncompleteCallbackToPendingTransition(
                abortedFiber.memoizedProps.name,
                markerInstance.transitions,
                markerInstance.aborts,
              );
            } else {
              markerInstance.aborts.push(abort);
            }

            // We only want to call onTransitionProgress when the marker hasn't been
            // deleted
            if (
              deletedOffscreenInstance !== null &&
              !isInDeletedTree &&
              pendingBoundaries !== null &&
              pendingBoundaries.has(deletedOffscreenInstance)
            ) {
              pendingBoundaries.delete(deletedOffscreenInstance);

              addMarkerProgressCallbackToPendingTransition(
                abortedFiber.memoizedProps.name,
                deletedTransitions,
                pendingBoundaries,
              );
            }
          }
        }
      });
    }
  }
}

function abortParentMarkerTransitionsForDeletedFiber(
  abortedFiber: Fiber,
  abort: TransitionAbort,
  deletedTransitions: Set<Transition>,
  deletedOffscreenInstance: OffscreenInstance | null,
  isInDeletedTree: boolean,
) {
  if (enableTransitionTracing) {
    // Find all pending markers that are waiting on child suspense boundaries in the
    // aborted subtree and cancels them
    let fiber: null | Fiber = abortedFiber;
    while (fiber !== null) {
      switch (fiber.tag) {
        case TracingMarkerComponent:
          abortTracingMarkerTransitions(
            fiber,
            abort,
            deletedTransitions,
            deletedOffscreenInstance,
            isInDeletedTree,
          );
          break;
        case HostRoot:
          const root = fiber.stateNode;
          abortRootTransitions(
            root,
            abort,
            deletedTransitions,
            deletedOffscreenInstance,
            isInDeletedTree,
          );

          break;
        default:
          break;
      }

      fiber = fiber.return;
    }
  }
}

function commitTransitionProgress(offscreenFiber: Fiber) {
  if (enableTransitionTracing) {
    // This function adds suspense boundaries to the root
    // or tracing marker's pendingBoundaries map.
    // When a suspense boundary goes from a resolved to a fallback
    // state we add the boundary to the map, and when it goes from
    // a fallback to a resolved state, we remove the boundary from
    // the map.

    // We use stateNode on the Offscreen component as a stable object
    // that doesnt change from render to render. This way we can
    // distinguish between different Offscreen instances (vs. the same
    // Offscreen instance with different fibers)
    const offscreenInstance: OffscreenInstance = offscreenFiber.stateNode;

    let prevState: SuspenseState | null = null;
    const previousFiber = offscreenFiber.alternate;
    if (previousFiber !== null && previousFiber.memoizedState !== null) {
      prevState = previousFiber.memoizedState;
    }
    const nextState: SuspenseState | null = offscreenFiber.memoizedState;

    const wasHidden = prevState !== null;
    const isHidden = nextState !== null;

    const pendingMarkers = offscreenInstance._pendingMarkers;
    // If there is a name on the suspense boundary, store that in
    // the pending boundaries.
    let name = null;
    const parent = offscreenFiber.return;
    if (
      parent !== null &&
      parent.tag === SuspenseComponent &&
      parent.memoizedProps.unstable_name
    ) {
      name = parent.memoizedProps.unstable_name;
    }

    if (!wasHidden && isHidden) {
      // The suspense boundaries was just hidden. Add the boundary
      // to the pending boundary set if it's there
      if (pendingMarkers !== null) {
        pendingMarkers.forEach(markerInstance => {
          const pendingBoundaries = markerInstance.pendingBoundaries;
          const transitions = markerInstance.transitions;
          const markerName = markerInstance.name;
          if (
            pendingBoundaries !== null &&
            !pendingBoundaries.has(offscreenInstance)
          ) {
            pendingBoundaries.set(offscreenInstance, {
              name,
            });
            if (transitions !== null) {
              if (
                markerInstance.tag === TransitionTracingMarker &&
                markerName !== null
              ) {
                addMarkerProgressCallbackToPendingTransition(
                  markerName,
                  transitions,
                  pendingBoundaries,
                );
              } else if (markerInstance.tag === TransitionRoot) {
                transitions.forEach(transition => {
                  addTransitionProgressCallbackToPendingTransition(
                    transition,
                    pendingBoundaries,
                  );
                });
              }
            }
          }
        });
      }
    } else if (wasHidden && !isHidden) {
      // The suspense boundary went from hidden to visible. Remove
      // the boundary from the pending suspense boundaries set
      // if it's there
      if (pendingMarkers !== null) {
        pendingMarkers.forEach(markerInstance => {
          const pendingBoundaries = markerInstance.pendingBoundaries;
          const transitions = markerInstance.transitions;
          const markerName = markerInstance.name;
          if (
            pendingBoundaries !== null &&
            pendingBoundaries.has(offscreenInstance)
          ) {
            pendingBoundaries.delete(offscreenInstance);
            if (transitions !== null) {
              if (
                markerInstance.tag === TransitionTracingMarker &&
                markerName !== null
              ) {
                addMarkerProgressCallbackToPendingTransition(
                  markerName,
                  transitions,
                  pendingBoundaries,
                );

                // If there are no more unresolved suspense boundaries, the interaction
                // is considered finished
                if (pendingBoundaries.size === 0) {
                  if (markerInstance.aborts === null) {
                    addMarkerCompleteCallbackToPendingTransition(
                      markerName,
                      transitions,
                    );
                  }
                  markerInstance.transitions = null;
                  markerInstance.pendingBoundaries = null;
                  markerInstance.aborts = null;
                }
              } else if (markerInstance.tag === TransitionRoot) {
                transitions.forEach(transition => {
                  addTransitionProgressCallbackToPendingTransition(
                    transition,
                    pendingBoundaries,
                  );
                });
              }
            }
          }
        });
      }
    }
  }
}

function hideOrUnhideAllChildren(finishedWork: Fiber, isHidden: boolean) {
  // Only hide or unhide the top-most host nodes.
  let hostSubtreeRoot = null;

  if (supportsMutation) {
    // We only have the top Fiber that was inserted but we need to recurse down its
    // children to find all the terminal nodes.
    let node: Fiber = finishedWork;
    while (true) {
      if (
        node.tag === HostComponent ||
        (supportsResources ? node.tag === HostHoistable : false)
      ) {
        if (hostSubtreeRoot === null) {
          hostSubtreeRoot = node;
          commitShowHideHostInstance(node, isHidden);
        }
      } else if (node.tag === HostText) {
        if (hostSubtreeRoot === null) {
          commitShowHideHostTextInstance(node, isHidden);
        }
      } else if (
        (node.tag === OffscreenComponent ||
          node.tag === LegacyHiddenComponent) &&
        (node.memoizedState: OffscreenState) !== null &&
        node !== finishedWork
      ) {
        // Found a nested Offscreen component that is hidden.
        // Don't search any deeper. This tree should remain hidden.
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

        if (hostSubtreeRoot === node) {
          hostSubtreeRoot = null;
        }

        node = node.return;
      }

      if (hostSubtreeRoot === node) {
        hostSubtreeRoot = null;
      }

      node.sibling.return = node.return;
      node = node.sibling;
    }
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
  //
  // Don't reset the alternate yet, either. We need that so we can detach the
  // alternate's fields in the passive phase. Clearing the return pointer is
  // sufficient for findDOMNode semantics.
  const alternate = fiber.alternate;
  if (alternate !== null) {
    alternate.return = null;
  }
  fiber.return = null;
}

function detachFiberAfterEffects(fiber: Fiber) {
  const alternate = fiber.alternate;
  if (alternate !== null) {
    fiber.alternate = null;
    detachFiberAfterEffects(alternate);
  }

  // Clear cyclical Fiber fields. This level alone is designed to roughly
  // approximate the planned Fiber refactor. In that world, `setState` will be
  // bound to a special "instance" object instead of a Fiber. The Instance
  // object will not have any of these fields. It will only be connected to
  // the fiber tree via a single link at the root. So if this level alone is
  // sufficient to fix memory issues, that bodes well for our plans.
  fiber.child = null;
  fiber.deletions = null;
  fiber.sibling = null;

  // The `stateNode` is cyclical because on host nodes it points to the host
  // tree, which has its own pointers to children, parents, and siblings.
  // The other host nodes also point back to fibers, so we should detach that
  // one, too.
  if (fiber.tag === HostComponent) {
    const hostInstance: Instance = fiber.stateNode;
    if (hostInstance !== null) {
      detachDeletedInstance(hostInstance);
    }
  }
  fiber.stateNode = null;

  if (__DEV__) {
    fiber._debugOwner = null;
  }

  // Theoretically, nothing in here should be necessary, because we already
  // disconnected the fiber from the tree. So even if something leaks this
  // particular fiber, it won't leak anything else.
  fiber.return = null;
  fiber.dependencies = null;
  fiber.memoizedProps = null;
  fiber.memoizedState = null;
  fiber.pendingProps = null;
  fiber.stateNode = null;
  // TODO: Move to `commitPassiveUnmountInsideDeletedTreeOnFiber` instead.
  fiber.updateQueue = null;
}

// These are tracked on the stack as we recursively traverse a
// deleted subtree.
// TODO: Update these during the whole mutation phase, not just during
// a deletion.
let hostParent: Instance | Container | null = null;
let hostParentIsContainer: boolean = false;

function commitDeletionEffects(
  root: FiberRoot,
  returnFiber: Fiber,
  deletedFiber: Fiber,
) {
  if (supportsMutation) {
    // We only have the top Fiber that was deleted but we need to recurse down its
    // children to find all the terminal nodes.

    // Recursively delete all host nodes from the parent, detach refs, clean
    // up mounted layout effects, and call componentWillUnmount.

    // We only need to remove the topmost host child in each branch. But then we
    // still need to keep traversing to unmount effects, refs, and cWU. TODO: We
    // could split this into two separate traversals functions, where the second
    // one doesn't include any removeChild logic. This is maybe the same
    // function as "disappearLayoutEffects" (or whatever that turns into after
    // the layout phase is refactored to use recursion).

    // Before starting, find the nearest host parent on the stack so we know
    // which instance/container to remove the children from.
    // TODO: Instead of searching up the fiber return path on every deletion, we
    // can track the nearest host component on the JS stack as we traverse the
    // tree during the commit phase. This would make insertions faster, too.
    let parent: null | Fiber = returnFiber;
    findParent: while (parent !== null) {
      switch (parent.tag) {
        case HostSingleton: {
          if (supportsSingletons) {
            if (isSingletonScope(parent.type)) {
              hostParent = parent.stateNode;
              hostParentIsContainer = false;
              break findParent;
            }
            break;
          }
          // Expected fallthrough when supportsSingletons is false
        }
        case HostComponent: {
          hostParent = parent.stateNode;
          hostParentIsContainer = false;
          break findParent;
        }
        case HostRoot:
        case HostPortal: {
          hostParent = parent.stateNode.containerInfo;
          hostParentIsContainer = true;
          break findParent;
        }
      }
      parent = parent.return;
    }
    if (hostParent === null) {
      throw new Error(
        'Expected to find a host parent. This error is likely caused by ' +
          'a bug in React. Please file an issue.',
      );
    }

    commitDeletionEffectsOnFiber(root, returnFiber, deletedFiber);
    hostParent = null;
    hostParentIsContainer = false;
  } else {
    // Detach refs and call componentWillUnmount() on the whole subtree.
    commitDeletionEffectsOnFiber(root, returnFiber, deletedFiber);
  }

  detachFiberMutation(deletedFiber);
}

function recursivelyTraverseDeletionEffects(
  finishedRoot: FiberRoot,
  nearestMountedAncestor: Fiber,
  parent: Fiber,
) {
  // TODO: Use a static flag to skip trees that don't have unmount effects
  let child = parent.child;
  while (child !== null) {
    commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, child);
    child = child.sibling;
  }
}

function commitDeletionEffectsOnFiber(
  finishedRoot: FiberRoot,
  nearestMountedAncestor: Fiber,
  deletedFiber: Fiber,
) {
  // TODO: Delete this Hook once new DevTools ships everywhere. No longer needed.
  onCommitUnmount(deletedFiber);

  // The cases in this outer switch modify the stack before they traverse
  // into their subtree. There are simpler cases in the inner switch
  // that don't modify the stack.
  switch (deletedFiber.tag) {
    case HostHoistable: {
      if (supportsResources) {
        if (!offscreenSubtreeWasHidden) {
          safelyDetachRef(deletedFiber, nearestMountedAncestor);
        }
        recursivelyTraverseDeletionEffects(
          finishedRoot,
          nearestMountedAncestor,
          deletedFiber,
        );
        if (deletedFiber.memoizedState) {
          releaseResource(deletedFiber.memoizedState);
        } else if (deletedFiber.stateNode) {
          unmountHoistable(deletedFiber.stateNode);
        }
        return;
      }
      // Fall through
    }
    case HostSingleton: {
      if (supportsSingletons) {
        if (!offscreenSubtreeWasHidden) {
          safelyDetachRef(deletedFiber, nearestMountedAncestor);
        }

        const prevHostParent = hostParent;
        const prevHostParentIsContainer = hostParentIsContainer;
        if (isSingletonScope(deletedFiber.type)) {
          hostParent = deletedFiber.stateNode;
          hostParentIsContainer = false;
        }
        recursivelyTraverseDeletionEffects(
          finishedRoot,
          nearestMountedAncestor,
          deletedFiber,
        );

        // Normally this is called in passive unmount effect phase however with
        // HostSingleton we warn if you acquire one that is already associated to
        // a different fiber. To increase our chances of avoiding this, specifically
        // if you keyed a HostSingleton so there will be a delete followed by a Placement
        // we treat detach eagerly here
        commitHostSingletonRelease(deletedFiber);

        hostParent = prevHostParent;
        hostParentIsContainer = prevHostParentIsContainer;

        return;
      }
      // Fall through
    }
    case HostComponent: {
      if (!offscreenSubtreeWasHidden) {
        safelyDetachRef(deletedFiber, nearestMountedAncestor);
      }
      // Intentional fallthrough to next branch
    }
    case HostText: {
      // We only need to remove the nearest host child. Set the host parent
      // to `null` on the stack to indicate that nested children don't
      // need to be removed.
      if (supportsMutation) {
        const prevHostParent = hostParent;
        const prevHostParentIsContainer = hostParentIsContainer;
        hostParent = null;
        recursivelyTraverseDeletionEffects(
          finishedRoot,
          nearestMountedAncestor,
          deletedFiber,
        );
        hostParent = prevHostParent;
        hostParentIsContainer = prevHostParentIsContainer;

        if (hostParent !== null) {
          // Now that all the child effects have unmounted, we can remove the
          // node from the tree.
          if (hostParentIsContainer) {
            commitHostRemoveChildFromContainer(
              deletedFiber,
              nearestMountedAncestor,
              ((hostParent: any): Container),
              (deletedFiber.stateNode: Instance | TextInstance),
            );
          } else {
            commitHostRemoveChild(
              deletedFiber,
              nearestMountedAncestor,
              ((hostParent: any): Instance),
              (deletedFiber.stateNode: Instance | TextInstance),
            );
          }
        }
      } else {
        recursivelyTraverseDeletionEffects(
          finishedRoot,
          nearestMountedAncestor,
          deletedFiber,
        );
      }
      return;
    }
    case DehydratedFragment: {
      if (enableSuspenseCallback) {
        const hydrationCallbacks = finishedRoot.hydrationCallbacks;
        if (hydrationCallbacks !== null) {
          try {
            const onDeleted = hydrationCallbacks.onDeleted;
            if (onDeleted) {
              onDeleted((deletedFiber.stateNode: SuspenseInstance));
            }
          } catch (error) {
            captureCommitPhaseError(
              deletedFiber,
              nearestMountedAncestor,
              error,
            );
          }
        }
      }

      // Dehydrated fragments don't have any children

      // Delete the dehydrated suspense boundary and all of its content.
      if (supportsMutation) {
        if (hostParent !== null) {
          if (hostParentIsContainer) {
            clearSuspenseBoundaryFromContainer(
              ((hostParent: any): Container),
              (deletedFiber.stateNode: SuspenseInstance),
            );
          } else {
            clearSuspenseBoundary(
              ((hostParent: any): Instance),
              (deletedFiber.stateNode: SuspenseInstance),
            );
          }
        }
      }
      return;
    }
    case HostPortal: {
      if (supportsMutation) {
        // When we go into a portal, it becomes the parent to remove from.
        const prevHostParent = hostParent;
        const prevHostParentIsContainer = hostParentIsContainer;
        hostParent = deletedFiber.stateNode.containerInfo;
        hostParentIsContainer = true;
        recursivelyTraverseDeletionEffects(
          finishedRoot,
          nearestMountedAncestor,
          deletedFiber,
        );
        hostParent = prevHostParent;
        hostParentIsContainer = prevHostParentIsContainer;
      } else {
        if (supportsPersistence) {
          commitHostPortalContainerChildren(
            deletedFiber.stateNode,
            deletedFiber,
            createContainerChildSet(),
          );
        }

        recursivelyTraverseDeletionEffects(
          finishedRoot,
          nearestMountedAncestor,
          deletedFiber,
        );
      }
      return;
    }
    case FunctionComponent:
    case ForwardRef:
    case MemoComponent:
    case SimpleMemoComponent: {
      if (
        enableHiddenSubtreeInsertionEffectCleanup ||
        !offscreenSubtreeWasHidden
      ) {
        // TODO: Use a commitHookInsertionUnmountEffects wrapper to record timings.
        commitHookEffectListUnmount(
          HookInsertion,
          deletedFiber,
          nearestMountedAncestor,
        );
      }
      if (!offscreenSubtreeWasHidden) {
        commitHookLayoutUnmountEffects(
          deletedFiber,
          nearestMountedAncestor,
          HookLayout,
        );
      }
      recursivelyTraverseDeletionEffects(
        finishedRoot,
        nearestMountedAncestor,
        deletedFiber,
      );
      return;
    }
    case ClassComponent: {
      if (!offscreenSubtreeWasHidden) {
        safelyDetachRef(deletedFiber, nearestMountedAncestor);
        const instance = deletedFiber.stateNode;
        if (typeof instance.componentWillUnmount === 'function') {
          safelyCallComponentWillUnmount(
            deletedFiber,
            nearestMountedAncestor,
            instance,
          );
        }
      }
      recursivelyTraverseDeletionEffects(
        finishedRoot,
        nearestMountedAncestor,
        deletedFiber,
      );
      return;
    }
    case ScopeComponent: {
      if (enableScopeAPI) {
        if (!offscreenSubtreeWasHidden) {
          safelyDetachRef(deletedFiber, nearestMountedAncestor);
        }
      }
      recursivelyTraverseDeletionEffects(
        finishedRoot,
        nearestMountedAncestor,
        deletedFiber,
      );
      return;
    }
    case OffscreenComponent: {
      if (!offscreenSubtreeWasHidden) {
        safelyDetachRef(deletedFiber, nearestMountedAncestor);
      }
      if (disableLegacyMode || deletedFiber.mode & ConcurrentMode) {
        // If this offscreen component is hidden, we already unmounted it. Before
        // deleting the children, track that it's already unmounted so that we
        // don't attempt to unmount the effects again.
        // TODO: If the tree is hidden, in most cases we should be able to skip
        // over the nested children entirely. An exception is we haven't yet found
        // the topmost host node to delete, which we already track on the stack.
        // But the other case is portals, which need to be detached no matter how
        // deeply they are nested. We should use a subtree flag to track whether a
        // subtree includes a nested portal.
        const prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
        offscreenSubtreeWasHidden =
          prevOffscreenSubtreeWasHidden || deletedFiber.memoizedState !== null;

        recursivelyTraverseDeletionEffects(
          finishedRoot,
          nearestMountedAncestor,
          deletedFiber,
        );
        offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
      } else {
        recursivelyTraverseDeletionEffects(
          finishedRoot,
          nearestMountedAncestor,
          deletedFiber,
        );
      }
      break;
    }
    default: {
      recursivelyTraverseDeletionEffects(
        finishedRoot,
        nearestMountedAncestor,
        deletedFiber,
      );
      return;
    }
  }
}
function commitSuspenseCallback(finishedWork: Fiber) {
  // TODO: Delete this feature. It's not properly covered by DEV features.
  const newState: SuspenseState | null = finishedWork.memoizedState;
  if (enableSuspenseCallback && newState !== null) {
    const suspenseCallback = finishedWork.memoizedProps.suspenseCallback;
    if (typeof suspenseCallback === 'function') {
      const retryQueue: RetryQueue | null = (finishedWork.updateQueue: any);
      if (retryQueue !== null) {
        suspenseCallback(new Set(retryQueue));
      }
    } else if (__DEV__) {
      if (suspenseCallback !== undefined) {
        console.error('Unexpected type for suspenseCallback.');
      }
    }
  }
}

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
          commitHostHydratedSuspense(suspenseInstance, finishedWork);
          if (enableSuspenseCallback) {
            try {
              // TODO: Delete this feature. It's not properly covered by DEV features.
              const hydrationCallbacks = finishedRoot.hydrationCallbacks;
              if (hydrationCallbacks !== null) {
                const onHydrated = hydrationCallbacks.onHydrated;
                if (onHydrated) {
                  onHydrated(suspenseInstance);
                }
              }
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
        }
      }
    }
  }
}

function getRetryCache(finishedWork: Fiber) {
  // TODO: Unify the interface for the retry cache so we don't have to switch
  // on the tag like this.
  switch (finishedWork.tag) {
    case SuspenseComponent:
    case SuspenseListComponent: {
      let retryCache = finishedWork.stateNode;
      if (retryCache === null) {
        retryCache = finishedWork.stateNode = new PossiblyWeakSet();
      }
      return retryCache;
    }
    case OffscreenComponent: {
      const instance: OffscreenInstance = finishedWork.stateNode;
      let retryCache: null | Set<Wakeable> | WeakSet<Wakeable> =
        instance._retryCache;
      if (retryCache === null) {
        retryCache = instance._retryCache = new PossiblyWeakSet();
      }
      return retryCache;
    }
    default: {
      throw new Error(
        `Unexpected Suspense handler tag (${finishedWork.tag}). This is a ` +
          'bug in React.',
      );
    }
  }
}

export function detachOffscreenInstance(instance: OffscreenInstance): void {
  const fiber = instance._current;
  if (fiber === null) {
    throw new Error(
      'Calling Offscreen.detach before instance handle has been set.',
    );
  }

  if ((instance._pendingVisibility & OffscreenDetached) !== NoFlags) {
    // The instance is already detached, this is a noop.
    return;
  }

  // TODO: There is an opportunity to optimise this by not entering commit phase
  // and unmounting effects directly.
  const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
  if (root !== null) {
    instance._pendingVisibility |= OffscreenDetached;
    scheduleUpdateOnFiber(root, fiber, SyncLane);
  }
}

export function attachOffscreenInstance(instance: OffscreenInstance): void {
  const fiber = instance._current;
  if (fiber === null) {
    throw new Error(
      'Calling Offscreen.detach before instance handle has been set.',
    );
  }

  if ((instance._pendingVisibility & OffscreenDetached) === NoFlags) {
    // The instance is already attached, this is a noop.
    return;
  }

  const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
  if (root !== null) {
    instance._pendingVisibility &= ~OffscreenDetached;
    scheduleUpdateOnFiber(root, fiber, SyncLane);
  }
}

function attachSuspenseRetryListeners(
  finishedWork: Fiber,
  wakeables: RetryQueue,
) {
  // If this boundary just timed out, then it will have a set of wakeables.
  // For each wakeable, attach a listener so that when it resolves, React
  // attempts to re-render the boundary in the primary (pre-timeout) state.
  const retryCache = getRetryCache(finishedWork);
  wakeables.forEach(wakeable => {
    // Memoize using the boundary fiber to prevent redundant listeners.
    const retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);
    if (!retryCache.has(wakeable)) {
      retryCache.add(wakeable);

      if (enableUpdaterTracking) {
        if (isDevToolsPresent) {
          if (inProgressLanes !== null && inProgressRoot !== null) {
            // If we have pending work still, associate the original updaters with it.
            restorePendingUpdaters(inProgressRoot, inProgressLanes);
          } else {
            throw Error(
              'Expected finished root and lanes to be set. This is a bug in React.',
            );
          }
        }
      }

      wakeable.then(retry, retry);
    }
  });
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

export function commitMutationEffects(
  root: FiberRoot,
  finishedWork: Fiber,
  committedLanes: Lanes,
) {
  inProgressLanes = committedLanes;
  inProgressRoot = root;

  resetComponentEffectTimers();

  commitMutationEffectsOnFiber(finishedWork, root, committedLanes);

  inProgressLanes = null;
  inProgressRoot = null;
}

function recursivelyTraverseMutationEffects(
  root: FiberRoot,
  parentFiber: Fiber,
  lanes: Lanes,
) {
  // Deletions effects can be scheduled on any fiber type. They need to happen
  // before the children effects have fired.
  const deletions = parentFiber.deletions;
  if (deletions !== null) {
    for (let i = 0; i < deletions.length; i++) {
      const childToDelete = deletions[i];
      commitDeletionEffects(root, parentFiber, childToDelete);
    }
  }

  if (
    parentFiber.subtreeFlags &
    (enablePersistedModeClonedFlag ? MutationMask | Cloned : MutationMask)
  ) {
    let child = parentFiber.child;
    while (child !== null) {
      commitMutationEffectsOnFiber(child, root, lanes);
      child = child.sibling;
    }
  }
}

let currentHoistableRoot: HoistableRoot | null = null;

function commitMutationEffectsOnFiber(
  finishedWork: Fiber,
  root: FiberRoot,
  lanes: Lanes,
) {
  const prevEffectStart = pushComponentEffectStart();
  const prevEffectErrors = pushComponentEffectErrors();
  const current = finishedWork.alternate;
  const flags = finishedWork.flags;

  // The effect flag should be checked *after* we refine the type of fiber,
  // because the fiber tag is more specific. An exception is any flag related
  // to reconciliation, because those can be set on all fiber types.
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case MemoComponent:
    case SimpleMemoComponent: {
      recursivelyTraverseMutationEffects(root, finishedWork, lanes);
      commitReconciliationEffects(finishedWork, lanes);

      if (flags & Update) {
        commitHookEffectListUnmount(
          HookInsertion | HookHasEffect,
          finishedWork,
          finishedWork.return,
        );
        // TODO: Use a commitHookInsertionUnmountEffects wrapper to record timings.
        commitHookEffectListMount(HookInsertion | HookHasEffect, finishedWork);
        commitHookLayoutUnmountEffects(
          finishedWork,
          finishedWork.return,
          HookLayout | HookHasEffect,
        );
      }
      break;
    }
    case ClassComponent: {
      recursivelyTraverseMutationEffects(root, finishedWork, lanes);
      commitReconciliationEffects(finishedWork, lanes);

      if (flags & Ref) {
        if (!offscreenSubtreeWasHidden && current !== null) {
          safelyDetachRef(current, current.return);
        }
      }

      if (flags & Callback && offscreenSubtreeIsHidden) {
        const updateQueue: UpdateQueue<mixed> | null =
          (finishedWork.updateQueue: any);
        if (updateQueue !== null) {
          deferHiddenCallbacks(updateQueue);
        }
      }
      break;
    }
    case HostHoistable: {
      if (supportsResources) {
        // We cast because we always set the root at the React root and so it cannot be
        // null while we are processing mutation effects
        const hoistableRoot: HoistableRoot = (currentHoistableRoot: any);
        recursivelyTraverseMutationEffects(root, finishedWork, lanes);
        commitReconciliationEffects(finishedWork, lanes);

        if (flags & Ref) {
          if (!offscreenSubtreeWasHidden && current !== null) {
            safelyDetachRef(current, current.return);
          }
        }

        if (flags & Update) {
          const currentResource =
            current !== null ? current.memoizedState : null;
          const newResource = finishedWork.memoizedState;
          if (current === null) {
            // We are mounting a new HostHoistable Fiber. We fork the mount
            // behavior based on whether this instance is a Hoistable Instance
            // or a Hoistable Resource
            if (newResource === null) {
              if (finishedWork.stateNode === null) {
                finishedWork.stateNode = hydrateHoistable(
                  hoistableRoot,
                  finishedWork.type,
                  finishedWork.memoizedProps,
                  finishedWork,
                );
              } else {
                mountHoistable(
                  hoistableRoot,
                  finishedWork.type,
                  finishedWork.stateNode,
                );
              }
            } else {
              finishedWork.stateNode = acquireResource(
                hoistableRoot,
                newResource,
                finishedWork.memoizedProps,
              );
            }
          } else if (currentResource !== newResource) {
            // We are moving to or from Hoistable Resource, or between different Hoistable Resources
            if (currentResource === null) {
              if (current.stateNode !== null) {
                unmountHoistable(current.stateNode);
              }
            } else {
              releaseResource(currentResource);
            }
            if (newResource === null) {
              mountHoistable(
                hoistableRoot,
                finishedWork.type,
                finishedWork.stateNode,
              );
            } else {
              acquireResource(
                hoistableRoot,
                newResource,
                finishedWork.memoizedProps,
              );
            }
          } else if (newResource === null && finishedWork.stateNode !== null) {
            commitHostUpdate(
              finishedWork,
              finishedWork.memoizedProps,
              current.memoizedProps,
            );
          }
        }
        break;
      }
      // Fall through
    }
    case HostSingleton: {
      if (supportsSingletons) {
        recursivelyTraverseMutationEffects(root, finishedWork, lanes);
        commitReconciliationEffects(finishedWork, lanes);
        if (flags & Ref) {
          if (!offscreenSubtreeWasHidden && current !== null) {
            safelyDetachRef(current, current.return);
          }
        }
        if (current !== null && flags & Update) {
          const newProps = finishedWork.memoizedProps;
          const oldProps = current.memoizedProps;
          commitHostUpdate(finishedWork, newProps, oldProps);
        }
        break;
      }
      // Fall through
    }
    case HostComponent: {
      recursivelyTraverseMutationEffects(root, finishedWork, lanes);
      commitReconciliationEffects(finishedWork, lanes);

      if (flags & Ref) {
        if (!offscreenSubtreeWasHidden && current !== null) {
          safelyDetachRef(current, current.return);
        }
      }
      if (supportsMutation) {
        // TODO: ContentReset gets cleared by the children during the commit
        // phase. This is a refactor hazard because it means we must read
        // flags the flags after `commitReconciliationEffects` has already run;
        // the order matters. We should refactor so that ContentReset does not
        // rely on mutating the flag during commit. Like by setting a flag
        // during the render phase instead.
        if (finishedWork.flags & ContentReset) {
          commitHostResetTextContent(finishedWork);
        }

        if (flags & Update) {
          const instance: Instance = finishedWork.stateNode;
          if (instance != null) {
            // Commit the work prepared earlier.
            // For hydration we reuse the update path but we treat the oldProps
            // as the newProps. The updatePayload will contain the real change in
            // this case.
            const newProps = finishedWork.memoizedProps;
            const oldProps =
              current !== null ? current.memoizedProps : newProps;
            commitHostUpdate(finishedWork, newProps, oldProps);
          }
        }

        if (flags & FormReset) {
          needsFormReset = true;
          if (__DEV__) {
            if (finishedWork.type !== 'form') {
              // Paranoid coding. In case we accidentally start using the
              // FormReset bit for something else.
              console.error(
                'Unexpected host component type. Expected a form. This is a ' +
                  'bug in React.',
              );
            }
          }
        }
      }
      break;
    }
    case HostText: {
      recursivelyTraverseMutationEffects(root, finishedWork, lanes);
      commitReconciliationEffects(finishedWork, lanes);

      if (flags & Update) {
        if (supportsMutation) {
          if (finishedWork.stateNode === null) {
            throw new Error(
              'This should have a text node initialized. This error is likely ' +
                'caused by a bug in React. Please file an issue.',
            );
          }

          const newText: string = finishedWork.memoizedProps;
          // For hydration we reuse the update path but we treat the oldProps
          // as the newProps. The updatePayload will contain the real change in
          // this case.
          const oldText: string =
            current !== null ? current.memoizedProps : newText;

          commitHostTextUpdate(finishedWork, newText, oldText);
        }
      }
      break;
    }
    case HostRoot: {
      const prevEffectDuration = pushNestedEffectDurations();

      if (supportsResources) {
        prepareToCommitHoistables();

        const previousHoistableRoot = currentHoistableRoot;
        currentHoistableRoot = getHoistableRoot(root.containerInfo);

        recursivelyTraverseMutationEffects(root, finishedWork, lanes);
        currentHoistableRoot = previousHoistableRoot;

        commitReconciliationEffects(finishedWork, lanes);
      } else {
        recursivelyTraverseMutationEffects(root, finishedWork, lanes);
        commitReconciliationEffects(finishedWork, lanes);
      }

      if (flags & Update) {
        if (supportsMutation && supportsHydration) {
          if (current !== null) {
            const prevRootState: RootState = current.memoizedState;
            if (prevRootState.isDehydrated) {
              commitHostHydratedContainer(root, finishedWork);
            }
          }
        }
        if (supportsPersistence) {
          commitHostRootContainerChildren(root, finishedWork);
        }
      }

      if (needsFormReset) {
        // A form component requested to be reset during this commit. We do this
        // after all mutations in the rest of the tree so that `defaultValue`
        // will already be updated. This way you can update `defaultValue` using
        // data sent by the server as a result of the form submission.
        //
        // Theoretically we could check finishedWork.subtreeFlags & FormReset,
        // but the FormReset bit is overloaded with other flags used by other
        // fiber types. So this extra variable lets us skip traversing the tree
        // except when a form was actually submitted.
        needsFormReset = false;
        recursivelyResetForms(finishedWork);
      }

      if (enableProfilerTimer && enableProfilerCommitHooks) {
        root.effectDuration += popNestedEffectDurations(prevEffectDuration);
      }

      break;
    }
    case HostPortal: {
      if (supportsResources) {
        const previousHoistableRoot = currentHoistableRoot;
        currentHoistableRoot = getHoistableRoot(
          finishedWork.stateNode.containerInfo,
        );
        recursivelyTraverseMutationEffects(root, finishedWork, lanes);
        commitReconciliationEffects(finishedWork, lanes);
        currentHoistableRoot = previousHoistableRoot;
      } else {
        recursivelyTraverseMutationEffects(root, finishedWork, lanes);
        commitReconciliationEffects(finishedWork, lanes);
      }

      if (flags & Update) {
        if (supportsPersistence) {
          commitHostPortalContainerChildren(
            finishedWork.stateNode,
            finishedWork,
            finishedWork.stateNode.pendingChildren,
          );
        }
      }
      break;
    }
    case Profiler: {
      const prevEffectDuration = pushNestedEffectDurations();

      recursivelyTraverseMutationEffects(root, finishedWork, lanes);
      commitReconciliationEffects(finishedWork, lanes);

      if (enableProfilerTimer && enableProfilerCommitHooks) {
        const profilerInstance = finishedWork.stateNode;
        // Propagate layout effect durations to the next nearest Profiler ancestor.
        // Do not reset these values until the next render so DevTools has a chance to read them first.
        profilerInstance.effectDuration +=
          bubbleNestedEffectDurations(prevEffectDuration);
      }
      break;
    }
    case SuspenseComponent: {
      recursivelyTraverseMutationEffects(root, finishedWork, lanes);
      commitReconciliationEffects(finishedWork, lanes);

      // TODO: We should mark a flag on the Suspense fiber itself, rather than
      // relying on the Offscreen fiber having a flag also being marked. The
      // reason is that this offscreen fiber might not be part of the work-in-
      // progress tree! It could have been reused from a previous render. This
      // doesn't lead to incorrect behavior because we don't rely on the flag
      // check alone; we also compare the states explicitly below. But for
      // modeling purposes, we _should_ be able to rely on the flag check alone.
      // So this is a bit fragile.
      //
      // Also, all this logic could/should move to the passive phase so it
      // doesn't block paint.
      const offscreenFiber: Fiber = (finishedWork.child: any);
      if (offscreenFiber.flags & Visibility) {
        // Throttle the appearance and disappearance of Suspense fallbacks.
        const isShowingFallback =
          (finishedWork.memoizedState: SuspenseState | null) !== null;
        const wasShowingFallback =
          current !== null &&
          (current.memoizedState: SuspenseState | null) !== null;

        if (alwaysThrottleRetries) {
          if (isShowingFallback !== wasShowingFallback) {
            // A fallback is either appearing or disappearing.
            markCommitTimeOfFallback();
          }
        } else {
          if (isShowingFallback && !wasShowingFallback) {
            // Old behavior. Only mark when a fallback appears, not when
            // it disappears.
            markCommitTimeOfFallback();
          }
        }
      }

      if (flags & Update) {
        try {
          commitSuspenseCallback(finishedWork);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
        const retryQueue: RetryQueue | null = (finishedWork.updateQueue: any);
        if (retryQueue !== null) {
          finishedWork.updateQueue = null;
          attachSuspenseRetryListeners(finishedWork, retryQueue);
        }
      }
      break;
    }
    case OffscreenComponent: {
      if (flags & Ref) {
        if (!offscreenSubtreeWasHidden && current !== null) {
          safelyDetachRef(current, current.return);
        }
      }

      const newState: OffscreenState | null = finishedWork.memoizedState;
      const isHidden = newState !== null;
      const wasHidden = current !== null && current.memoizedState !== null;

      if (disableLegacyMode || finishedWork.mode & ConcurrentMode) {
        // Before committing the children, track on the stack whether this
        // offscreen subtree was already hidden, so that we don't unmount the
        // effects again.
        const prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden;
        const prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
        offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden || isHidden;
        offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || wasHidden;
        recursivelyTraverseMutationEffects(root, finishedWork, lanes);
        offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
        offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
      } else {
        recursivelyTraverseMutationEffects(root, finishedWork, lanes);
      }

      commitReconciliationEffects(finishedWork, lanes);

      const offscreenInstance: OffscreenInstance = finishedWork.stateNode;

      // TODO: Add explicit effect flag to set _current.
      offscreenInstance._current = finishedWork;

      // Offscreen stores pending changes to visibility in `_pendingVisibility`. This is
      // to support batching of `attach` and `detach` calls.
      offscreenInstance._visibility &= ~OffscreenDetached;
      offscreenInstance._visibility |=
        offscreenInstance._pendingVisibility & OffscreenDetached;

      if (flags & Visibility) {
        // Track the current state on the Offscreen instance so we can
        // read it during an event
        if (isHidden) {
          offscreenInstance._visibility &= ~OffscreenVisible;
        } else {
          offscreenInstance._visibility |= OffscreenVisible;
        }

        const isUpdate = current !== null;
        if (isHidden) {
          // Only trigger disappear layout effects if:
          //   - This is an update, not first mount.
          //   - This Offscreen was not hidden before.
          //   - Ancestor Offscreen was not hidden in previous commit or in this commit
          if (
            isUpdate &&
            !wasHidden &&
            !offscreenSubtreeIsHidden &&
            !offscreenSubtreeWasHidden
          ) {
            if (
              disableLegacyMode ||
              (finishedWork.mode & ConcurrentMode) !== NoMode
            ) {
              // Disappear the layout effects of all the children
              recursivelyTraverseDisappearLayoutEffects(finishedWork);
            }
          }
        }

        // Offscreen with manual mode manages visibility manually.
        if (supportsMutation && !isOffscreenManual(finishedWork)) {
          // TODO: This needs to run whenever there's an insertion or update
          // inside a hidden Offscreen tree.
          hideOrUnhideAllChildren(finishedWork, isHidden);
        }
      }

      // TODO: Move to passive phase
      if (flags & Update) {
        const offscreenQueue: OffscreenQueue | null =
          (finishedWork.updateQueue: any);
        if (offscreenQueue !== null) {
          const retryQueue = offscreenQueue.retryQueue;
          if (retryQueue !== null) {
            offscreenQueue.retryQueue = null;
            attachSuspenseRetryListeners(finishedWork, retryQueue);
          }
        }
      }
      break;
    }
    case SuspenseListComponent: {
      recursivelyTraverseMutationEffects(root, finishedWork, lanes);
      commitReconciliationEffects(finishedWork, lanes);

      if (flags & Update) {
        const retryQueue: Set<Wakeable> | null =
          (finishedWork.updateQueue: any);
        if (retryQueue !== null) {
          finishedWork.updateQueue = null;
          attachSuspenseRetryListeners(finishedWork, retryQueue);
        }
      }
      break;
    }
    case ViewTransitionComponent:
      if (enableViewTransition) {
        if (flags & Ref) {
          if (!offscreenSubtreeWasHidden && current !== null) {
            safelyDetachRef(current, current.return);
          }
        }
        const prevMutationContext = pushMutationContext();
        recursivelyTraverseMutationEffects(root, finishedWork, lanes);
        commitReconciliationEffects(finishedWork, lanes);
        const isViewTransitionEligible =
          enableViewTransition &&
          includesOnlyViewTransitionEligibleLanes(lanes);
        if (isViewTransitionEligible) {
          if (current === null) {
            // This is a new mount. We should have handled this as part of the
            // Placement effect or it is deeper inside a entering transition.
          } else if (viewTransitionMutationContext) {
            // Something mutated in this tree so we need to animate this regardless
            // what the measurements say. We use the Update flag to track this.
            // If diffing was done in the render phase, like we used, this could have
            // been done in the render already.
            finishedWork.flags |= Update;
          }
        }
        popMutationContext(prevMutationContext);
        break;
      }
    // Fallthrough
    case ScopeComponent: {
      if (enableScopeAPI) {
        recursivelyTraverseMutationEffects(root, finishedWork, lanes);
        commitReconciliationEffects(finishedWork, lanes);

        // TODO: This is a temporary solution that allowed us to transition away
        // from React Flare on www.
        if (flags & Ref) {
          if (!offscreenSubtreeWasHidden && current !== null) {
            safelyDetachRef(finishedWork, finishedWork.return);
          }
          if (!offscreenSubtreeIsHidden) {
            safelyAttachRef(finishedWork, finishedWork.return);
          }
        }
        if (flags & Update) {
          const scopeInstance = finishedWork.stateNode;
          prepareScopeUpdate(scopeInstance, finishedWork);
        }
      }
      break;
    }
    default: {
      recursivelyTraverseMutationEffects(root, finishedWork, lanes);
      commitReconciliationEffects(finishedWork, lanes);

      break;
    }
  }

  if (
    enableProfilerTimer &&
    enableProfilerCommitHooks &&
    enableComponentPerformanceTrack &&
    (finishedWork.mode & ProfileMode) !== NoMode &&
    componentEffectStartTime >= 0 &&
    componentEffectEndTime >= 0 &&
    componentEffectDuration > 0.05
  ) {
    logComponentEffect(
      finishedWork,
      componentEffectStartTime,
      componentEffectEndTime,
      componentEffectDuration,
      componentEffectErrors,
    );
  }

  popComponentEffectStart(prevEffectStart);
  popComponentEffectErrors(prevEffectErrors);
}

function commitReconciliationEffects(
  finishedWork: Fiber,
  committedLanes: Lanes,
) {
  // Placement effects (insertions, reorders) can be scheduled on any fiber
  // type. They needs to happen after the children effects have fired, but
  // before the effects on this fiber have fired.
  const flags = finishedWork.flags;
  if (flags & Placement) {
    commitHostPlacement(finishedWork);
    // Clear the "placement" from effect tag so that we know that this is
    // inserted, before any life-cycles like componentDidMount gets called.
    // TODO: findDOMNode doesn't rely on this any more but isMounted does
    // and isMounted is deprecated anyway so we should be able to kill this.
    finishedWork.flags &= ~Placement;
  }
  if (flags & Hydrating) {
    finishedWork.flags &= ~Hydrating;
  }
}

function recursivelyResetForms(parentFiber: Fiber) {
  if (parentFiber.subtreeFlags & FormReset) {
    let child = parentFiber.child;
    while (child !== null) {
      resetFormOnFiber(child);
      child = child.sibling;
    }
  }
}

function resetFormOnFiber(fiber: Fiber) {
  recursivelyResetForms(fiber);
  if (fiber.tag === HostComponent && fiber.flags & FormReset) {
    const formInstance: FormInstance = fiber.stateNode;
    resetFormInstance(formInstance);
  }
}

export function commitAfterMutationEffects(
  root: FiberRoot,
  finishedWork: Fiber,
  committedLanes: Lanes,
): void {
  if (!enableViewTransition) {
    // This phase is only used for view transitions.
    return;
  }
  commitAfterMutationEffectsOnFiber(finishedWork, root, committedLanes);
}

function recursivelyTraverseAfterMutationEffects(
  root: FiberRoot,
  parentFiber: Fiber,
  lanes: Lanes,
) {
  // We need to visit the same nodes that we visited in the before mutation phase.
  if (parentFiber.subtreeFlags & BeforeMutationTransitionMask) {
    let child = parentFiber.child;
    while (child !== null) {
      commitAfterMutationEffectsOnFiber(child, root, lanes);
      child = child.sibling;
    }
  } else {
    // Nothing has changed in this subtree, but the parent may have still affected
    // its size and position. We need to measure this and if not, restore it to
    // not animate.
    measureNestedViewTransitions(parentFiber);
  }
}

function commitAfterMutationEffectsOnFiber(
  finishedWork: Fiber,
  root: FiberRoot,
  lanes: Lanes,
) {
  const current = finishedWork.alternate;
  if (current === null) {
    // This is a newly inserted subtree. We can't use Placement flags to detect
    // this since they get removed in the mutation phase. Usually it's not enough
    // to just check current because that can also happen deeper in the same tree.
    // However, since we don't need to visit newly inserted subtrees in AfterMutation
    // we can just bail after we're done with the first one.
    // The first ViewTransition inside a newly mounted tree runs an enter transition
    // but other nested ones don't unless they have a named pair.
    commitEnterViewTransitions(finishedWork);
    return;
  }

  switch (finishedWork.tag) {
    case HostRoot: {
      viewTransitionContextChanged = false;
      viewTransitionCancelableChildren = null;
      recursivelyTraverseAfterMutationEffects(root, finishedWork, lanes);
      if (!viewTransitionContextChanged) {
        // If we didn't leak any resizing out to the root, we don't have to transition
        // the root itself. This means that we can now safely cancel any cancellations
        // that bubbled all the way up.
        const cancelableChildren = viewTransitionCancelableChildren;
        viewTransitionCancelableChildren = null;
        if (cancelableChildren !== null) {
          for (let i = 0; i < cancelableChildren.length; i += 3) {
            cancelViewTransitionName(
              ((cancelableChildren[i]: any): Instance),
              ((cancelableChildren[i + 1]: any): string),
              ((cancelableChildren[i + 2]: any): Props),
            );
          }
        }
        // We also cancel the root itself.
        cancelRootViewTransitionName(root.containerInfo);
      }
      break;
    }
    case HostComponent: {
      recursivelyTraverseAfterMutationEffects(root, finishedWork, lanes);
      break;
    }
    case OffscreenComponent: {
      const isModernRoot =
        disableLegacyMode || (finishedWork.mode & ConcurrentMode) !== NoMode;
      if (isModernRoot) {
        const isHidden = finishedWork.memoizedState !== null;
        if (isHidden) {
          // The Offscreen tree is hidden. Skip over its after mutation effects.
        } else {
          // The Offscreen tree is visible.
          const wasHidden = current.memoizedState !== null;
          if (wasHidden) {
            commitEnterViewTransitions(finishedWork);
            // If it was previous hidden then the children are treated as enter
            // not updates so we don't need to visit these children.
          } else {
            recursivelyTraverseAfterMutationEffects(root, finishedWork, lanes);
          }
        }
      } else {
        recursivelyTraverseAfterMutationEffects(root, finishedWork, lanes);
      }
      break;
    }
    case ViewTransitionComponent: {
      if (
        (finishedWork.subtreeFlags &
          (Placement | Update | ChildDeletion | ContentReset | Visibility)) !==
        NoFlags
      ) {
        const wasMutated = (finishedWork.flags & Update) !== NoFlags;

        const prevContextChanged = viewTransitionContextChanged;
        const prevCancelableChildren = viewTransitionCancelableChildren;
        viewTransitionContextChanged = false;
        viewTransitionCancelableChildren = null;
        recursivelyTraverseAfterMutationEffects(root, finishedWork, lanes);

        if (viewTransitionContextChanged) {
          finishedWork.flags |= Update;
        }

        const inViewport = measureUpdateViewTransition(current, finishedWork);

        if ((finishedWork.flags & Update) === NoFlags || !inViewport) {
          // If this boundary didn't update, then we may be able to cancel its children.
          // We bubble them up to the parent set to be determined later if we can cancel.
          // Similarly, if old and new state was outside the viewport, we can skip it
          // even if it did update.
          if (prevCancelableChildren === null) {
            // Bubbling up this whole set to the parent.
          } else {
            // Merge with parent set.
            // $FlowFixMe[method-unbinding]
            prevCancelableChildren.push.apply(
              prevCancelableChildren,
              viewTransitionCancelableChildren,
            );
            viewTransitionCancelableChildren = prevCancelableChildren;
          }
          // TODO: If this doesn't end up canceled, because a parent animates,
          // then we should probably issue an event since this instance is part of it.
        } else {
          const props: ViewTransitionProps = finishedWork.memoizedProps;
          scheduleViewTransitionEvent(
            finishedWork,
            wasMutated || viewTransitionContextChanged
              ? props.onUpdate
              : props.onLayout,
          );

          // If this boundary did update, we cannot cancel its children so those are dropped.
          viewTransitionCancelableChildren = prevCancelableChildren;
        }

        if ((finishedWork.flags & AffectedParentLayout) !== NoFlags) {
          // This boundary changed size in a way that may have caused its parent to
          // relayout. We need to bubble this information up to the parent.
          viewTransitionContextChanged = true;
        } else {
          // Otherwise, we restore it to whatever the parent had found so far.
          viewTransitionContextChanged = prevContextChanged;
        }
      }
      break;
    }
    default: {
      recursivelyTraverseAfterMutationEffects(root, finishedWork, lanes);
      break;
    }
  }
}

export function commitLayoutEffects(
  finishedWork: Fiber,
  root: FiberRoot,
  committedLanes: Lanes,
): void {
  inProgressLanes = committedLanes;
  inProgressRoot = root;

  resetComponentEffectTimers();

  const current = finishedWork.alternate;
  commitLayoutEffectOnFiber(root, current, finishedWork, committedLanes);

  inProgressLanes = null;
  inProgressRoot = null;
}

function recursivelyTraverseLayoutEffects(
  root: FiberRoot,
  parentFiber: Fiber,
  lanes: Lanes,
) {
  if (parentFiber.subtreeFlags & LayoutMask) {
    let child = parentFiber.child;
    while (child !== null) {
      const current = child.alternate;
      commitLayoutEffectOnFiber(root, current, child, lanes);
      child = child.sibling;
    }
  }
}

export function disappearLayoutEffects(finishedWork: Fiber) {
  const prevEffectStart = pushComponentEffectStart();
  const prevEffectErrors = pushComponentEffectErrors();
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case MemoComponent:
    case SimpleMemoComponent: {
      // TODO (Offscreen) Check: flags & LayoutStatic
      commitHookLayoutUnmountEffects(
        finishedWork,
        finishedWork.return,
        HookLayout,
      );
      recursivelyTraverseDisappearLayoutEffects(finishedWork);
      break;
    }
    case ClassComponent: {
      // TODO (Offscreen) Check: flags & RefStatic
      safelyDetachRef(finishedWork, finishedWork.return);

      const instance = finishedWork.stateNode;
      if (typeof instance.componentWillUnmount === 'function') {
        safelyCallComponentWillUnmount(
          finishedWork,
          finishedWork.return,
          instance,
        );
      }

      recursivelyTraverseDisappearLayoutEffects(finishedWork);
      break;
    }
    case HostSingleton: {
      if (supportsSingletons) {
        // TODO (Offscreen) Check: flags & RefStatic
        commitHostSingletonRelease(finishedWork);
      }
      // Expected fallthrough to HostComponent
    }
    case HostHoistable:
    case HostComponent: {
      // TODO (Offscreen) Check: flags & RefStatic
      safelyDetachRef(finishedWork, finishedWork.return);

      recursivelyTraverseDisappearLayoutEffects(finishedWork);
      break;
    }
    case OffscreenComponent: {
      // TODO (Offscreen) Check: flags & RefStatic
      safelyDetachRef(finishedWork, finishedWork.return);

      const isHidden = finishedWork.memoizedState !== null;
      if (isHidden) {
        // Nested Offscreen tree is already hidden. Don't disappear
        // its effects.
      } else {
        recursivelyTraverseDisappearLayoutEffects(finishedWork);
      }
      break;
    }
    case ViewTransitionComponent: {
      if (enableViewTransition) {
        safelyDetachRef(finishedWork, finishedWork.return);
      }
      // Fallthrough
    }
    default: {
      recursivelyTraverseDisappearLayoutEffects(finishedWork);
      break;
    }
  }

  if (
    enableProfilerTimer &&
    enableProfilerCommitHooks &&
    enableComponentPerformanceTrack &&
    (finishedWork.mode & ProfileMode) !== NoMode &&
    componentEffectStartTime >= 0 &&
    componentEffectEndTime >= 0 &&
    componentEffectDuration > 0.05
  ) {
    logComponentEffect(
      finishedWork,
      componentEffectStartTime,
      componentEffectEndTime,
      componentEffectDuration,
      componentEffectErrors,
    );
  }

  popComponentEffectStart(prevEffectStart);
  popComponentEffectErrors(prevEffectErrors);
}

function recursivelyTraverseDisappearLayoutEffects(parentFiber: Fiber) {
  // TODO (Offscreen) Check: subtreeflags & (RefStatic | LayoutStatic)
  let child = parentFiber.child;
  while (child !== null) {
    disappearLayoutEffects(child);
    child = child.sibling;
  }
}

export function reappearLayoutEffects(
  finishedRoot: FiberRoot,
  current: Fiber | null,
  finishedWork: Fiber,
  // This function visits both newly finished work and nodes that were re-used
  // from a previously committed tree. We cannot check non-static flags if the
  // node was reused.
  includeWorkInProgressEffects: boolean,
) {
  const prevEffectStart = pushComponentEffectStart();
  const prevEffectErrors = pushComponentEffectErrors();
  // Turn on layout effects in a tree that previously disappeared.
  const flags = finishedWork.flags;
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      recursivelyTraverseReappearLayoutEffects(
        finishedRoot,
        finishedWork,
        includeWorkInProgressEffects,
      );
      // TODO: Check flags & LayoutStatic
      commitHookLayoutEffects(finishedWork, HookLayout);
      break;
    }
    case ClassComponent: {
      recursivelyTraverseReappearLayoutEffects(
        finishedRoot,
        finishedWork,
        includeWorkInProgressEffects,
      );

      commitClassDidMount(finishedWork);

      commitClassHiddenCallbacks(finishedWork);

      // If this is newly finished work, check for setState callbacks
      if (includeWorkInProgressEffects && flags & Callback) {
        commitClassCallbacks(finishedWork);
      }

      // TODO: Check flags & RefStatic
      safelyAttachRef(finishedWork, finishedWork.return);
      break;
    }
    // Unlike commitLayoutEffectsOnFiber, we don't need to handle HostRoot
    // because this function only visits nodes that are inside an
    // Offscreen fiber.
    // case HostRoot: {
    //  ...
    // }
    case HostSingleton: {
      if (supportsSingletons) {
        // We acquire the singleton instance first so it has appropriate
        // styles before other layout effects run. This isn't perfect because
        // an early sibling of the singleton may have an effect that can
        // observe the singleton before it is acquired.
        // @TODO move this to the mutation phase. The reason it isn't there yet
        // is it seemingly requires an extra traversal because we need to move the
        // disappear effect into a phase before the appear phase
        commitHostSingletonAcquisition(finishedWork);
        // We fall through to the HostComponent case below.
      }
      // Fallthrough
    }
    case HostHoistable:
    case HostComponent: {
      recursivelyTraverseReappearLayoutEffects(
        finishedRoot,
        finishedWork,
        includeWorkInProgressEffects,
      );

      // Renderers may schedule work to be done after host components are mounted
      // (eg DOM renderer may schedule auto-focus for inputs and form controls).
      // These effects should only be committed when components are first mounted,
      // aka when there is no current/alternate.
      if (includeWorkInProgressEffects && current === null && flags & Update) {
        commitHostMount(finishedWork);
      }

      // TODO: Check flags & Ref
      safelyAttachRef(finishedWork, finishedWork.return);
      break;
    }
    case Profiler: {
      // TODO: Figure out how Profiler updates should work with Offscreen
      if (includeWorkInProgressEffects && flags & Update) {
        const prevEffectDuration = pushNestedEffectDurations();

        recursivelyTraverseReappearLayoutEffects(
          finishedRoot,
          finishedWork,
          includeWorkInProgressEffects,
        );

        const profilerInstance = finishedWork.stateNode;

        if (enableProfilerTimer && enableProfilerCommitHooks) {
          // Propagate layout effect durations to the next nearest Profiler ancestor.
          // Do not reset these values until the next render so DevTools has a chance to read them first.
          profilerInstance.effectDuration +=
            bubbleNestedEffectDurations(prevEffectDuration);
        }

        commitProfilerUpdate(
          finishedWork,
          current,
          commitStartTime,
          profilerInstance.effectDuration,
        );
      } else {
        recursivelyTraverseReappearLayoutEffects(
          finishedRoot,
          finishedWork,
          includeWorkInProgressEffects,
        );
      }
      break;
    }
    case SuspenseComponent: {
      recursivelyTraverseReappearLayoutEffects(
        finishedRoot,
        finishedWork,
        includeWorkInProgressEffects,
      );

      if (includeWorkInProgressEffects && flags & Update) {
        // TODO: Delete this feature.
        commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
      }
      break;
    }
    case OffscreenComponent: {
      const offscreenState: OffscreenState = finishedWork.memoizedState;
      const isHidden = offscreenState !== null;
      if (isHidden) {
        // Nested Offscreen tree is still hidden. Don't re-appear its effects.
      } else {
        recursivelyTraverseReappearLayoutEffects(
          finishedRoot,
          finishedWork,
          includeWorkInProgressEffects,
        );
      }
      // TODO: Check flags & Ref
      safelyAttachRef(finishedWork, finishedWork.return);
      break;
    }
    case ViewTransitionComponent: {
      if (enableViewTransition) {
        recursivelyTraverseReappearLayoutEffects(
          finishedRoot,
          finishedWork,
          includeWorkInProgressEffects,
        );
        safelyAttachRef(finishedWork, finishedWork.return);
        break;
      }
      // Fallthrough
    }
    default: {
      recursivelyTraverseReappearLayoutEffects(
        finishedRoot,
        finishedWork,
        includeWorkInProgressEffects,
      );
      break;
    }
  }

  if (
    enableProfilerTimer &&
    enableProfilerCommitHooks &&
    enableComponentPerformanceTrack &&
    (finishedWork.mode & ProfileMode) !== NoMode &&
    componentEffectStartTime >= 0 &&
    componentEffectEndTime >= 0 &&
    componentEffectDuration > 0.05
  ) {
    logComponentEffect(
      finishedWork,
      componentEffectStartTime,
      componentEffectEndTime,
      componentEffectDuration,
      componentEffectErrors,
    );
  }

  popComponentEffectStart(prevEffectStart);
  popComponentEffectErrors(prevEffectErrors);
}

function recursivelyTraverseReappearLayoutEffects(
  finishedRoot: FiberRoot,
  parentFiber: Fiber,
  includeWorkInProgressEffects: boolean,
) {
  // This function visits both newly finished work and nodes that were re-used
  // from a previously committed tree. We cannot check non-static flags if the
  // node was reused.
  const childShouldIncludeWorkInProgressEffects =
    includeWorkInProgressEffects &&
    (parentFiber.subtreeFlags & LayoutMask) !== NoFlags;

  // TODO (Offscreen) Check: flags & (RefStatic | LayoutStatic)
  let child = parentFiber.child;
  while (child !== null) {
    const current = child.alternate;
    reappearLayoutEffects(
      finishedRoot,
      current,
      child,
      childShouldIncludeWorkInProgressEffects,
    );
    child = child.sibling;
  }
}

function commitOffscreenPassiveMountEffects(
  current: Fiber | null,
  finishedWork: Fiber,
  instance: OffscreenInstance,
) {
  let previousCache: Cache | null = null;
  if (
    current !== null &&
    current.memoizedState !== null &&
    current.memoizedState.cachePool !== null
  ) {
    previousCache = current.memoizedState.cachePool.pool;
  }
  let nextCache: Cache | null = null;
  if (
    finishedWork.memoizedState !== null &&
    finishedWork.memoizedState.cachePool !== null
  ) {
    nextCache = finishedWork.memoizedState.cachePool.pool;
  }
  // Retain/release the cache used for pending (suspended) nodes.
  // Note that this is only reached in the non-suspended/visible case:
  // when the content is suspended/hidden, the retain/release occurs
  // via the parent Suspense component (see case above).
  if (nextCache !== previousCache) {
    if (nextCache != null) {
      retainCache(nextCache);
    }
    if (previousCache != null) {
      releaseCache(previousCache);
    }
  }

  if (enableTransitionTracing) {
    // TODO: Pre-rendering should not be counted as part of a transition. We
    // may add separate logs for pre-rendering, but it's not part of the
    // primary metrics.
    const offscreenState: OffscreenState = finishedWork.memoizedState;
    const queue: OffscreenQueue | null = (finishedWork.updateQueue: any);

    const isHidden = offscreenState !== null;
    if (queue !== null) {
      if (isHidden) {
        const transitions = queue.transitions;
        if (transitions !== null) {
          transitions.forEach(transition => {
            // Add all the transitions saved in the update queue during
            // the render phase (ie the transitions associated with this boundary)
            // into the transitions set.
            if (instance._transitions === null) {
              instance._transitions = new Set();
            }
            instance._transitions.add(transition);
          });
        }

        const markerInstances = queue.markerInstances;
        if (markerInstances !== null) {
          markerInstances.forEach(markerInstance => {
            const markerTransitions = markerInstance.transitions;
            // There should only be a few tracing marker transitions because
            // they should be only associated with the transition that
            // caused them
            if (markerTransitions !== null) {
              markerTransitions.forEach(transition => {
                if (instance._transitions === null) {
                  instance._transitions = new Set();
                } else if (instance._transitions.has(transition)) {
                  if (markerInstance.pendingBoundaries === null) {
                    markerInstance.pendingBoundaries = new Map();
                  }
                  if (instance._pendingMarkers === null) {
                    instance._pendingMarkers = new Set();
                  }

                  instance._pendingMarkers.add(markerInstance);
                }
              });
            }
          });
        }
      }

      finishedWork.updateQueue = null;
    }

    commitTransitionProgress(finishedWork);

    // TODO: Refactor this into an if/else branch
    if (!isHidden) {
      instance._transitions = null;
      instance._pendingMarkers = null;
    }
  }
}

function commitCachePassiveMountEffect(
  current: Fiber | null,
  finishedWork: Fiber,
) {
  let previousCache: Cache | null = null;
  if (finishedWork.alternate !== null) {
    previousCache = finishedWork.alternate.memoizedState.cache;
  }
  const nextCache = finishedWork.memoizedState.cache;
  // Retain/release the cache. In theory the cache component
  // could be "borrowing" a cache instance owned by some parent,
  // in which case we could avoid retaining/releasing. But it
  // is non-trivial to determine when that is the case, so we
  // always retain/release.
  if (nextCache !== previousCache) {
    retainCache(nextCache);
    if (previousCache != null) {
      releaseCache(previousCache);
    }
  }
}

function commitTracingMarkerPassiveMountEffect(finishedWork: Fiber) {
  // Get the transitions that were initiatized during the render
  // and add a start transition callback for each of them
  // We will only call this on initial mount of the tracing marker
  // only if there are no suspense children
  const instance = finishedWork.stateNode;
  if (instance.transitions !== null && instance.pendingBoundaries === null) {
    addMarkerCompleteCallbackToPendingTransition(
      finishedWork.memoizedProps.name,
      instance.transitions,
    );
    instance.transitions = null;
    instance.pendingBoundaries = null;
    instance.aborts = null;
    instance.name = null;
  }
}

export function commitPassiveMountEffects(
  root: FiberRoot,
  finishedWork: Fiber,
  committedLanes: Lanes,
  committedTransitions: Array<Transition> | null,
  renderEndTime: number, // Profiling-only
): void {
  resetComponentEffectTimers();

  commitPassiveMountOnFiber(
    root,
    finishedWork,
    committedLanes,
    committedTransitions,
    enableProfilerTimer && enableComponentPerformanceTrack ? renderEndTime : 0,
  );
}

function recursivelyTraversePassiveMountEffects(
  root: FiberRoot,
  parentFiber: Fiber,
  committedLanes: Lanes,
  committedTransitions: Array<Transition> | null,
  endTime: number, // Profiling-only. The start time of the next Fiber or root completion.
) {
  const isViewTransitionEligible =
    enableViewTransition &&
    includesOnlyViewTransitionEligibleLanes(committedLanes);
  // TODO: We could optimize this by marking these with the Passive subtree flag in the render phase.
  const subtreeMask = isViewTransitionEligible
    ? PassiveTransitionMask
    : PassiveMask;
  if (
    parentFiber.subtreeFlags & subtreeMask ||
    // If this subtree rendered with profiling this commit, we need to visit it to log it.
    (enableProfilerTimer &&
      enableComponentPerformanceTrack &&
      parentFiber.actualDuration !== 0 &&
      (parentFiber.alternate === null ||
        parentFiber.alternate.child !== parentFiber.child))
  ) {
    let child = parentFiber.child;
    while (child !== null) {
      if (enableProfilerTimer && enableComponentPerformanceTrack) {
        const nextSibling = child.sibling;
        commitPassiveMountOnFiber(
          root,
          child,
          committedLanes,
          committedTransitions,
          nextSibling !== null
            ? ((nextSibling.actualStartTime: any): number)
            : endTime,
        );
        child = nextSibling;
      } else {
        commitPassiveMountOnFiber(
          root,
          child,
          committedLanes,
          committedTransitions,
          0,
        );
        child = child.sibling;
      }
    }
  } else if (isViewTransitionEligible) {
    // We are inside an updated subtree. Any mutations that affected the
    // parent HostInstance's layout or set of children (such as reorders)
    // might have also affected the positioning or size of the inner
    // ViewTransitions. Therefore we need to restore those too.
    restoreNestedViewTransitions(parentFiber);
  }
}

let inHydratedSubtree = false;

function commitPassiveMountOnFiber(
  finishedRoot: FiberRoot,
  finishedWork: Fiber,
  committedLanes: Lanes,
  committedTransitions: Array<Transition> | null,
  endTime: number, // Profiling-only. The start time of the next Fiber or root completion.
): void {
  const prevEffectStart = pushComponentEffectStart();
  const prevEffectErrors = pushComponentEffectErrors();

  // If this component rendered in Profiling mode (DEV or in Profiler component) then log its
  // render time. We do this after the fact in the passive effect to avoid the overhead of this
  // getting in the way of the render characteristics and avoid the overhead of unwinding
  // uncommitted renders.
  if (
    enableProfilerTimer &&
    enableComponentPerformanceTrack &&
    (finishedWork.mode & ProfileMode) !== NoMode &&
    ((finishedWork.actualStartTime: any): number) > 0 &&
    (finishedWork.flags & PerformedWork) !== NoFlags
  ) {
    logComponentRender(
      finishedWork,
      ((finishedWork.actualStartTime: any): number),
      endTime,
      inHydratedSubtree,
    );
  }

  const isViewTransitionEligible = enableViewTransition
    ? includesOnlyViewTransitionEligibleLanes(committedLanes)
    : false;

  if (
    isViewTransitionEligible &&
    finishedWork.alternate === null &&
    // We can't use the Placement flag here because it gets reset earlier. Instead,
    // we check if this is the root of the insertion by checking if the parent
    // was previous existing.
    finishedWork.return !== null &&
    finishedWork.return.alternate !== null
  ) {
    // This was a new mount. This means we could've triggered an enter animation on
    // the content. Restore the view transitions if there were any assigned in the
    // snapshot phase.
    restoreEnterViewTransitions(finishedWork);
  }

  // When updating this function, also update reconnectPassiveEffects, which does
  // most of the same things when an offscreen tree goes from hidden -> visible,
  // or when toggling effects inside a hidden tree.
  const flags = finishedWork.flags;
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      // If this component rendered in Profiling mode (DEV or in Profiler component) then log its
      // render time. We do this after the fact in the passive effect to avoid the overhead of this
      // getting in the way of the render characteristics and avoid the overhead of unwinding
      // uncommitted renders.
      if (
        enableProfilerTimer &&
        enableComponentPerformanceTrack &&
        (finishedWork.mode & ProfileMode) !== NoMode &&
        ((finishedWork.actualStartTime: any): number) > 0 &&
        (finishedWork.flags & PerformedWork) !== NoFlags
      ) {
        logComponentRender(
          finishedWork,
          ((finishedWork.actualStartTime: any): number),
          endTime,
          inHydratedSubtree,
        );
      }

      recursivelyTraversePassiveMountEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        endTime,
      );
      if (flags & Passive) {
        commitHookPassiveMountEffects(
          finishedWork,
          HookPassive | HookHasEffect,
        );
      }
      break;
    }
    case ClassComponent: {
      // If this component rendered in Profiling mode (DEV or in Profiler component) then log its
      // render time. We do this after the fact in the passive effect to avoid the overhead of this
      // getting in the way of the render characteristics and avoid the overhead of unwinding
      // uncommitted renders.
      if (
        enableProfilerTimer &&
        enableComponentPerformanceTrack &&
        (finishedWork.mode & ProfileMode) !== NoMode &&
        ((finishedWork.actualStartTime: any): number) > 0
      ) {
        if ((finishedWork.flags & DidCapture) !== NoFlags) {
          logComponentErrored(
            finishedWork,
            ((finishedWork.actualStartTime: any): number),
            endTime,
            // TODO: The captured values are all hidden inside the updater/callback closures so
            // we can't get to the errors but they're there so we should be able to log them.
            [],
          );
        } else if ((finishedWork.flags & PerformedWork) !== NoFlags) {
          logComponentRender(
            finishedWork,
            ((finishedWork.actualStartTime: any): number),
            endTime,
            inHydratedSubtree,
          );
        }
      }

      recursivelyTraversePassiveMountEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        endTime,
      );
      break;
    }
    case HostRoot: {
      const prevEffectDuration = pushNestedEffectDurations();

      const wasInHydratedSubtree = inHydratedSubtree;
      if (enableProfilerTimer && enableComponentPerformanceTrack) {
        // Detect if this was a hydration commit by look at if the previous state was
        // dehydrated and this wasn't a forced client render.
        inHydratedSubtree =
          finishedWork.alternate !== null &&
          (finishedWork.alternate.memoizedState: RootState).isDehydrated &&
          (finishedWork.flags & ForceClientRender) === NoFlags;
      }

      recursivelyTraversePassiveMountEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        endTime,
      );

      if (enableProfilerTimer && enableComponentPerformanceTrack) {
        inHydratedSubtree = wasInHydratedSubtree;
      }

      if (isViewTransitionEligible) {
        if (supportsMutation) {
          restoreRootViewTransitionName(finishedRoot.containerInfo);
        }
      }

      if (flags & Passive) {
        let previousCache: Cache | null = null;
        if (finishedWork.alternate !== null) {
          previousCache = finishedWork.alternate.memoizedState.cache;
        }
        const nextCache = finishedWork.memoizedState.cache;
        // Retain/release the root cache.
        // Note that on initial mount, previousCache and nextCache will be the same
        // and this retain won't occur. To counter this, we instead retain the HostRoot's
        // initial cache when creating the root itself (see createFiberRoot() in
        // ReactFiberRoot.js). Subsequent updates that change the cache are reflected
        // here, such that previous/next caches are retained correctly.
        if (nextCache !== previousCache) {
          retainCache(nextCache);
          if (previousCache != null) {
            releaseCache(previousCache);
          }
        }

        if (enableTransitionTracing) {
          // Get the transitions that were initiatized during the render
          // and add a start transition callback for each of them
          const root: FiberRoot = finishedWork.stateNode;
          const incompleteTransitions = root.incompleteTransitions;
          // Initial render
          if (committedTransitions !== null) {
            committedTransitions.forEach(transition => {
              addTransitionStartCallbackToPendingTransition(transition);
            });

            clearTransitionsForLanes(finishedRoot, committedLanes);
          }

          incompleteTransitions.forEach((markerInstance, transition) => {
            const pendingBoundaries = markerInstance.pendingBoundaries;
            if (pendingBoundaries === null || pendingBoundaries.size === 0) {
              if (markerInstance.aborts === null) {
                addTransitionCompleteCallbackToPendingTransition(transition);
              }
              incompleteTransitions.delete(transition);
            }
          });

          clearTransitionsForLanes(finishedRoot, committedLanes);
        }
      }
      if (enableProfilerTimer && enableProfilerCommitHooks) {
        finishedRoot.passiveEffectDuration +=
          popNestedEffectDurations(prevEffectDuration);
      }
      break;
    }
    case Profiler: {
      // Only Profilers with work in their subtree will have a Passive effect scheduled.
      if (flags & Passive) {
        const prevEffectDuration = pushNestedEffectDurations();

        recursivelyTraversePassiveMountEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
          committedTransitions,
          endTime,
        );

        const profilerInstance = finishedWork.stateNode;

        if (enableProfilerTimer && enableProfilerCommitHooks) {
          // Bubble times to the next nearest ancestor Profiler.
          // After we process that Profiler, we'll bubble further up.
          profilerInstance.passiveEffectDuration +=
            bubbleNestedEffectDurations(prevEffectDuration);
        }

        commitProfilerPostCommit(
          finishedWork,
          finishedWork.alternate,
          // This value will still reflect the previous commit phase.
          // It does not get reset until the start of the next commit phase.
          commitStartTime,
          profilerInstance.passiveEffectDuration,
        );
      } else {
        recursivelyTraversePassiveMountEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
          committedTransitions,
          endTime,
        );
      }
      break;
    }
    case SuspenseComponent: {
      const wasInHydratedSubtree = inHydratedSubtree;
      if (enableProfilerTimer && enableComponentPerformanceTrack) {
        const prevState: SuspenseState | null =
          finishedWork.alternate !== null
            ? finishedWork.alternate.memoizedState
            : null;
        const nextState: SuspenseState | null = finishedWork.memoizedState;
        if (
          prevState !== null &&
          prevState.dehydrated !== null &&
          (nextState === null || nextState.dehydrated === null)
        ) {
          // This was dehydrated but is no longer dehydrated. We may have now either hydrated it
          // or client rendered it.
          const deletions = finishedWork.deletions;
          if (
            deletions !== null &&
            deletions.length > 0 &&
            deletions[0].tag === DehydratedFragment
          ) {
            // This was an abandoned hydration that deleted the dehydrated fragment. That means we
            // are not hydrating this Suspense boundary.
            inHydratedSubtree = false;
            const hydrationErrors = prevState.hydrationErrors;
            // If there were no hydration errors, that suggests that this was an intentional client
            // rendered boundary. Such as postpone.
            if (hydrationErrors !== null) {
              const startTime: number = (finishedWork.actualStartTime: any);
              logComponentErrored(
                finishedWork,
                startTime,
                endTime,
                hydrationErrors,
              );
            }
          } else {
            // If any children committed they were hydrated.
            inHydratedSubtree = true;
          }
        } else {
          inHydratedSubtree = false;
        }
      }

      recursivelyTraversePassiveMountEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        endTime,
      );

      if (enableProfilerTimer && enableComponentPerformanceTrack) {
        inHydratedSubtree = wasInHydratedSubtree;
      }
      break;
    }
    case LegacyHiddenComponent: {
      if (enableLegacyHidden) {
        recursivelyTraversePassiveMountEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
          committedTransitions,
          endTime,
        );

        if (flags & Passive) {
          const current = finishedWork.alternate;
          const instance: OffscreenInstance = finishedWork.stateNode;
          commitOffscreenPassiveMountEffects(current, finishedWork, instance);
        }
      }
      break;
    }
    case OffscreenComponent: {
      // TODO: Pass `current` as argument to this function
      const instance: OffscreenInstance = finishedWork.stateNode;
      const current = finishedWork.alternate;
      const nextState: OffscreenState | null = finishedWork.memoizedState;

      const isHidden = nextState !== null;

      if (isHidden) {
        if (
          isViewTransitionEligible &&
          current !== null &&
          current.memoizedState === null
        ) {
          // Content is now hidden but wasn't before. This means we could've
          // triggered an exit animation on the content. Restore the view
          // transitions if there were any assigned in the snapshot phase.
          restoreExitViewTransitions(current);
        }
        if (instance._visibility & OffscreenPassiveEffectsConnected) {
          // The effects are currently connected. Update them.
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions,
            endTime,
          );
        } else {
          if (disableLegacyMode || finishedWork.mode & ConcurrentMode) {
            // The effects are currently disconnected. Since the tree is hidden,
            // don't connect them. This also applies to the initial render.
            // "Atomic" effects are ones that need to fire on every commit,
            // even during pre-rendering. An example is updating the reference
            // count on cache instances.
            recursivelyTraverseAtomicPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              endTime,
            );
          } else {
            // Legacy Mode: Fire the effects even if the tree is hidden.
            instance._visibility |= OffscreenPassiveEffectsConnected;
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              endTime,
            );
          }
        }
      } else {
        // Tree is visible
        if (
          isViewTransitionEligible &&
          current !== null &&
          current.memoizedState !== null
        ) {
          // Content is now visible but wasn't before. This means we could've
          // triggered an enter animation on the content. Restore the view
          // transitions if there were any assigned in the snapshot phase.
          restoreEnterViewTransitions(finishedWork);
        }
        if (instance._visibility & OffscreenPassiveEffectsConnected) {
          // The effects are currently connected. Update them.
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions,
            endTime,
          );
        } else {
          // The effects are currently disconnected. Reconnect them, while also
          // firing effects inside newly mounted trees. This also applies to
          // the initial render.
          instance._visibility |= OffscreenPassiveEffectsConnected;

          const includeWorkInProgressEffects =
            (finishedWork.subtreeFlags & PassiveMask) !== NoFlags;
          recursivelyTraverseReconnectPassiveEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions,
            includeWorkInProgressEffects,
            endTime,
          );
        }
      }

      if (flags & Passive) {
        commitOffscreenPassiveMountEffects(current, finishedWork, instance);
      }
      break;
    }
    case CacheComponent: {
      recursivelyTraversePassiveMountEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        endTime,
      );
      if (flags & Passive) {
        // TODO: Pass `current` as argument to this function
        const current = finishedWork.alternate;
        commitCachePassiveMountEffect(current, finishedWork);
      }
      break;
    }
    case ViewTransitionComponent: {
      if (enableViewTransition) {
        if (isViewTransitionEligible) {
          const current = finishedWork.alternate;
          if (current === null) {
            // This is a new mount. We should have handled this as part of the
            // Placement effect or it is deeper inside a entering transition.
          } else if (
            (finishedWork.subtreeFlags &
              (Placement |
                Update |
                ChildDeletion |
                ContentReset |
                Visibility)) !==
            NoFlags
          ) {
            // Something mutated within this subtree. This might have caused
            // something to cross-fade if we didn't already cancel it.
            // If not, restore it.
            restoreUpdateViewTransition(current, finishedWork);
          }
        }
        recursivelyTraversePassiveMountEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
          committedTransitions,
          endTime,
        );
        break;
      }
      // Fallthrough
    }
    case TracingMarkerComponent: {
      if (enableTransitionTracing) {
        recursivelyTraversePassiveMountEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
          committedTransitions,
          endTime,
        );
        if (flags & Passive) {
          commitTracingMarkerPassiveMountEffect(finishedWork);
        }
        break;
      }
      // Intentional fallthrough to next branch
    }
    default: {
      recursivelyTraversePassiveMountEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        endTime,
      );
      break;
    }
  }

  if (
    enableProfilerTimer &&
    enableProfilerCommitHooks &&
    enableComponentPerformanceTrack &&
    (finishedWork.mode & ProfileMode) !== NoMode &&
    componentEffectStartTime >= 0 &&
    componentEffectEndTime >= 0 &&
    componentEffectDuration > 0.05
  ) {
    logComponentEffect(
      finishedWork,
      componentEffectStartTime,
      componentEffectEndTime,
      componentEffectDuration,
      componentEffectErrors,
    );
  }

  popComponentEffectStart(prevEffectStart);
  popComponentEffectErrors(prevEffectErrors);
}

function recursivelyTraverseReconnectPassiveEffects(
  finishedRoot: FiberRoot,
  parentFiber: Fiber,
  committedLanes: Lanes,
  committedTransitions: Array<Transition> | null,
  includeWorkInProgressEffects: boolean,
  endTime: number,
) {
  // This function visits both newly finished work and nodes that were re-used
  // from a previously committed tree. We cannot check non-static flags if the
  // node was reused.
  const childShouldIncludeWorkInProgressEffects =
    includeWorkInProgressEffects &&
    (parentFiber.subtreeFlags & PassiveMask) !== NoFlags;

  // TODO (Offscreen) Check: flags & (RefStatic | LayoutStatic)
  let child = parentFiber.child;
  while (child !== null) {
    if (enableProfilerTimer && enableComponentPerformanceTrack) {
      const nextSibling = child.sibling;
      reconnectPassiveEffects(
        finishedRoot,
        child,
        committedLanes,
        committedTransitions,
        childShouldIncludeWorkInProgressEffects,
        nextSibling !== null
          ? ((nextSibling.actualStartTime: any): number)
          : endTime,
      );
      child = nextSibling;
    } else {
      reconnectPassiveEffects(
        finishedRoot,
        child,
        committedLanes,
        committedTransitions,
        childShouldIncludeWorkInProgressEffects,
        endTime,
      );
      child = child.sibling;
    }
  }
}

export function reconnectPassiveEffects(
  finishedRoot: FiberRoot,
  finishedWork: Fiber,
  committedLanes: Lanes,
  committedTransitions: Array<Transition> | null,
  // This function visits both newly finished work and nodes that were re-used
  // from a previously committed tree. We cannot check non-static flags if the
  // node was reused.
  includeWorkInProgressEffects: boolean,
  endTime: number, // Profiling-only. The start time of the next Fiber or root completion.
) {
  const prevEffectStart = pushComponentEffectStart();
  const prevEffectErrors = pushComponentEffectErrors();
  // If this component rendered in Profiling mode (DEV or in Profiler component) then log its
  // render time. We do this after the fact in the passive effect to avoid the overhead of this
  // getting in the way of the render characteristics and avoid the overhead of unwinding
  // uncommitted renders.
  if (
    enableProfilerTimer &&
    enableComponentPerformanceTrack &&
    (finishedWork.mode & ProfileMode) !== NoMode &&
    ((finishedWork.actualStartTime: any): number) > 0 &&
    (finishedWork.flags & PerformedWork) !== NoFlags
  ) {
    logComponentRender(
      finishedWork,
      ((finishedWork.actualStartTime: any): number),
      endTime,
      inHydratedSubtree,
    );
  }

  const flags = finishedWork.flags;
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      recursivelyTraverseReconnectPassiveEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        includeWorkInProgressEffects,
        endTime,
      );
      // TODO: Check for PassiveStatic flag
      commitHookPassiveMountEffects(finishedWork, HookPassive);
      break;
    }
    // Unlike commitPassiveMountOnFiber, we don't need to handle HostRoot
    // because this function only visits nodes that are inside an
    // Offscreen fiber.
    // case HostRoot: {
    //  ...
    // }
    case LegacyHiddenComponent: {
      if (enableLegacyHidden) {
        recursivelyTraverseReconnectPassiveEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
          committedTransitions,
          includeWorkInProgressEffects,
          endTime,
        );

        if (includeWorkInProgressEffects && flags & Passive) {
          // TODO: Pass `current` as argument to this function
          const current: Fiber | null = finishedWork.alternate;
          const instance: OffscreenInstance = finishedWork.stateNode;
          commitOffscreenPassiveMountEffects(current, finishedWork, instance);
        }
      }
      break;
    }
    case OffscreenComponent: {
      const instance: OffscreenInstance = finishedWork.stateNode;
      const nextState: OffscreenState | null = finishedWork.memoizedState;

      const isHidden = nextState !== null;

      if (isHidden) {
        if (instance._visibility & OffscreenPassiveEffectsConnected) {
          // The effects are currently connected. Update them.
          recursivelyTraverseReconnectPassiveEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions,
            includeWorkInProgressEffects,
            endTime,
          );
        } else {
          if (disableLegacyMode || finishedWork.mode & ConcurrentMode) {
            // The effects are currently disconnected. Since the tree is hidden,
            // don't connect them. This also applies to the initial render.
            // "Atomic" effects are ones that need to fire on every commit,
            // even during pre-rendering. An example is updating the reference
            // count on cache instances.
            recursivelyTraverseAtomicPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              endTime,
            );
          } else {
            // Legacy Mode: Fire the effects even if the tree is hidden.
            instance._visibility |= OffscreenPassiveEffectsConnected;
            recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects,
              endTime,
            );
          }
        }
      } else {
        // Tree is visible

        // Since we're already inside a reconnecting tree, it doesn't matter
        // whether the effects are currently connected. In either case, we'll
        // continue traversing the tree and firing all the effects.
        //
        // We do need to set the "connected" flag on the instance, though.
        instance._visibility |= OffscreenPassiveEffectsConnected;

        recursivelyTraverseReconnectPassiveEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
          committedTransitions,
          includeWorkInProgressEffects,
          endTime,
        );
      }

      if (includeWorkInProgressEffects && flags & Passive) {
        // TODO: Pass `current` as argument to this function
        const current: Fiber | null = finishedWork.alternate;
        commitOffscreenPassiveMountEffects(current, finishedWork, instance);
      }
      break;
    }
    case CacheComponent: {
      recursivelyTraverseReconnectPassiveEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        includeWorkInProgressEffects,
        endTime,
      );
      if (includeWorkInProgressEffects && flags & Passive) {
        // TODO: Pass `current` as argument to this function
        const current = finishedWork.alternate;
        commitCachePassiveMountEffect(current, finishedWork);
      }
      break;
    }
    case TracingMarkerComponent: {
      if (enableTransitionTracing) {
        recursivelyTraverseReconnectPassiveEffects(
          finishedRoot,
          finishedWork,
          committedLanes,
          committedTransitions,
          includeWorkInProgressEffects,
          endTime,
        );
        if (includeWorkInProgressEffects && flags & Passive) {
          commitTracingMarkerPassiveMountEffect(finishedWork);
        }
        break;
      }
      // Intentional fallthrough to next branch
    }
    default: {
      recursivelyTraverseReconnectPassiveEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        includeWorkInProgressEffects,
        endTime,
      );
      break;
    }
  }

  if (
    enableProfilerTimer &&
    enableProfilerCommitHooks &&
    enableComponentPerformanceTrack &&
    (finishedWork.mode & ProfileMode) !== NoMode &&
    componentEffectStartTime >= 0 &&
    componentEffectEndTime >= 0 &&
    componentEffectDuration > 0.05
  ) {
    logComponentEffect(
      finishedWork,
      componentEffectStartTime,
      componentEffectEndTime,
      componentEffectDuration,
      componentEffectErrors,
    );
  }

  popComponentEffectStart(prevEffectStart);
  popComponentEffectErrors(prevEffectErrors);
}

function recursivelyTraverseAtomicPassiveEffects(
  finishedRoot: FiberRoot,
  parentFiber: Fiber,
  committedLanes: Lanes,
  committedTransitions: Array<Transition> | null,
  endTime: number, // Profiling-only. The start time of the next Fiber or root completion.
) {
  // "Atomic" effects are ones that need to fire on every commit, even during
  // pre-rendering. We call this function when traversing a hidden tree whose
  // regular effects are currently disconnected.
  // TODO: Add special flag for atomic effects
  if (parentFiber.subtreeFlags & PassiveMask) {
    let child = parentFiber.child;
    while (child !== null) {
      if (enableProfilerTimer && enableComponentPerformanceTrack) {
        const nextSibling = child.sibling;
        commitAtomicPassiveEffects(
          finishedRoot,
          child,
          committedLanes,
          committedTransitions,
          nextSibling !== null
            ? ((nextSibling.actualStartTime: any): number)
            : endTime,
        );
        child = nextSibling;
      } else {
        commitAtomicPassiveEffects(
          finishedRoot,
          child,
          committedLanes,
          committedTransitions,
          endTime,
        );
        child = child.sibling;
      }
    }
  }
}

function commitAtomicPassiveEffects(
  finishedRoot: FiberRoot,
  finishedWork: Fiber,
  committedLanes: Lanes,
  committedTransitions: Array<Transition> | null,
  endTime: number, // Profiling-only. The start time of the next Fiber or root completion.
) {
  // If this component rendered in Profiling mode (DEV or in Profiler component) then log its
  // render time. A render can happen even if the subtree is offscreen.
  if (
    enableProfilerTimer &&
    enableComponentPerformanceTrack &&
    (finishedWork.mode & ProfileMode) !== NoMode &&
    ((finishedWork.actualStartTime: any): number) > 0 &&
    (finishedWork.flags & PerformedWork) !== NoFlags
  ) {
    logComponentRender(
      finishedWork,
      ((finishedWork.actualStartTime: any): number),
      endTime,
      inHydratedSubtree,
    );
  }

  // "Atomic" effects are ones that need to fire on every commit, even during
  // pre-rendering. We call this function when traversing a hidden tree whose
  // regular effects are currently disconnected.
  const flags = finishedWork.flags;
  switch (finishedWork.tag) {
    case OffscreenComponent: {
      recursivelyTraverseAtomicPassiveEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        endTime,
      );
      if (flags & Passive) {
        // TODO: Pass `current` as argument to this function
        const current = finishedWork.alternate;
        const instance: OffscreenInstance = finishedWork.stateNode;
        commitOffscreenPassiveMountEffects(current, finishedWork, instance);
      }
      break;
    }
    case CacheComponent: {
      recursivelyTraverseAtomicPassiveEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        endTime,
      );
      if (flags & Passive) {
        // TODO: Pass `current` as argument to this function
        const current = finishedWork.alternate;
        commitCachePassiveMountEffect(current, finishedWork);
      }
      break;
    }
    default: {
      recursivelyTraverseAtomicPassiveEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
        endTime,
      );
      break;
    }
  }
}

export function commitPassiveUnmountEffects(finishedWork: Fiber): void {
  resetComponentEffectTimers();
  commitPassiveUnmountOnFiber(finishedWork);
}

// If we're inside a brand new tree, or a tree that was already visible, then we
// should only suspend host components that have a ShouldSuspendCommit flag.
// Components without it haven't changed since the last commit, so we can skip
// over those.
//
// When we enter a tree that is being revealed (going from hidden -> visible),
// we need to suspend _any_ component that _may_ suspend. Even if they're
// already in the "current" tree. Because their visibility has changed, the
// browser may not have prerendered them yet. So we check the MaySuspendCommit
// flag instead.
//
// Note that MaySuspendCommit and ShouldSuspendCommit also includes named
// ViewTransitions so that we know to also visit those to collect appearing
// pairs.
let suspenseyCommitFlag = ShouldSuspendCommit;
export function accumulateSuspenseyCommit(finishedWork: Fiber): void {
  appearingViewTransitions = null;
  accumulateSuspenseyCommitOnFiber(finishedWork);
}

function recursivelyAccumulateSuspenseyCommit(parentFiber: Fiber): void {
  if (parentFiber.subtreeFlags & suspenseyCommitFlag) {
    let child = parentFiber.child;
    while (child !== null) {
      accumulateSuspenseyCommitOnFiber(child);
      child = child.sibling;
    }
  }
}

function accumulateSuspenseyCommitOnFiber(fiber: Fiber) {
  switch (fiber.tag) {
    case HostHoistable: {
      recursivelyAccumulateSuspenseyCommit(fiber);
      if (fiber.flags & suspenseyCommitFlag) {
        if (fiber.memoizedState !== null) {
          suspendResource(
            // This should always be set by visiting HostRoot first
            (currentHoistableRoot: any),
            fiber.memoizedState,
            fiber.memoizedProps,
          );
        } else {
          const type = fiber.type;
          const props = fiber.memoizedProps;
          suspendInstance(type, props);
        }
      }
      break;
    }
    case HostComponent: {
      recursivelyAccumulateSuspenseyCommit(fiber);
      if (fiber.flags & suspenseyCommitFlag) {
        const type = fiber.type;
        const props = fiber.memoizedProps;
        suspendInstance(type, props);
      }
      break;
    }
    case HostRoot:
    case HostPortal: {
      if (supportsResources) {
        const previousHoistableRoot = currentHoistableRoot;
        const container: Container = fiber.stateNode.containerInfo;
        currentHoistableRoot = getHoistableRoot(container);

        recursivelyAccumulateSuspenseyCommit(fiber);
        currentHoistableRoot = previousHoistableRoot;
      } else {
        recursivelyAccumulateSuspenseyCommit(fiber);
      }
      break;
    }
    case OffscreenComponent: {
      const isHidden = (fiber.memoizedState: OffscreenState | null) !== null;
      if (isHidden) {
        // Don't suspend in hidden trees
      } else {
        const current = fiber.alternate;
        const wasHidden =
          current !== null &&
          (current.memoizedState: OffscreenState | null) !== null;
        if (wasHidden) {
          // This tree is being revealed. Visit all newly visible suspensey
          // instances, even if they're in the current tree.
          const prevFlags = suspenseyCommitFlag;
          suspenseyCommitFlag = MaySuspendCommit;
          recursivelyAccumulateSuspenseyCommit(fiber);
          suspenseyCommitFlag = prevFlags;
        } else {
          recursivelyAccumulateSuspenseyCommit(fiber);
        }
      }
      break;
    }
    case ViewTransitionComponent: {
      if (enableViewTransition) {
        if ((fiber.flags & suspenseyCommitFlag) !== NoFlags) {
          const props: ViewTransitionProps = fiber.memoizedProps;
          const name: ?string | 'auto' = props.name;
          if (name != null && name !== 'auto') {
            // This is a named ViewTransition being mounted or reappearing. Let's add it to
            // the map so we can match it with deletions later.
            if (appearingViewTransitions === null) {
              appearingViewTransitions = new Map();
            }
            // Reset the pair in case we didn't end up restoring the instance in previous commits.
            // This shouldn't really happen anymore but just in case. We could maybe add an invariant.
            const instance: ViewTransitionState = fiber.stateNode;
            instance.paired = null;
            appearingViewTransitions.set(name, instance);
          }
        }
        recursivelyAccumulateSuspenseyCommit(fiber);
        break;
      }
      // Fallthrough
    }
    default: {
      recursivelyAccumulateSuspenseyCommit(fiber);
    }
  }
}

function detachAlternateSiblings(parentFiber: Fiber) {
  // A fiber was deleted from this parent fiber, but it's still part of the
  // previous (alternate) parent fiber's list of children. Because children
  // are a linked list, an earlier sibling that's still alive will be
  // connected to the deleted fiber via its `alternate`:
  //
  //   live fiber --alternate--> previous live fiber --sibling--> deleted
  //   fiber
  //
  // We can't disconnect `alternate` on nodes that haven't been deleted yet,
  // but we can disconnect the `sibling` and `child` pointers.

  const previousFiber = parentFiber.alternate;
  if (previousFiber !== null) {
    let detachedChild = previousFiber.child;
    if (detachedChild !== null) {
      previousFiber.child = null;
      do {
        // $FlowFixMe[incompatible-use] found when upgrading Flow
        const detachedSibling = detachedChild.sibling;
        // $FlowFixMe[incompatible-use] found when upgrading Flow
        detachedChild.sibling = null;
        detachedChild = detachedSibling;
      } while (detachedChild !== null);
    }
  }
}

function recursivelyTraversePassiveUnmountEffects(parentFiber: Fiber): void {
  // Deletions effects can be scheduled on any fiber type. They need to happen
  // before the children effects have fired.
  const deletions = parentFiber.deletions;

  if ((parentFiber.flags & ChildDeletion) !== NoFlags) {
    if (deletions !== null) {
      for (let i = 0; i < deletions.length; i++) {
        const childToDelete = deletions[i];
        // TODO: Convert this to use recursion
        nextEffect = childToDelete;
        commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
          childToDelete,
          parentFiber,
        );
      }
    }
    detachAlternateSiblings(parentFiber);
  }

  // TODO: Split PassiveMask into separate masks for mount and unmount?
  if (parentFiber.subtreeFlags & PassiveMask) {
    let child = parentFiber.child;
    while (child !== null) {
      commitPassiveUnmountOnFiber(child);
      child = child.sibling;
    }
  }
}

function commitPassiveUnmountOnFiber(finishedWork: Fiber): void {
  const prevEffectStart = pushComponentEffectStart();
  const prevEffectErrors = pushComponentEffectErrors();
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      recursivelyTraversePassiveUnmountEffects(finishedWork);
      if (finishedWork.flags & Passive) {
        commitHookPassiveUnmountEffects(
          finishedWork,
          finishedWork.return,
          HookPassive | HookHasEffect,
        );
      }
      break;
    }
    case HostRoot: {
      const prevEffectDuration = pushNestedEffectDurations();
      recursivelyTraversePassiveUnmountEffects(finishedWork);
      if (enableProfilerTimer && enableProfilerCommitHooks) {
        const finishedRoot: FiberRoot = finishedWork.stateNode;
        finishedRoot.passiveEffectDuration +=
          popNestedEffectDurations(prevEffectDuration);
      }
      break;
    }
    case Profiler: {
      const prevEffectDuration = pushNestedEffectDurations();

      recursivelyTraversePassiveUnmountEffects(finishedWork);

      if (enableProfilerTimer && enableProfilerCommitHooks) {
        const profilerInstance = finishedWork.stateNode;
        // Propagate layout effect durations to the next nearest Profiler ancestor.
        // Do not reset these values until the next render so DevTools has a chance to read them first.
        profilerInstance.passiveEffectDuration +=
          bubbleNestedEffectDurations(prevEffectDuration);
      }
      break;
    }
    case OffscreenComponent: {
      const instance: OffscreenInstance = finishedWork.stateNode;
      const nextState: OffscreenState | null = finishedWork.memoizedState;

      const isHidden = nextState !== null;

      if (
        isHidden &&
        instance._visibility & OffscreenPassiveEffectsConnected &&
        // For backwards compatibility, don't unmount when a tree suspends. In
        // the future we may change this to unmount after a delay.
        (finishedWork.return === null ||
          finishedWork.return.tag !== SuspenseComponent)
      ) {
        // The effects are currently connected. Disconnect them.
        // TODO: Add option or heuristic to delay before disconnecting the
        // effects. Then if the tree reappears before the delay has elapsed, we
        // can skip toggling the effects entirely.
        instance._visibility &= ~OffscreenPassiveEffectsConnected;
        recursivelyTraverseDisconnectPassiveEffects(finishedWork);
      } else {
        recursivelyTraversePassiveUnmountEffects(finishedWork);
      }

      break;
    }
    default: {
      recursivelyTraversePassiveUnmountEffects(finishedWork);
      break;
    }
  }

  if (
    enableProfilerTimer &&
    enableProfilerCommitHooks &&
    enableComponentPerformanceTrack &&
    (finishedWork.mode & ProfileMode) !== NoMode &&
    componentEffectStartTime >= 0 &&
    componentEffectEndTime >= 0 &&
    componentEffectDuration > 0.05
  ) {
    logComponentEffect(
      finishedWork,
      componentEffectStartTime,
      componentEffectEndTime,
      componentEffectDuration,
      componentEffectErrors,
    );
  }

  popComponentEffectStart(prevEffectStart);
  popComponentEffectErrors(prevEffectErrors);
}

function recursivelyTraverseDisconnectPassiveEffects(parentFiber: Fiber): void {
  // Deletions effects can be scheduled on any fiber type. They need to happen
  // before the children effects have fired.
  const deletions = parentFiber.deletions;

  if ((parentFiber.flags & ChildDeletion) !== NoFlags) {
    if (deletions !== null) {
      for (let i = 0; i < deletions.length; i++) {
        const childToDelete = deletions[i];
        // TODO: Convert this to use recursion
        nextEffect = childToDelete;
        commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
          childToDelete,
          parentFiber,
        );
      }
    }
    detachAlternateSiblings(parentFiber);
  }

  // TODO: Check PassiveStatic flag
  let child = parentFiber.child;
  while (child !== null) {
    disconnectPassiveEffect(child);
    child = child.sibling;
  }
}

export function disconnectPassiveEffect(finishedWork: Fiber): void {
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      // TODO: Check PassiveStatic flag
      commitHookPassiveUnmountEffects(
        finishedWork,
        finishedWork.return,
        HookPassive,
      );
      // When disconnecting passive effects, we fire the effects in the same
      // order as during a deletiong: parent before child
      recursivelyTraverseDisconnectPassiveEffects(finishedWork);
      break;
    }
    case OffscreenComponent: {
      const instance: OffscreenInstance = finishedWork.stateNode;
      if (instance._visibility & OffscreenPassiveEffectsConnected) {
        instance._visibility &= ~OffscreenPassiveEffectsConnected;
        recursivelyTraverseDisconnectPassiveEffects(finishedWork);
      } else {
        // The effects are already disconnected.
      }
      break;
    }
    default: {
      recursivelyTraverseDisconnectPassiveEffects(finishedWork);
      break;
    }
  }
}

function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
  deletedSubtreeRoot: Fiber,
  nearestMountedAncestor: Fiber | null,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;

    // Deletion effects fire in parent -> child order
    // TODO: Check if fiber has a PassiveStatic flag
    commitPassiveUnmountInsideDeletedTreeOnFiber(fiber, nearestMountedAncestor);

    const child = fiber.child;
    // TODO: Only traverse subtree if it has a PassiveStatic flag.
    if (child !== null) {
      child.return = fiber;
      nextEffect = child;
    } else {
      commitPassiveUnmountEffectsInsideOfDeletedTree_complete(
        deletedSubtreeRoot,
      );
    }
  }
}

function commitPassiveUnmountEffectsInsideOfDeletedTree_complete(
  deletedSubtreeRoot: Fiber,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    const sibling = fiber.sibling;
    const returnFiber = fiber.return;

    // Recursively traverse the entire deleted tree and clean up fiber fields.
    // This is more aggressive than ideal, and the long term goal is to only
    // have to detach the deleted tree at the root.
    detachFiberAfterEffects(fiber);
    if (fiber === deletedSubtreeRoot) {
      nextEffect = null;
      return;
    }

    if (sibling !== null) {
      sibling.return = returnFiber;
      nextEffect = sibling;
      return;
    }

    nextEffect = returnFiber;
  }
}

function commitPassiveUnmountInsideDeletedTreeOnFiber(
  current: Fiber,
  nearestMountedAncestor: Fiber | null,
): void {
  const prevEffectStart = pushComponentEffectStart();
  const prevEffectErrors = pushComponentEffectErrors();
  switch (current.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      commitHookPassiveUnmountEffects(
        current,
        nearestMountedAncestor,
        HookPassive,
      );
      break;
    }
    // TODO: run passive unmount effects when unmounting a root.
    // Because passive unmount effects are not currently run,
    // the cache instance owned by the root will never be freed.
    // When effects are run, the cache should be freed here:
    // case HostRoot: {
    //   const cache = current.memoizedState.cache;
    //   releaseCache(cache);
    //   break;
    // }
    case LegacyHiddenComponent:
    case OffscreenComponent: {
      if (
        current.memoizedState !== null &&
        current.memoizedState.cachePool !== null
      ) {
        const cache: Cache = current.memoizedState.cachePool.pool;
        // Retain/release the cache used for pending (suspended) nodes.
        // Note that this is only reached in the non-suspended/visible case:
        // when the content is suspended/hidden, the retain/release occurs
        // via the parent Suspense component (see case above).
        if (cache != null) {
          retainCache(cache);
        }
      }
      break;
    }
    case SuspenseComponent: {
      if (enableTransitionTracing) {
        // We need to mark this fiber's parents as deleted
        const offscreenFiber: Fiber = (current.child: any);
        const instance: OffscreenInstance = offscreenFiber.stateNode;
        const transitions = instance._transitions;
        if (transitions !== null) {
          const abortReason = {
            reason: 'suspense',
            name: current.memoizedProps.unstable_name || null,
          };
          if (
            current.memoizedState === null ||
            current.memoizedState.dehydrated === null
          ) {
            abortParentMarkerTransitionsForDeletedFiber(
              offscreenFiber,
              abortReason,
              transitions,
              instance,
              true,
            );

            if (nearestMountedAncestor !== null) {
              abortParentMarkerTransitionsForDeletedFiber(
                nearestMountedAncestor,
                abortReason,
                transitions,
                instance,
                false,
              );
            }
          }
        }
      }
      break;
    }
    case CacheComponent: {
      const cache = current.memoizedState.cache;
      releaseCache(cache);
      break;
    }
    case TracingMarkerComponent: {
      if (enableTransitionTracing) {
        // We need to mark this fiber's parents as deleted
        const instance: TracingMarkerInstance = current.stateNode;
        const transitions = instance.transitions;
        if (transitions !== null) {
          const abortReason = {
            reason: 'marker',
            name: current.memoizedProps.name,
          };
          abortParentMarkerTransitionsForDeletedFiber(
            current,
            abortReason,
            transitions,
            null,
            true,
          );

          if (nearestMountedAncestor !== null) {
            abortParentMarkerTransitionsForDeletedFiber(
              nearestMountedAncestor,
              abortReason,
              transitions,
              null,
              false,
            );
          }
        }
      }
      break;
    }
  }

  if (
    enableProfilerTimer &&
    enableProfilerCommitHooks &&
    enableComponentPerformanceTrack &&
    (current.mode & ProfileMode) !== NoMode &&
    componentEffectStartTime >= 0 &&
    componentEffectEndTime >= 0 &&
    componentEffectDuration > 0.05
  ) {
    logComponentEffect(
      current,
      componentEffectStartTime,
      componentEffectEndTime,
      componentEffectDuration,
      componentEffectErrors,
    );
  }

  popComponentEffectStart(prevEffectStart);
  popComponentEffectErrors(prevEffectErrors);
}

export function invokeLayoutEffectMountInDEV(fiber: Fiber): void {
  if (__DEV__) {
    // We don't need to re-check StrictEffectsMode here.
    // This function is only called if that check has already passed.
    switch (fiber.tag) {
      case FunctionComponent:
      case ForwardRef:
      case SimpleMemoComponent: {
        commitHookEffectListMount(HookLayout | HookHasEffect, fiber);
        break;
      }
      case ClassComponent: {
        commitClassDidMount(fiber);
        break;
      }
    }
  }
}

export function invokePassiveEffectMountInDEV(fiber: Fiber): void {
  if (__DEV__) {
    // We don't need to re-check StrictEffectsMode here.
    // This function is only called if that check has already passed.
    switch (fiber.tag) {
      case FunctionComponent:
      case ForwardRef:
      case SimpleMemoComponent: {
        commitHookEffectListMount(HookPassive | HookHasEffect, fiber);
        break;
      }
    }
  }
}

export function invokeLayoutEffectUnmountInDEV(fiber: Fiber): void {
  if (__DEV__) {
    // We don't need to re-check StrictEffectsMode here.
    // This function is only called if that check has already passed.
    switch (fiber.tag) {
      case FunctionComponent:
      case ForwardRef:
      case SimpleMemoComponent: {
        commitHookEffectListUnmount(
          HookLayout | HookHasEffect,
          fiber,
          fiber.return,
        );
        break;
      }
      case ClassComponent: {
        const instance = fiber.stateNode;
        if (typeof instance.componentWillUnmount === 'function') {
          safelyCallComponentWillUnmount(fiber, fiber.return, instance);
        }
        break;
      }
    }
  }
}

export function invokePassiveEffectUnmountInDEV(fiber: Fiber): void {
  if (__DEV__) {
    // We don't need to re-check StrictEffectsMode here.
    // This function is only called if that check has already passed.
    switch (fiber.tag) {
      case FunctionComponent:
      case ForwardRef:
      case SimpleMemoComponent: {
        commitHookEffectListUnmount(
          HookPassive | HookHasEffect,
          fiber,
          fiber.return,
        );
      }
    }
  }
}
