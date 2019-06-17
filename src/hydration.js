// @flow

import {
  isElement,
  typeOf,
  AsyncMode,
  ConcurrentMode,
  ContextConsumer,
  ContextProvider,
  ForwardRef,
  Fragment,
  Lazy,
  Memo,
  Portal,
  Profiler,
  StrictMode,
  Suspense,
} from 'react-is';
import { getDisplayName, getInObject, setInObject } from './utils';

export const meta = {
  name: Symbol('name'),
  type: Symbol('type'),
  inspected: Symbol('inspected'),
  meta: Symbol('meta'),
  proto: Symbol('proto'),
};

// This threshold determines the depth at which the bridge "dehydrates" nested data.
// Dehydration means that we don't serialize the data for e.g. postMessage or stringify,
// unless the frontend explicitly requests it (e.g. a user clicks to expand a props object).
//
// Reducing this threshold will improve the speed of initial component inspection,
// but may decrease the responsiveness of expanding objects/arrays to inspect further.
//
// Note that reducing the threshold to below two effectively breaks the inspected hooks interface.
const LEVEL_THRESHOLD = 2;

/**
 * Get a enhanced/artificial type string based on the object instance
 */
function getPropType(data: Object): string | null {
  if (!data) {
    return null;
  }

  if (isElement(data)) {
    return 'react_element';
  }

  if (data instanceof HTMLElement) {
    return 'html_element';
  }

  const type = typeof data;
  if (type === 'object') {
    if (Array.isArray(data)) {
      return 'array';
    }
    if (ArrayBuffer.isView(data)) {
      if (data instanceof DataView) {
        return 'data_view';
      }
      return 'typed_array';
    }
    if (data instanceof ArrayBuffer) {
      return 'array_buffer';
    }
    if (typeof data[Symbol.iterator] === 'function') {
      return 'iterator';
    }
    if (Object.prototype.toString.call(data) === '[object Date]') {
      return 'date';
    }
  }

  return type;
}

/**
 * Generate the dehydrated metadata for complex object instances
 */
function createDehydrated(
  type: string,
  data: Object,
  cleaned: Array<Array<string | number>>,
  path: Array<string | number>
): Object {
  const meta = {};

  if (type === 'array' || type === 'typed_array') {
    meta.length = data.length;
  }
  if (type === 'iterator' || type === 'typed_array') {
    meta.readOnly = true;
  }

  cleaned.push(path);

  return {
    type,
    meta,
    name:
      !data.constructor || data.constructor.name === 'Object'
        ? ''
        : data.constructor.name,
  };
}

function isInspectedPath(
  path: Array<string | number> = [],
  inspectedPaths: Object
): boolean {
  let current = inspectedPaths;
  for (let i = 0; i < path.length; i++) {
    current = current[path[i]];
    if (!current) {
      return false;
    }
  }
  return true;
}

/**
 * Strip out complex data (instances, functions, and data nested > LEVEL_THRESHOLD levels deep).
 * The paths of the stripped out objects are appended to the `cleaned` list.
 * On the other side of the barrier, the cleaned list is used to "re-hydrate" the cleaned representation into
 * an object with symbols as attributes, so that a sanitized object can be distinguished from a normal object.
 *
 * Input: {"some": {"attr": fn()}, "other": AnInstance}
 * Output: {
 *   "some": {
 *     "attr": {"name": the fn.name, type: "function"}
 *   },
 *   "other": {
 *     "name": "AnInstance",
 *     "type": "object",
 *   },
 * }
 * and cleaned = [["some", "attr"], ["other"]]
 */
