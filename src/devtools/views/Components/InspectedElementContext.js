// @flow

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createResource } from '../../cache';
import { BridgeContext, StoreContext } from '../context';
import { hydrate } from 'src/hydration';
import { TreeStateContext } from './TreeContext';
import { separateDisplayNameAndHOCs } from 'src/utils';

import type { InspectedElement as InspectedElementBackend } from 'src/backend/types';
import type {
  DehydratedData,
  Element,
  InspectedElement as InspectedElementFrontend,
} from 'src/devtools/views/Components/types';
import type { Resource, Thenable } from '../../cache';

type Context = {|
  read(id: number): InspectedElementFrontend | null,
|};

const InspectedElementContext = createContext<Context>(((null: any): Context));
InspectedElementContext.displayName = 'InspectedElementContext';

type ResolveFn = (inspectedElement: InspectedElementFrontend) => void;
type InProgressRequest = {|
  promise: Thenable<InspectedElementFrontend>,
  resolveFn: ResolveFn,
|};

const inProgressRequests: WeakMap<Element, InProgressRequest> = new WeakMap();
const resource: Resource<
  Element,
  Element,
  InspectedElementFrontend
> = createResource(
  (element: Element) => {
    let request = inProgressRequests.get(element);
    if (request != null) {
      return request.promise;
    }

    let resolveFn = ((null: any): ResolveFn);
    const promise = new Promise(resolve => {
      resolveFn = resolve;
    });

    inProgressRequests.set(element, { promise, resolveFn });

    return promise;
  },
  (element: Element) => element,
  { useWeakMap: true }
);

type Props = {|
  children: React$Node,
|};

function InspectedElementContextController({ children }: Props) {
  const bridge = useContext(BridgeContext);
  const store = useContext(StoreContext);

  const read = useCallback(
    (id: number) => {
      const element = store.getElementByID(id);
      if (element !== null) {
        return resource.read(element);
      } else {
        return null;
      }
    },
    [store]
  );

  // It's very important that this context consumes selectedElementID and not inspectedElementID.
  // Otherwise the effect that sends the "inspect" message across the bridge-
  // would itself be blocked by the same render that suspends (waiting for the data).
  const { selectedElementID } = useContext(TreeStateContext);

  const [count, setCount] = useState<number>(0);

  // This effect handler invalidates the suspense cache and schedules rendering updates with React.
  useEffect(() => {
    const onInspectedElement = (
      data: InspectedElementBackend | number | null
    ) => {
      // A null value means that the element no longer exists in the backend.
      // If it's the same element that's currently selected, that selection will be removed once the Store updates.
      // If it's not- then we can just ignore it anyway.
      // Either way there is nothing we need to do in this case.
      // A numeric value indicates that the element hasn't changed since we last requested its data,
      // in which case we don't need to invalidate the cache and re-render anything in the DevTools.
      if (data !== null && typeof data === 'object') {
        const id = data.id;

        const inspectedElement: InspectedElementFrontend = {
          canEditFunctionProps: data.canEditFunctionProps,
          canEditHooks: data.canEditHooks,
          canToggleSuspense: data.canToggleSuspense,
          canViewSource: data.canViewSource,
          id: data.id,
          source: data.source,
          type: data.type,
          owners:
            data.owners === null
              ? null
              : data.owners.map(owner => {
                  const [
                    displayName,
                    hocDisplayNames,
                  ] = separateDisplayNameAndHOCs(owner.displayName, owner.type);
                  return {
                    ...owner,
                    displayName,
                    hocDisplayNames,
                  };
                }),
          context: hydrateHelper(data.context),
          events: hydrateHelper(data.events),
          hooks: hydrateHelper(data.hooks),
          props: hydrateHelper(data.props),
          state: hydrateHelper(data.state),
        };

        const element = store.getElementByID(id);
        if (element !== null) {
          const request = inProgressRequests.get(element);
          if (request != null) {
            inProgressRequests.delete(element);
            request.resolveFn(inspectedElement);
          } else {
            resource.write(element, inspectedElement);

            // Schedule update with React if the curently-selected element has been invalidated.
            if (id === selectedElementID) {
              setCount(count => count + 1);
            }
          }
        }
      }
    };

    bridge.addListener('inspectedElement', onInspectedElement);
    return () => bridge.removeListener('inspectedElement', onInspectedElement);
  }, [bridge, selectedElementID, store]);

  // This effect handler polls for updates on the currently selected element.
  useEffect(() => {
    if (selectedElementID === null) {
      return () => {};
    }

    const rendererID = store.getRendererIDForElement(selectedElementID);

    let timeoutID: TimeoutID | null = null;

    const sendRequest = () => {
      timeoutID = null;

      bridge.send('inspectElement', { id: selectedElementID, rendererID });
    };

    // Send the initial inspection request.
    // We'll poll for an update in the response handler below.
    sendRequest();

    // Update the $r variable.
    bridge.send('selectElement', { id: selectedElementID, rendererID });

    const onInspectedElement = (
      data: InspectedElementBackend | number | null
    ) => {
      if (data !== null) {
        // If this is the element we requested, wait a little bit and then ask for an update.
        if (data === selectedElementID) {
          timeoutID = setTimeout(sendRequest, 1000);
        } else if (typeof data === 'object' && data.id === selectedElementID) {
          timeoutID = setTimeout(sendRequest, 1000);
        }
      }
    };

    bridge.addListener('inspectedElement', onInspectedElement);

    return () => {
      bridge.removeListener('inspectedElement', onInspectedElement);

      if (timeoutID !== null) {
        clearTimeout(timeoutID);
      }
    };
  }, [bridge, selectedElementID, store]);

  const value = useMemo(
    () => ({ read }),
    // Count is used to invalidate the cache and schedule an update with React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, read]
  );

  return (
    <InspectedElementContext.Provider value={value}>
      {children}
    </InspectedElementContext.Provider>
  );
}

function hydrateHelper(dehydratedData: DehydratedData | null): Object | null {
  if (dehydratedData !== null) {
    return hydrate(dehydratedData.data, dehydratedData.cleaned);
  } else {
    return null;
  }
}

export { InspectedElementContext, InspectedElementContextController };
