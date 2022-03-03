/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactNodeList} from 'shared/ReactTypes';

import ReactVersion from 'shared/ReactVersion';

import {
  createRequest,
  startWork,
  startFlowing,
  abort,
} from 'react-server/src/ReactFizzServer';

import {
  createResponseState,
  createRootFormatContext,
} from './ReactDOMServerFormatConfig';

type Options = {|
  identifierPrefix?: string,
  namespaceURI?: string,
  nonce?: string,
  bootstrapScriptContent?: string,
  bootstrapScripts?: Array<string>,
  bootstrapModules?: Array<string>,
  progressiveChunkSize?: number,
  signal?: AbortSignal,
  onError?: (error: mixed) => void,
|};

// TODO: Move to sub-classing ReadableStream.
type ReactDOMServerReadableStream = ReadableStream & {
  allReady: Promise<void>,
};

function renderToReadableStream(
  children: ReactNodeList,
  options?: Options,
): Promise<ReactDOMServerReadableStream> {
  return new Promise((resolve, reject) => {
    let onFatalError;
    let onCompleteAll;
    const allReady = new Promise((res, rej) => {
      onCompleteAll = res;
      onFatalError = rej;
    });

    function onCompleteShell() {
      const stream: ReactDOMServerReadableStream = (new ReadableStream({
        type: 'bytes',
        pull(controller) {
          startFlowing(request, controller);
        },
        cancel(reason) {},
      }): any);
      // TODO: Move to sub-classing ReadableStream.
      stream.allReady = allReady;
      resolve(stream);
    }
    function onErrorShell(error: mixed) {
      reject(error);
    }
    const request = createRequest(
      children,
      createResponseState(
        options ? options.identifierPrefix : undefined,
        options ? options.nonce : undefined,
        options ? options.bootstrapScriptContent : undefined,
        options ? options.bootstrapScripts : undefined,
        options ? options.bootstrapModules : undefined,
      ),
      createRootFormatContext(options ? options.namespaceURI : undefined),
      options ? options.progressiveChunkSize : undefined,
      options ? options.onError : undefined,
      onCompleteAll,
      onCompleteShell,
      onErrorShell,
      onFatalError,
    );
    if (options && options.signal) {
      const signal = options.signal;
      const listener = () => {
        abort(request);
        signal.removeEventListener('abort', listener);
      };
      signal.addEventListener('abort', listener);
    }
    startWork(request);
  });
}

export {renderToReadableStream, ReactVersion as version};
