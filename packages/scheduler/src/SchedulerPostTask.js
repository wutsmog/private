/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {PriorityLevel} from './SchedulerPriorities';

declare class TaskController {
  constructor(priority?: string): TaskController;
  signal: mixed;
  abort(): void;
}

type PostTaskPriorityLevel = 'user-blocking' | 'user-visible' | 'background';

type CallbackNode = {|
  _controller: TaskController,
|};

import {
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  IdlePriority,
} from './SchedulerPriorities';

export {
  ImmediatePriority as unstable_ImmediatePriority,
  UserBlockingPriority as unstable_UserBlockingPriority,
  NormalPriority as unstable_NormalPriority,
  IdlePriority as unstable_IdlePriority,
  LowPriority as unstable_LowPriority,
};

// Capture local references to native APIs, in case a polyfill overrides them.
const perf = window.performance;

// Use experimental Chrome Scheduler postTask API.
const scheduler = global.scheduler;

const getCurrentTime = perf.now.bind(perf);

export const unstable_now = getCurrentTime;

// Scheduler periodically yields in case there is other work on the main
// thread, like user events. By default, it yields multiple times per frame.
// It does not attempt to align with frame boundaries, since most tasks don't
// need to be frame aligned; for those that do, use requestAnimationFrame.
const yieldInterval = 5;
let deadline = 0;

let currentPriorityLevel_DEPRECATED = NormalPriority;

// `isInputPending` is not available. Since we have no way of knowing if
// there's pending input, always yield at the end of the frame.
export function unstable_shouldYield() {
  return getCurrentTime() >= deadline;
}

export function unstable_requestPaint() {
  // Since we yield every frame regardless, `requestPaint` has no effect.
}

type SchedulerCallback<T> = (
  didTimeout_DEPRECATED: boolean,
) =>
  | T
  // May return a continuation
  | SchedulerCallback<T>;

export function unstable_scheduleCallback<T>(
  priorityLevel: PriorityLevel,
  callback: SchedulerCallback<T>,
  options?: {delay?: number},
): CallbackNode {
  let postTaskPriority;
  switch (priorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
      postTaskPriority = 'user-blocking';
      break;
    case LowPriority:
    case NormalPriority:
      postTaskPriority = 'user-visible';
      break;
    case IdlePriority:
      postTaskPriority = 'background';
      break;
    default:
      postTaskPriority = 'user-visible';
      break;
  }

  const controller = new TaskController();
  const postTaskOptions = {
    priority: postTaskPriority,
    delay: typeof options === 'object' && options !== null ? options.delay : 0,
    signal: controller.signal,
  };

  const node = {
    _controller: controller,
  };

  scheduler
    .postTask(
      runTask.bind(null, priorityLevel, postTaskPriority, node, callback),
      postTaskOptions,
    )
    .catch(handlePostTaskError);

  return node;
}

function runTask<T>(
  priorityLevel: PriorityLevel,
  postTaskPriority: PostTaskPriorityLevel,
  node: CallbackNode,
  callback: SchedulerCallback<T>,
) {
  deadline = getCurrentTime() + yieldInterval;
  try {
    currentPriorityLevel_DEPRECATED = priorityLevel;
    const didTimeout_DEPRECATED = false;
    const result = callback(didTimeout_DEPRECATED);
    if (typeof result === 'function') {
      // Assume this is a continuation
      const continuation: SchedulerCallback<T> = (result: any);
      const continuationController = new TaskController();
      const continuationOptions = {
        priority: postTaskPriority,
        signal: continuationController.signal,
      };
      // Update the original callback node's controller, since even though we're
      // posting a new task, conceptually it's the same one.
      node._controller = continuationController;
      scheduler
        .postTask(
          runTask.bind(
            null,
            priorityLevel,
            postTaskPriority,
            node,
            continuation,
          ),
          continuationOptions,
        )
        .catch(handlePostTaskError);
    }
  } finally {
    currentPriorityLevel_DEPRECATED = NormalPriority;
  }
}

function handlePostTaskError(error) {
  // This error is either a user error thrown by a callback, or an AbortError
  // as a result of a cancellation.
  //
  // User errors trigger a global `error` event even if we don't rethrow them.
  // In fact, if we do rethrow them, they'll get reported to the console twice.
  // I'm not entirely sure the current `postTask` spec makes sense here. If I
  // catch a `postTask` call, it shouldn't trigger a global error.
  //
  // Abort errors are an implementation detail. We don't expose the
  // TaskController to the user, nor do we expose the promise that is returned
  // from `postTask`. So we shouldn't rethrow those, either, since there's no
  // way to handle them. (If we did return the promise to the user, then it
  // should be up to them to handle the AbortError.)
  //
  // In either case, we can suppress the error, barring changes to the spec
  // or the Scheduler API.
}

export function unstable_cancelCallback(node: CallbackNode) {
  const controller = node._controller;
  controller.abort();
}

export function unstable_runWithPriority<T>(
  priorityLevel: PriorityLevel,
  callback: () => T,
): T {
  const previousPriorityLevel = currentPriorityLevel_DEPRECATED;
  currentPriorityLevel_DEPRECATED = priorityLevel;
  try {
    return callback();
  } finally {
    currentPriorityLevel_DEPRECATED = previousPriorityLevel;
  }
}

export function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel_DEPRECATED;
}

export function unstable_next<T>(callback: () => T): T {
  let priorityLevel;
  switch (currentPriorityLevel_DEPRECATED) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
      // Shift down to normal priority
      priorityLevel = NormalPriority;
      break;
    default:
      // Anything lower than normal priority should remain at the current level.
      priorityLevel = currentPriorityLevel_DEPRECATED;
      break;
  }

  const previousPriorityLevel = currentPriorityLevel_DEPRECATED;
  currentPriorityLevel_DEPRECATED = priorityLevel;
  try {
    return callback();
  } finally {
    currentPriorityLevel_DEPRECATED = previousPriorityLevel;
  }
}

export function unstable_wrapCallback<T>(callback: () => T): () => T {
  const parentPriorityLevel = currentPriorityLevel_DEPRECATED;
  return () => {
    const previousPriorityLevel = currentPriorityLevel_DEPRECATED;
    currentPriorityLevel_DEPRECATED = parentPriorityLevel;
    try {
      return callback();
    } finally {
      currentPriorityLevel_DEPRECATED = previousPriorityLevel;
    }
  };
}

export function unstable_forceFrameRate() {}

export function unstable_pauseExecution() {}

export function unstable_continueExecution() {}

export function unstable_getFirstCallbackNode() {
  return null;
}

// Currently no profiling build
export const unstable_Profiling = null;
