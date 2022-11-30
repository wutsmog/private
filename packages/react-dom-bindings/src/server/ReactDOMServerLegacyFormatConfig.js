/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {
  BootstrapScriptDescriptor,
  FormatContext,
  StreamingFormat,
} from './ReactDOMServerFormatConfig';

import {
  createResponseState as createResponseStateImpl,
  pushTextInstance as pushTextInstanceImpl,
  pushSegmentFinale as pushSegmentFinaleImpl,
  writeStartCompletedSuspenseBoundary as writeStartCompletedSuspenseBoundaryImpl,
  writeStartClientRenderedSuspenseBoundary as writeStartClientRenderedSuspenseBoundaryImpl,
  writeEndCompletedSuspenseBoundary as writeEndCompletedSuspenseBoundaryImpl,
  writeEndClientRenderedSuspenseBoundary as writeEndClientRenderedSuspenseBoundaryImpl,
  HTML_MODE,
} from './ReactDOMServerFormatConfig';

import type {
  Destination,
  Chunk,
  PrecomputedChunk,
} from 'react-server/src/ReactServerStreamConfig';

export const isPrimaryRenderer = false;

export type ResponseState = {
  // Keep this in sync with ReactDOMServerFormatConfig
  bootstrapChunks: Array<Chunk | PrecomputedChunk>,
  placeholderPrefix: PrecomputedChunk,
  segmentPrefix: PrecomputedChunk,
  boundaryPrefix: string,
  idPrefix: string,
  nextSuspenseID: number,
  streamingFormat: StreamingFormat,
  startInlineScript: PrecomputedChunk,
  sentCompleteSegmentFunction: boolean,
  sentCompleteBoundaryFunction: boolean,
  sentClientRenderFunction: boolean,
  sentStyleInsertionFunction: boolean,
  externalRuntimeConfig: BootstrapScriptDescriptor | null,
  // This is an extra field for the legacy renderer
  generateStaticMarkup: boolean,
};

export function createResponseState(
  generateStaticMarkup: boolean,
  identifierPrefix: string | void,
  externalRuntimeConfig: string | BootstrapScriptDescriptor | void,
): ResponseState {
  const responseState = createResponseStateImpl(
    identifierPrefix,
    undefined,
    undefined,
    undefined,
    undefined,
    externalRuntimeConfig,
  );
  return {
    // Keep this in sync with ReactDOMServerFormatConfig
    bootstrapChunks: responseState.bootstrapChunks,
    placeholderPrefix: responseState.placeholderPrefix,
    segmentPrefix: responseState.segmentPrefix,
    boundaryPrefix: responseState.boundaryPrefix,
    idPrefix: responseState.idPrefix,
    nextSuspenseID: responseState.nextSuspenseID,
    streamingFormat: responseState.streamingFormat,
    startInlineScript: responseState.startInlineScript,
    sentCompleteSegmentFunction: responseState.sentCompleteSegmentFunction,
    sentCompleteBoundaryFunction: responseState.sentCompleteBoundaryFunction,
    sentClientRenderFunction: responseState.sentClientRenderFunction,
    sentStyleInsertionFunction: responseState.sentStyleInsertionFunction,
    externalRuntimeConfig: responseState.externalRuntimeConfig,
    // This is an extra field for the legacy renderer
    generateStaticMarkup,
  };
}

export function createRootFormatContext(): FormatContext {
  return {
    insertionMode: HTML_MODE, // We skip the root mode because we don't want to emit the DOCTYPE in legacy mode.
    selectedValue: null,
    noscriptTagInScope: false,
  };
}

export type {
  Resources,
  BoundaryResources,
  FormatContext,
  SuspenseBoundaryID,
} from './ReactDOMServerFormatConfig';

export {
  getChildFormatContext,
  UNINITIALIZED_SUSPENSE_BOUNDARY_ID,
  assignSuspenseBoundaryID,
  makeId,
  pushStartInstance,
  pushEndInstance,
  pushStartCompletedSuspenseBoundary,
  pushEndCompletedSuspenseBoundary,
  writeStartSegment,
  writeEndSegment,
  writeCompletedSegmentInstruction,
  writeCompletedBoundaryInstruction,
  writeClientRenderBoundaryInstruction,
  writeStartPendingSuspenseBoundary,
  writeEndPendingSuspenseBoundary,
  writePlaceholder,
  writeCompletedRoot,
  createResources,
  createBoundaryResources,
  writeInitialResources,
  writeImmediateResources,
  hoistResources,
  hoistResourcesToRoot,
  setCurrentlyRenderingBoundaryResourcesTarget,
  prepareToRender,
  cleanupAfterRender,
} from './ReactDOMServerFormatConfig';

import {stringToChunk} from 'react-server/src/ReactServerStreamConfig';

import escapeTextForBrowser from './escapeTextForBrowser';

export function pushTextInstance(
  target: Array<Chunk | PrecomputedChunk>,
  text: string,
  responseState: ResponseState,
  textEmbedded: boolean,
): boolean {
  if (responseState.generateStaticMarkup) {
    target.push(stringToChunk(escapeTextForBrowser(text)));
    return false;
  } else {
    return pushTextInstanceImpl(target, text, responseState, textEmbedded);
  }
}

export function pushSegmentFinale(
  target: Array<Chunk | PrecomputedChunk>,
  responseState: ResponseState,
  lastPushedText: boolean,
  textEmbedded: boolean,
): void {
  if (responseState.generateStaticMarkup) {
    return;
  } else {
    return pushSegmentFinaleImpl(
      target,
      responseState,
      lastPushedText,
      textEmbedded,
    );
  }
}

export function writeStartCompletedSuspenseBoundary(
  destination: Destination,
  responseState: ResponseState,
): boolean {
  if (responseState.generateStaticMarkup) {
    // A completed boundary is done and doesn't need a representation in the HTML
    // if we're not going to be hydrating it.
    return true;
  }
  return writeStartCompletedSuspenseBoundaryImpl(destination, responseState);
}
export function writeStartClientRenderedSuspenseBoundary(
  destination: Destination,
  responseState: ResponseState,
  // flushing these error arguments are not currently supported in this legacy streaming format.
  errorDigest: ?string,
  errorMessage: ?string,
  errorComponentStack: ?string,
): boolean {
  if (responseState.generateStaticMarkup) {
    // A client rendered boundary is done and doesn't need a representation in the HTML
    // since we'll never hydrate it. This is arguably an error in static generation.
    return true;
  }
  return writeStartClientRenderedSuspenseBoundaryImpl(
    destination,
    responseState,
    errorDigest,
    errorMessage,
    errorComponentStack,
  );
}
export function writeEndCompletedSuspenseBoundary(
  destination: Destination,
  responseState: ResponseState,
): boolean {
  if (responseState.generateStaticMarkup) {
    return true;
  }
  return writeEndCompletedSuspenseBoundaryImpl(destination, responseState);
}
export function writeEndClientRenderedSuspenseBoundary(
  destination: Destination,
  responseState: ResponseState,
): boolean {
  if (responseState.generateStaticMarkup) {
    return true;
  }
  return writeEndClientRenderedSuspenseBoundaryImpl(destination, responseState);
}
