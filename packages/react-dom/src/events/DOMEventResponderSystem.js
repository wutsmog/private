/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * @flow
 */

import {
  type EventSystemFlags,
  IS_PASSIVE,
  PASSIVE_NOT_SUPPORTED,
} from 'events/EventSystemFlags';
import type {AnyNativeEvent} from 'events/PluginModuleType';
import {
  EventComponent,
  EventTarget as EventTargetWorkTag,
  HostComponent,
} from 'shared/ReactWorkTags';
import type {
  ReactEventResponderEventType,
  ReactEventComponentInstance,
  ReactResponderContext,
  ReactResponderEvent,
  ReactResponderDispatchEventOptions,
} from 'shared/ReactTypes';
import type {DOMTopLevelEventType} from 'events/TopLevelEventTypes';
import {batchedUpdates, interactiveUpdates} from 'events/ReactGenericBatching';
import type {Fiber} from 'react-reconciler/src/ReactFiber';
import warning from 'shared/warning';
import {enableEventAPI} from 'shared/ReactFeatureFlags';
import {invokeGuardedCallbackAndCatchFirstError} from 'shared/ReactErrorUtils';

import {getClosestInstanceFromNode} from '../client/ReactDOMComponentTree';

export let listenToResponderEventTypesImpl;

export function setListenToResponderEventTypes(
  _listenToResponderEventTypesImpl: Function,
) {
  listenToResponderEventTypesImpl = _listenToResponderEventTypesImpl;
}

type EventObjectTypes = {|stopPropagation: true|} | $Shape<PartialEventObject>;

type EventQueue = {
  bubble: null | Array<EventObjectTypes>,
  capture: null | Array<EventObjectTypes>,
  discrete: boolean,
};

type PartialEventObject = {
  listener: ($Shape<PartialEventObject>) => void,
  target: Element | Document,
  type: string,
};

type ResponderTimeout = {|
  id: TimeoutID,
  timers: Map<Symbol, ResponderTimer>,
|};

type ResponderTimer = {|
  instance: ReactEventComponentInstance,
  func: () => void,
  id: Symbol,
|};

const activeTimeouts: Map<Symbol, ResponderTimeout> = new Map();
const rootEventTypesToEventComponentInstances: Map<
  DOMTopLevelEventType | string,
  Set<ReactEventComponentInstance>,
> = new Map();
const targetEventTypeCached: Map<
  Array<ReactEventResponderEventType>,
  Set<DOMTopLevelEventType>,
> = new Map();
const ownershipChangeListeners: Set<ReactEventComponentInstance> = new Set();

let currentTimers = new Map();
let currentOwner = null;
let currentInstance: ReactEventComponentInstance;
let currentEventQueue: EventQueue;

