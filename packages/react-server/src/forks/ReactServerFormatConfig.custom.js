/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// This is a host config that's used for the `react-server` package on npm.
// It is only used by third-party renderers.
//
// Its API lets you pass the host config as an argument.
// However, inside the `react-server` we treat host config as a module.
// This file is a shim between two worlds.
//
// It works because the `react-server` bundle is wrapped in something like:
//
// module.exports = function ($$$config) {
//   /* renderer code */
// }
//
// So `$$$config` looks like a global variable, but it's
// really an argument to a top-level wrapping function.

declare var $$$hostConfig: any;
export opaque type Destination = mixed; // eslint-disable-line no-undef
export opaque type ResponseState = mixed;
export opaque type SuspenseBoundaryID = mixed;

export const createResponseState = $$$hostConfig.createResponseState;
export const createSuspenseBoundaryID = $$$hostConfig.createSuspenseBoundaryID;
export const pushEmpty = $$$hostConfig.pushEmpty;
export const pushTextInstance = $$$hostConfig.pushTextInstance;
export const pushStartInstance = $$$hostConfig.pushStartInstance;
export const pushEndInstance = $$$hostConfig.pushEndInstance;
export const writePlaceholder = $$$hostConfig.writePlaceholder;
export const writeStartCompletedSuspenseBoundary =
  $$$hostConfig.writeStartCompletedSuspenseBoundary;
export const writeStartPendingSuspenseBoundary =
  $$$hostConfig.writeStartPendingSuspenseBoundary;
export const writeStartClientRenderedSuspenseBoundary =
  $$$hostConfig.writeStartClientRenderedSuspenseBoundary;
export const writeEndSuspenseBoundary = $$$hostConfig.writeEndSuspenseBoundary;
export const writeStartSegment = $$$hostConfig.writeStartSegment;
export const writeEndSegment = $$$hostConfig.writeEndSegment;
export const writeCompletedSegmentInstruction =
  $$$hostConfig.writeCompletedSegmentInstruction;
export const writeCompletedBoundaryInstruction =
  $$$hostConfig.writeCompletedBoundaryInstruction;
export const writeClientRenderBoundaryInstruction =
  $$$hostConfig.writeClientRenderBoundaryInstruction;
