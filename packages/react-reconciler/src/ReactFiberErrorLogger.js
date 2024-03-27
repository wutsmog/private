/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactInternalTypes';
import type {CapturedValue} from './ReactCapturedValue';

import {showErrorDialog} from './ReactFiberErrorDialog';
import getComponentNameFromFiber from 'react-reconciler/src/getComponentNameFromFiber';
import {HostRoot} from 'react-reconciler/src/ReactWorkTags';

import reportGlobalError from 'shared/reportGlobalError';

import ReactSharedInternals from 'shared/ReactSharedInternals';
const {ReactCurrentActQueue} = ReactSharedInternals;

export function logCapturedError(
  boundary: Fiber,
  errorInfo: CapturedValue<mixed>,
): void {
  try {
    const logError = showErrorDialog(boundary, errorInfo);

    // Allow injected showErrorDialog() to prevent default console.error logging.
    // This enables renderers like ReactNative to better manage redbox behavior.
    if (logError === false) {
      return;
    }

    const error = (errorInfo.value: any);

    if (boundary.tag === HostRoot) {
      if (__DEV__ && ReactCurrentActQueue.current !== null) {
        // For uncaught errors inside act, we track them on the act and then
        // rethrow them into the test.
        ReactCurrentActQueue.thrownErrors.push(error);
        return;
      }
      // For uncaught root errors we report them as uncaught to the browser's
      // onerror callback. This won't have component stacks and the error addendum.
      // So we add those into a separate console.warn.
      reportGlobalError(error);
      if (__DEV__) {
        const source = errorInfo.source;
        const stack = errorInfo.stack;
        const componentStack = stack !== null ? stack : '';
        // TODO: There's no longer a way to silence these warnings e.g. for tests.
        // See https://github.com/facebook/react/pull/13384

        const componentName = source ? getComponentNameFromFiber(source) : null;
        const componentNameMessage = componentName
          ? `An error occurred in the <${componentName}> component:`
          : 'An error occurred in one of your React components:';

        console['warn'](
          '%s\n%s\n\n%s',
          componentNameMessage,
          componentStack,
          'Consider adding an error boundary to your tree to customize error handling behavior.\n' +
            'Visit https://react.dev/link/error-boundaries to learn more about error boundaries.',
        );
      }
    } else {
      // Caught by error boundary
      if (__DEV__) {
        const source = errorInfo.source;
        const stack = errorInfo.stack;
        const componentStack = stack !== null ? stack : '';
        // TODO: There's no longer a way to silence these warnings e.g. for tests.
        // See https://github.com/facebook/react/pull/13384

        const componentName = source ? getComponentNameFromFiber(source) : null;
        const componentNameMessage = componentName
          ? `The above error occurred in the <${componentName}> component:`
          : 'The above error occurred in one of your React components:';

        const errorBoundaryName =
          getComponentNameFromFiber(boundary) || 'Anonymous';

        // In development, we provide our own message which includes the component stack
        // in addition to the error.
        // Don't transform to our wrapper
        console['error'](
          '%o\n\n%s\n%s\n\n%s',
          error,
          componentNameMessage,
          componentStack,
          `React will try to recreate this component tree from scratch ` +
            `using the error boundary you provided, ${errorBoundaryName}.`,
        );
      } else {
        // In production, we print the error directly.
        // This will include the message, the JS stack, and anything the browser wants to show.
        // We pass the error object instead of custom message so that the browser displays the error natively.
        console['error'](error); // Don't transform to our wrapper
      }
    }
  } catch (e) {
    // This method must not throw, or React internal state will get messed up.
    // If console.error is overridden, or logCapturedError() shows a dialog that throws,
    // we want to report this error outside of the normal stack as a last resort.
    // https://github.com/facebook/react/issues/13188
    setTimeout(() => {
      throw e;
    });
  }
}
