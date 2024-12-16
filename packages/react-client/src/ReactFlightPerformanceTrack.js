/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactComponentInfo} from 'shared/ReactTypes';

import {enableProfilerTimer} from 'shared/ReactFeatureFlags';

const supportsUserTiming =
  enableProfilerTimer &&
  typeof performance !== 'undefined' &&
  // $FlowFixMe[method-unbinding]
  typeof performance.measure === 'function';

const COMPONENTS_TRACK = 'Server Components ⚛';

const componentsTrackMarker = {
  startTime: 0.001,
  detail: {
    devtools: {
      color: 'primary-light',
      track: 'Primary',
      trackGroup: COMPONENTS_TRACK,
    },
  },
};

export function markAllTracksInOrder() {
  if (supportsUserTiming) {
    // Ensure we create the Server Component track groups earlier than the Client Scheduler
    // and Client Components. We can always add the 0 time slot even if it's in the past.
    // That's still considered for ordering.
    performance.mark('Server Components Track', componentsTrackMarker);
  }
}

// Reused to avoid thrashing the GC.
const reusableComponentDevToolDetails = {
  color: 'primary',
  track: '',
  trackGroup: COMPONENTS_TRACK,
};
const reusableComponentOptions = {
  start: -0,
  end: -0,
  detail: {
    devtools: reusableComponentDevToolDetails,
  },
};

const trackNames = [
  'Primary',
  'Parallel',
  'Parallel\u200b', // Padded with zero-width space to give each track a unique name.
  'Parallel\u200b\u200b',
  'Parallel\u200b\u200b\u200b',
  'Parallel\u200b\u200b\u200b\u200b',
  'Parallel\u200b\u200b\u200b\u200b\u200b',
  'Parallel\u200b\u200b\u200b\u200b\u200b\u200b',
  'Parallel\u200b\u200b\u200b\u200b\u200b\u200b\u200b',
  'Parallel\u200b\u200b\u200b\u200b\u200b\u200b\u200b\u200b',
];

export function logComponentRender(
  componentInfo: ReactComponentInfo,
  trackIdx: number,
  startTime: number,
  endTime: number,
  childrenEndTime: number,
): void {
  if (supportsUserTiming && childrenEndTime >= 0 && trackIdx < 10) {
    const name = componentInfo.name;
    const selfTime = endTime - startTime;
    reusableComponentDevToolDetails.color =
      selfTime < 0.5
        ? 'primary-light'
        : selfTime < 50
          ? 'primary'
          : selfTime < 500
            ? 'primary-dark'
            : 'error';
    reusableComponentDevToolDetails.track = trackNames[trackIdx];
    reusableComponentOptions.start = startTime < 0 ? 0 : startTime;
    reusableComponentOptions.end = childrenEndTime;
    performance.measure(name, reusableComponentOptions);
  }
}
