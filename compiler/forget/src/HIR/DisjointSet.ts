/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { invariant } from "../CompilerError";

/**
 * Represents items which form disjoint sets.
 */
export default class DisjointSet<T> {
  #entries: Map<T, T> = new Map();

  /**
   * Updates the graph to reflect that the given @param items form a set,
   * linking any previous sets that the items were part of into a single
   * set.
   */
  union(items: Array<T>) {
    const first = items.shift();
    invariant(first != null, "Expected set to be non-empty");
    // determine an arbitrary "root" for this set: if the first
    // item already has a root then use that, otherwise the first item
    // will be the new root.
    let root = this.#entries.get(first);
    if (root == null) {
      root = first;
      this.#entries.set(first, first);
    }
    // update remaining items (which may already be part of other sets)
    for (const item of items) {
      let itemParent = this.#entries.get(item);
      if (itemParent == null) {
        // new item, no existing set to update
        this.#entries.set(item, root);
        continue;
      } else if (itemParent === root) {
        continue;
      } else {
        let current = item;
        while (itemParent !== root) {
          this.#entries.set(current, root);
          current = itemParent;
          itemParent = this.#entries.get(current)!;
        }
      }
    }
  }

  /**
   * Finds the set to which the given @param item is associated, if @param item
   * is present in this set. If item is not present, returns null.
   *
   * Note that the returned value may be any item in the set to which the input
   * belongs: the only guarantee is that all items in a set will return the same
   * value in between calls to `union()`.
   */
  find(item: T): T | null {
    if (!this.#entries.has(item)) {
      return null;
    }
    let current = item;
    let parent = this.#entries.get(current)!;
    while (current !== parent) {
      current = parent;
      parent = this.#entries.get(current)!;
    }
    if (item !== current) {
      this.#entries.set(item, current);
    }
    return current;
  }

  /**
   * Calls the provided callback once for each item in the disjoint set,
   * passing the @param item and the @param group to which it belongs.
   */
  forEach(fn: (item: T, group: T) => void) {
    for (const item of this.#entries.keys()) {
      const group = this.find(item)!;
      fn(item, group);
    }
  }
}
