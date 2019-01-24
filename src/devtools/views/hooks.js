// @flow

import { useLayoutEffect, useState } from 'react';

import type { Element } from '../types';
import Store from '../store';

export function useElement(store: Store, id: string): Element {
  const [element, setElement] = useState<Element>(
    ((store.getElement(id): any): Element)
  );

  // TODO: We might still miss updates in concurrent mode.
  //       We should just useEffect and do a sync comparison (like in create-subscription) to handle this.
  useLayoutEffect(() => {
    const handler = () => setElement(((store.getElement(id): any): Element));
    store.addListener(id, handler);
    return () => store.removeListener(id, handler);
  }, [store, id]);

  return element;
}

export function useRoots(store: Store): Array<string> {
  const [roots, setRoots] = useState<Array<string>>(Array.from(store.roots));

  // TODO: We might still miss updates in concurrent mode.
  //       We should just useEffect and do a sync comparison (like in create-subscription) to handle this.
  useLayoutEffect(() => {
    const handler = () => setRoots(Array.from(store.roots));
    store.addListener('roots', handler);
    return () => store.removeListener('roots', handler);
  }, [store]);

  return roots;
}