const eventResponderContext: ReactResponderContext = {
  dispatchEvent(
    possibleEventObject: Object,
    {capture, discrete}: ReactResponderDispatchEventOptions,
  ): void {
    const {listener, target, type} = possibleEventObject;

    if (listener == null || target == null || type == null) {
      throw new Error(
        'context.dispatchEvent: "listener", "target" and "type" fields on event object are required.',
      );
    }
    if (__DEV__) {
      possibleEventObject.preventDefault = () => {
        // Update this warning when we have a story around dealing with preventDefault
        warning(
          false,
          'preventDefault() is no longer available on event objects created from event responder modules.',
        );
      };
      possibleEventObject.stopPropagation = () => {
        // Update this warning when we have a story around dealing with stopPropgation
        warning(
          false,
          'stopPropagation() is no longer available on event objects created from event responder modules.',
        );
      };
    }
    const eventObject = ((possibleEventObject: any): $Shape<
      PartialEventObject,
    >);
    const events = getEventsFromEventQueue(capture);
    if (discrete) {
      currentEventQueue.discrete = true;
    }
    events.push(eventObject);
  },
  dispatchStopPropagation(capture?: boolean) {
    const events = getEventsFromEventQueue();
    events.push({stopPropagation: true});
  },
  isPositionWithinTouchHitTarget(doc: Document, x: number, y: number): boolean {
    // This isn't available in some environments (JSDOM)
    if (typeof doc.elementFromPoint !== 'function') {
      return false;
    }
    const target = doc.elementFromPoint(x, y);
    if (target === null) {
      return false;
    }
    const childFiber = getClosestInstanceFromNode(target);
    if (childFiber === null) {
      return false;
    }
    const parentFiber = childFiber.return;
    if (parentFiber !== null && parentFiber.tag === EventTargetWorkTag) {
      const parentNode = ((target.parentNode: any): Element);
      // TODO find another way to do this without using the
      // expensive getBoundingClientRect.
      const {left, top, right, bottom} = parentNode.getBoundingClientRect();
      // Check if the co-ords intersect with the target element's rect.
      if (x > left && y > top && x < right && y < bottom) {
        return false;
      }
      return true;
    }
    return false;
  },
  isTargetWithinEventComponent(target: Element | Document): boolean {
    if (target != null) {
      let fiber = getClosestInstanceFromNode(target);
      while (fiber !== null) {
        if (fiber.stateNode === currentInstance) {
          return true;
        }
        fiber = fiber.return;
      }
    }
    return false;
  },
  isTargetWithinElement(
    childTarget: Element | Document,
    parentTarget: Element | Document,
  ): boolean {
    const childFiber = getClosestInstanceFromNode(childTarget);
    const parentFiber = getClosestInstanceFromNode(parentTarget);

    let node = childFiber;
    while (node !== null) {
      if (node === parentFiber) {
        return true;
      }
      node = node.return;
    }
    return false;
  },
  addRootEventTypes(
    doc: Document,
    rootEventTypes: Array<ReactEventResponderEventType>,
  ): void {
    listenToResponderEventTypesImpl(rootEventTypes, doc);
    for (let i = 0; i < rootEventTypes.length; i++) {
      const rootEventType = rootEventTypes[i];
      const topLevelEventType =
        typeof rootEventType === 'string' ? rootEventType : rootEventType.name;
      let rootEventComponentInstances = rootEventTypesToEventComponentInstances.get(
        topLevelEventType,
      );
      if (rootEventComponentInstances === undefined) {
        rootEventComponentInstances = new Set();
        rootEventTypesToEventComponentInstances.set(
          topLevelEventType,
          rootEventComponentInstances,
        );
      }
      rootEventComponentInstances.add(currentInstance);
    }
  },
  removeRootEventTypes(
    rootEventTypes: Array<ReactEventResponderEventType>,
  ): void {
    for (let i = 0; i < rootEventTypes.length; i++) {
      const rootEventType = rootEventTypes[i];
      const topLevelEventType =
        typeof rootEventType === 'string' ? rootEventType : rootEventType.name;
      let rootEventComponents = rootEventTypesToEventComponentInstances.get(
        topLevelEventType,
      );
      if (rootEventComponents !== undefined) {
        rootEventComponents.delete(currentInstance);
      }
    }
  },
  hasOwnership(): boolean {
    return currentOwner === currentInstance;
  },
  requestOwnership(): boolean {
    if (currentOwner !== null) {
      return false;
    }
    currentOwner = currentInstance;
    triggerOwnershipListeners();
    return true;
  },
  releaseOwnership(): boolean {
    if (currentOwner !== currentInstance) {
      return false;
    }
    currentOwner = null;
    triggerOwnershipListeners();
    return false;
  },
  setTimeout(func: () => void, delay): Symbol {
    if (currentTimers === null) {
      currentTimers = new Map();
    }
    let timeout = currentTimers.get(delay);

    const timerId = Symbol();
    if (timeout === undefined) {
      const timers = new Map();
      const id = setTimeout(() => {
        processTimers(timers);
      }, delay);
      timeout = {
        id,
        timers,
      };
      currentTimers.set(delay, timeout);
    }
    timeout.timers.set(timerId, {
      instance: currentInstance,
      func,
      id: timerId,
    });
    activeTimeouts.set(timerId, timeout);
    return timerId;
  },
  clearTimeout(timerId: Symbol): void {
    const timeout = activeTimeouts.get(timerId);

    if (timeout !== undefined) {
      const timers = timeout.timers;
      timers.delete(timerId);
      if (timers.size === 0) {
        clearTimeout(timeout.id);
      }
    }
  },
  getEventTargetsFromTarget(
    target: Element | Document,
    queryType?: Symbol | number,
    queryKey?: string,
  ): Array<{
    node: Element,
    props: null | Object,
  }> {
    const eventTargetHostComponents = [];
    let node = getClosestInstanceFromNode(target);
    // We traverse up the fiber tree from the target fiber, to the
    // current event component fiber. Along the way, we check if
    // the fiber has any children that are event targets. If there
    // are, we query them (optionally) to ensure they match the
    // specified type and key. We then push the event target props
    // along with the associated parent host component of that event
    // target.
    while (node !== null) {
      if (node.stateNode === currentInstance) {
        break;
      }
      let child = node.child;

      while (child !== null) {
        if (
          child.tag === EventTargetWorkTag &&
          queryEventTarget(child, queryType, queryKey)
        ) {
          const props = child.stateNode.props;
          let parent = child.return;

          if (parent !== null) {
            if (parent.stateNode === currentInstance) {
              break;
            }
            if (parent.tag === HostComponent) {
              eventTargetHostComponents.push({
                node: parent.stateNode,
                props,
              });
              break;
            }
            parent = parent.return;
          }
          break;
        }
        child = child.sibling;
      }
      node = node.return;
    }
    return eventTargetHostComponents;
  },
};