export function dehydrate(
  data: Object,
  cleaned: Array<Array<string | number>>,
  path: Array<string | number>,
  inspectedPaths: Object,
  level?: number = 0
): string | Object {
  const type = getPropType(data);

  switch (type) {
    case 'html_element':
      cleaned.push(path);
      return {
        name: data.tagName,
        type: 'html_element',
      };

    case 'function':
      cleaned.push(path);
      return {
        name: data.name,
        type: 'function',
      };

    case 'string':
      return data.length <= 500 ? data : data.slice(0, 500) + '...';

    // We have to do this assignment b/c Flow doesn't think "symbol" is
    // something typeof would return. Error 'unexpected predicate "symbol"'
    case 'symbol':
      cleaned.push(path);
      return {
        type: 'symbol',
        name: data.toString(),
      };

    // React Elements aren't very inspector-friendly,
    // and often contain private fields or circular references.
    case 'react_element':
      cleaned.push(path);
      return {
        name: getDisplayNameForReactElement(data),
        type: 'react_element',
      };

    // ArrayBuffers error if you try to inspect them.
    case 'array_buffer':
    case 'data_view':
      cleaned.push(path);
      return {
        type,
        name: type === 'data_view' ? 'DataView' : 'ArrayBuffer',
        meta: {
          length: data.byteLength,
          uninspectable: true,
        },
      };

    case 'array':
      const arrayPathCheck = isInspectedPath(path, inspectedPaths);
      if (level >= LEVEL_THRESHOLD && !arrayPathCheck) {
        return createDehydrated(type, data, cleaned, path);
      }
      return data.map((item, i) =>
        dehydrate(
          item,
          cleaned,
          path.concat([i]),
          inspectedPaths,
          arrayPathCheck ? 1 : level + 1
        )
      );

    case 'typed_array':
    case 'iterator':
      return createDehydrated(type, data, cleaned, path);
    case 'date':
      cleaned.push(path);
      return {
        name: data.toString(),
        type: 'date',
        meta: {
          uninspectable: true,
        },
      };
    case 'object':
      const objectPathCheck = isInspectedPath(path, inspectedPaths);
      if (level >= LEVEL_THRESHOLD && !objectPathCheck) {
        return createDehydrated(type, data, cleaned, path);
      } else {
        const res = {};
        for (let name in data) {
          res[name] = dehydrate(
            data[name],
            cleaned,
            path.concat([name]),
            inspectedPaths,
            objectPathCheck ? 1 : level + 1
          );
        }
        return res;
      }

    default:
      return data;
  }
}

export function fillInPath(
  object: Object,
  path: Array<string | number>,
  value: any
) {
  const length = path.length;
  const parent = getInObject(object, path.slice(0, length - 1));
  if (object != null) {
    delete parent[meta.name];
    delete parent[meta.type];
    delete parent[meta.meta];
    delete parent[meta.inspected];

    setInObject(object, path, value);
  }
}

export function hydrate(
  object: Object,
  cleaned: Array<Array<string | number>>
): Object {
  cleaned.forEach((path: Array<string | number>) => {
    const length = path.length;
    const last = path[length - 1];
    const parent = getInObject(object, path.slice(0, length - 1));
    if (!parent || !parent[last]) {
      return;
    }

    const value = parent[last];

    // Replace the string keys with Symbols so they're non-enumerable.
    const replaced: { [key: Symbol]: boolean | string } = {};
    replaced[meta.inspected] = false;
    replaced[meta.meta] = value.meta;
    replaced[meta.name] = value.name;
    replaced[meta.type] = value.type;

    parent[last] = replaced;
  });
  return object;
}

export function getDisplayNameForReactElement(
  element: React$Element<any>
): string | null {
  const elementType = typeOf(element);
  switch (elementType) {
    case AsyncMode:
    case ConcurrentMode:
      return 'ConcurrentMode';
    case ContextConsumer:
      return 'ContextConsumer';
    case ContextProvider:
      return 'ContextProvider';
    case ForwardRef:
      return 'ForwardRef';
    case Fragment:
      return 'Fragment';
    case Lazy:
      return 'Lazy';
    case Memo:
      return 'Memo';
    case Portal:
      return 'Portal';
    case Profiler:
      return 'Profiler';
    case StrictMode:
      return 'StrictMode';
    case Suspense:
      return 'Suspense';
    default:
      const { type } = element;
      if (typeof type === 'string') {
        return type;
      } else if (type != null) {
        return getDisplayName(type, 'Anonymous');
      } else {
        return 'Element';
      }
  }
}
