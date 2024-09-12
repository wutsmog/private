/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import Agent from './agent';

import type {DevToolsHook, RendererID, RendererInterface} from './types';

export type InitBackend = typeof initBackend;

export function initBackend(
  hook: DevToolsHook,
  agent: Agent,
  global: Object,
): () => void {
  if (hook == null) {
    // DevTools didn't get injected into this page (maybe b'c of the contentType).
    return () => {};
  }

  function registerRendererInterface(
    id: RendererID,
    rendererInterface: RendererInterface,
  ) {
    agent.registerRendererInterface(id, rendererInterface);

    // Now that the Store and the renderer interface are connected,
    // it's time to flush the pending operation codes to the frontend.
    rendererInterface.flushInitialOperations();
  }

  const subs = [
    hook.sub(
      'renderer-attached',
      ({
        id,
        rendererInterface,
      }: {
        id: number,
        rendererInterface: RendererInterface,
      }) => {
        registerRendererInterface(id, rendererInterface);
      },
    ),
    hook.sub('unsupported-renderer-version', () => {
      agent.onUnsupportedRenderer();
    }),

    hook.sub('fastRefreshScheduled', agent.onFastRefreshScheduled),
    hook.sub('operations', agent.onHookOperations),
    hook.sub('traceUpdates', agent.onTraceUpdates),

    // TODO Add additional subscriptions required for profiling mode
  ];

  agent.addListener('getIfHasUnsupportedRendererVersion', () => {
    if (hook.hasUnsupportedRendererAttached) {
      agent.onUnsupportedRenderer();
    }
  });

  hook.rendererInterfaces.forEach((rendererInterface, id) => {
    registerRendererInterface(id, rendererInterface);
  });

  hook.emit('react-devtools', agent);
  hook.reactDevtoolsAgent = agent;

  const onAgentShutdown = () => {
    subs.forEach(fn => fn());
    hook.rendererInterfaces.forEach(rendererInterface => {
      rendererInterface.cleanup();
    });
    hook.reactDevtoolsAgent = null;
  };
  agent.addListener('shutdown', onAgentShutdown);
  subs.push(() => {
    agent.removeListener('shutdown', onAgentShutdown);
  });

  return () => {
    subs.forEach(fn => fn());
  };
}
