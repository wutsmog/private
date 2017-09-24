/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @providesModule ReactMultiChildUpdateTypes
 */

'use strict';

/**
 * When a component's children are updated, a series of update configuration
 * objects are created in order to batch and serialize the required changes.
 *
 * Enumerates all the possible types of update configurations.
 */
export type ReactMultiChildUpdateTypes =
  | 'INSERT_MARKUP'
  | 'MOVE_EXISTING'
  | 'REMOVE_NODE'
  | 'SET_MARKUP'
  | 'TEXT_CONTENT';