function getEventsFromEventQueue(capture?: boolean): Array<EventObjectTypes> {
  let events;
  if (capture) {
    events = currentEventQueue.capture;
    if (events === null) {
      events = currentEventQueue.capture = [];
    }
  } else {
    events = currentEventQueue.bubble;
    if (events === null) {
      events = currentEventQueue.bubble = [];
    }
  }
  return events;
}

function processTimers(timers: Map<Symbol, ResponderTimer>): void {
  const previousEventQueue = currentEventQueue;
  const previousInstance = currentInstance;
  currentEventQueue = createEventQueue();

  try {
    const timersArr = Array.from(timers.values());
    for (let i = 0; i < timersArr.length; i++) {
      const {instance, func, id} = timersArr[i];
      currentInstance = instance;
      try {
        func();
      } finally {
        activeTimeouts.delete(id);
      }
    }
    batchedUpdates(processEventQueue, currentEventQueue);
  } finally {
    currentInstance = previousInstance;
    currentEventQueue = previousEventQueue;
    currentTimers = null;
  }
}

function queryEventTarget(
  child: Fiber,
  queryType: void | Symbol | number,
  queryKey: void | string,
): boolean {
  if (queryType !== undefined && child.type.type !== queryType) {
    return false;
  }
  if (queryKey !== undefined && child.key !== queryKey) {
    return false;
  }
  return true;
}

function createResponderEvent(
  topLevelType: string,
  nativeEvent: AnyNativeEvent,
  nativeEventTarget: Element | Document,
  eventSystemFlags: EventSystemFlags,
): ReactResponderEvent {
  return {
    nativeEvent: nativeEvent,
    target: nativeEventTarget,
    type: topLevelType,
    passive: (eventSystemFlags & IS_PASSIVE) !== 0,
    passiveSupported: (eventSystemFlags & PASSIVE_NOT_SUPPORTED) === 0,
  };
}

function createEventQueue(): EventQueue {
  return {
    bubble: null,
    capture: null,
    discrete: false,
  };
}

function processEvent(event: $Shape<PartialEventObject>): void {
  const type = event.type;
  const listener = event.listener;
  invokeGuardedCallbackAndCatchFirstError(type, listener, undefined, event);
}

function processEvents(
  bubble: null | Array<EventObjectTypes>,
  capture: null | Array<EventObjectTypes>,
): void {
  let i, length;

  if (capture !== null) {
    for (i = capture.length; i-- > 0; ) {
      const event = capture[i];
      if (event.stopPropagation === true) {
        return;
      }
      processEvent(((event: any): $Shape<PartialEventObject>));
    }
  }
  if (bubble !== null) {
    for (i = 0, length = bubble.length; i < length; ++i) {
      const event = bubble[i];
      if (event.stopPropagation === true) {
        return;
      }
      processEvent(((event: any): $Shape<PartialEventObject>));
    }
  }
}

export function processEventQueue(): void {
  const {bubble, capture, discrete} = currentEventQueue;

  if (discrete) {
    interactiveUpdates(() => {
      processEvents(bubble, capture);
    });
  } else {
    processEvents(bubble, capture);
  }
}

