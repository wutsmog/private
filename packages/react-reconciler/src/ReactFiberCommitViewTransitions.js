/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Instance, InstanceMeasurement, Props} from './ReactFiberConfig';
import type {Fiber} from './ReactInternalTypes';
import type {
  ViewTransitionProps,
  ViewTransitionState,
} from './ReactFiberViewTransitionComponent';

import {
  HostComponent,
  OffscreenComponent,
  ViewTransitionComponent,
} from './ReactWorkTags';
import {
  NoFlags,
  Update,
  ViewTransitionStatic,
  AffectedParentLayout,
  ViewTransitionNamedStatic,
} from './ReactFiberFlags';
import {
  supportsMutation,
  applyViewTransitionName,
  restoreViewTransitionName,
  measureInstance,
  hasInstanceChanged,
  hasInstanceAffectedParent,
  wasInstanceInViewport,
} from './ReactFiberConfig';
import {scheduleViewTransitionEvent} from './ReactFiberWorkLoop';
import {
  getViewTransitionName,
  getViewTransitionClassName,
} from './ReactFiberViewTransitionComponent';

export let shouldStartViewTransition: boolean = false;

export function resetShouldStartViewTransition(): void {
  shouldStartViewTransition = false;
}

// This tracks named ViewTransition components found in the accumulateSuspenseyCommit
// phase that might need to find deleted pairs in the beforeMutation phase.
let appearingViewTransitions: Map<string, ViewTransitionState> | null = null;

export function resetAppearingViewTransitions(): void {
  appearingViewTransitions = null;
}

export function trackAppearingViewTransition(
  name: string,
  state: ViewTransitionState,
): void {
  if (appearingViewTransitions === null) {
    appearingViewTransitions = new Map();
  }
  appearingViewTransitions.set(name, state);
}

// We can't cancel view transition children until we know that their parent also
// don't need to transition.
export let viewTransitionCancelableChildren: null | Array<
  Instance | string | Props,
> = null; // tupled array where each entry is [instance: Instance, oldName: string, props: Props]

export function setViewTransitionCancelableChildren(
  children: null | Array<Instance | string | Props>,
): void {
  viewTransitionCancelableChildren = children;
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

export function commitEnterViewTransitions(placement: Fiber): void {
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

export function commitExitViewTransitions(deletion: Fiber): void {
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

export function commitBeforeUpdateViewTransition(
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

export function commitNestedViewTransitions(changedParent: Fiber): void {
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

export function restoreEnterViewTransitions(placement: Fiber): void {
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

export function restoreExitViewTransitions(deletion: Fiber): void {
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

export function restoreUpdateViewTransition(
  current: Fiber,
  finishedWork: Fiber,
): void {
  finishedWork.memoizedState = null;
  restoreViewTransitionOnHostInstances(current.child, true);
  restoreViewTransitionOnHostInstances(finishedWork.child, true);
}

export function restoreNestedViewTransitions(changedParent: Fiber): void {
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

export function measureUpdateViewTransition(
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

export function measureNestedViewTransitions(changedParent: Fiber): void {
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
