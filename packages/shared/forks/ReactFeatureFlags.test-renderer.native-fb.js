/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import typeof * as FeatureFlagsType from 'shared/ReactFeatureFlags';
import typeof * as ExportsType from './ReactFeatureFlags.test-renderer';

export const debugRenderPhaseSideEffectsForStrictMode = false;
export const enableDebugTracing = false;
export const enableAsyncDebugInfo = false;
export const enableSchedulingProfiler = __PROFILE__;
export const enableProfilerTimer = __PROFILE__;
export const enableProfilerCommitHooks = __PROFILE__;
export const enableProfilerNestedUpdatePhase = __PROFILE__;
export const enableUpdaterTracking = false;
export const enableCache = true;
export const enableLegacyCache = false;
export const enableBinaryFlight = true;
export const enableFlightReadableStream = true;
export const enableAsyncIterableChildren = false;
export const enableTaint = true;
export const enablePostpone = false;
export const disableCommentsAsDOMContainers = true;
export const disableInputAttributeSyncing = false;
export const disableIEWorkarounds = true;
export const enableScopeAPI = false;
export const enableCreateEventHandleAPI = false;
export const enableSuspenseCallback = false;
export const disableLegacyContext = false;
export const enableTrustedTypesIntegration = false;
export const disableTextareaChildren = false;
export const enableComponentStackLocations = true;
export const enableLegacyFBSupport = false;
export const enableFilterEmptyStringAttributesDOM = true;
export const enableGetInspectorDataForInstanceInProduction = false;
export const enableSuspenseAvoidThisFallback = false;
export const enableSuspenseAvoidThisFallbackFizz = false;
export const enableCPUSuspense = true;
export const enableUseMemoCacheHook = true;
export const enableNoCloningMemoCache = false;
export const enableUseEffectEventHook = false;
export const favorSafetyOverHydrationPerf = true;
export const enableInfiniteRenderLoopDetection = false;
export const enableRenderableContext = true;

export const enableRetryLaneExpiration = false;
export const retryLaneExpirationMs = 5000;
export const syncLaneExpirationMs = 250;
export const transitionLaneExpirationMs = 5000;

export const disableSchedulerTimeoutInWorkLoop = false;
export const enableLazyContextPropagation = false;
export const enableLegacyHidden = false;
export const forceConcurrentByDefaultForTesting = false;
export const enableUnifiedSyncLane = true;
export const allowConcurrentByDefault = true;

export const consoleManagedByDevToolsDuringStrictMode = false;

export const enableTransitionTracing = false;

export const useModernStrictMode = true;
export const enableDO_NOT_USE_disableStrictPassiveEffect = false;
export const enableFizzExternalRuntime = true;
export const enableDeferRootSchedulingToMicrotask = false;

export const enableAsyncActions = true;

export const alwaysThrottleRetries = false;

export const passChildrenWhenCloningPersistedNodes = false;
export const enableUseDeferredValueInitialArg = __EXPERIMENTAL__;
export const disableClientCache = true;

export const enableServerComponentLogs = true;

export const enableRefAsProp = true;
export const disableStringRefs = true;
export const enableFastJSX = true;

export const enableReactTestRendererWarning = false;
export const disableLegacyMode = false;
export const disableDOMTestUtils = false;

export const disableDefaultPropsExceptForClasses = false;
export const enableAddPropertiesFastPath = false;

export const renameElementSymbol = false;

export const enableOwnerStacks = false;

// Flow magic to verify the exports of this file match the original version.
((((null: any): ExportsType): FeatureFlagsType): ExportsType);
