/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Dispatcher} from 'react-reconciler/src/ReactInternalTypes';

/**
 * Keeps track of the current dispatcher.
 */
const ReactCurrentDispatcher = {
  current: (null: null | Dispatcher),
};

export default ReactCurrentDispatcher;