function getTargetEventTypes(
  eventTypes: Array<ReactEventResponderEventType>,
): Set<DOMTopLevelEventType> {
  let cachedSet = targetEventTypeCached.get(eventTypes);

  if (cachedSet === undefined) {
    cachedSet = new Set();
    for (let i = 0; i < eventTypes.length; i++) {
      const eventType = eventTypes[i];
      const topLevelEventType =
        typeof eventType === 'string' ? eventType : eventType.name;
      cachedSet.add(((topLevelEventType: any): DOMTopLevelEventType));
    }
    targetEventTypeCached.set(eventTypes, cachedSet);
  }
  return cachedSet;
}

function handleTopLevelType(
  topLevelType: DOMTopLevelEventType,
  responderEvent: ReactResponderEvent,
  eventComponentInstance: ReactEventComponentInstance,
  isRootLevelEvent: boolean,
): void {
  let {props, responder, state} = eventComponentInstance;
  if (!isRootLevelEvent) {
    // Validate the target event type exists on the responder
    const targetEventTypes = getTargetEventTypes(responder.targetEventTypes);
    if (!targetEventTypes.has(topLevelType)) {
      return;
    }
  }
  const previousInstance = currentInstance;
  currentInstance = eventComponentInstance;
  try {
    responder.onEvent(responderEvent, eventResponderContext, props, state);
  } finally {
    currentInstance = previousInstance;
  }
}

export function runResponderEventsInBatch(
  topLevelType: DOMTopLevelEventType,
  targetFiber: null | Fiber,
  nativeEvent: AnyNativeEvent,
  nativeEventTarget: EventTarget,
  eventSystemFlags: EventSystemFlags,
): void {
  if (enableEventAPI) {
    currentEventQueue = createEventQueue();
    const responderEvent = createResponderEvent(
      ((topLevelType: any): string),
      nativeEvent,
      ((nativeEventTarget: any): Element | Document),
      eventSystemFlags,
    );
    let node = targetFiber;
    // Traverse up the fiber tree till we find event component fibers.
    while (node !== null) {
      if (node.tag === EventComponent) {
        const eventComponentInstance = node.stateNode;
        handleTopLevelType(
          topLevelType,
          responderEvent,
          eventComponentInstance,
          false,
        );
      }
      node = node.return;
    }
    // Handle root level events
    const rootEventInstances = rootEventTypesToEventComponentInstances.get(
      topLevelType,
    );
    if (rootEventInstances !== undefined) {
      const rootEventComponentInstances = Array.from(rootEventInstances);

      for (let i = 0; i < rootEventComponentInstances.length; i++) {
        const rootEventComponentInstance = rootEventComponentInstances[i];
        handleTopLevelType(
          topLevelType,
          responderEvent,
          rootEventComponentInstance,
          true,
        );
      }
    }
    processEventQueue();
    currentTimers = null;
  }
}

function triggerOwnershipListeners(): void {
  const listeningInstances = Array.from(ownershipChangeListeners);
  const previousInstance = currentInstance;
  for (let i = 0; i < listeningInstances.length; i++) {
    const instance = listeningInstances[i];
    const {props, responder, state} = instance;
    currentInstance = instance;
    try {
      responder.onOwnershipChange(eventResponderContext, props, state);
    } finally {
      currentInstance = previousInstance;
    }
  }
}

export function mountEventResponder(
  eventComponentInstance: ReactEventComponentInstance,
) {
  const responder = eventComponentInstance.responder;
  if (responder.onOwnershipChange !== undefined) {
    ownershipChangeListeners.add(eventComponentInstance);
  }
}

export function unmountEventResponder(
  eventComponentInstance: ReactEventComponentInstance,
): void {
  const responder = eventComponentInstance.responder;
  const onUnmount = responder.onUnmount;
  if (onUnmount !== undefined) {
    let {props, state} = eventComponentInstance;
    const previousEventQueue = currentEventQueue;
    const previousInstance = currentInstance;
    currentEventQueue = createEventQueue();
    currentInstance = eventComponentInstance;
    try {
      onUnmount(eventResponderContext, props, state);
    } finally {
      currentEventQueue = previousEventQueue;
      currentInstance = previousInstance;
      currentTimers = null;
    }
  }
  if (currentOwner === eventComponentInstance) {
    currentOwner = null;
    triggerOwnershipListeners();
  }
  if (responder.onOwnershipChange !== undefined) {
    ownershipChangeListeners.delete(eventComponentInstance);
  }
}
