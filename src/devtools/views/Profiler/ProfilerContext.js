// @flow

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { unstable_batchedUpdates as batchedUpdates } from 'react-dom';
import { useLocalStorage, useSubscription } from '../hooks';
import {
  TreeDispatcherContext,
  TreeStateContext,
} from '../Components/TreeContext';
import { StoreContext } from '../context';
import Store from '../../store';

import type { ProfilingDataFrontend } from './types';

export type TabID = 'flame-chart' | 'ranked-chart' | 'interactions';

type Context = {|
  // Which tab is selexted in the Profiler UI?
  selectedTabID: TabID,
  selectTab(id: TabID): void,

  // Have we recorded any profiling data?
  // Are we currently profiling?
  // This value may be modified by the record button in the Profiler toolbar,
  // or from the backend itself (after a reload-and-profile action).
  // It is synced between the backend and frontend via a Store subscription.
  hasProfilingData: boolean,
  isProcessingData: boolean,
  isProfiling: boolean,
  profilingData: ProfilingDataFrontend | null,
  startProfiling(value: boolean): void,
  stopProfiling(value: boolean): void,

  // Which root should profiling data be shown for?
  // This value should be initialized to either:
  // 1. The selected root in the Components tree (if it has any profiling data) or
  // 2. The first root in the list with profiling data.
  rootID: number | null,
  setRootID: (id: number) => void,

  // Controls whether commits are filtered by duration.
  // This value is controlled by a filter toggle UI in the Profiler toolbar.
  // It impacts the commit selector UI as well as the fiber commits bar chart.
  isCommitFilterEnabled: boolean,
  setIsCommitFilterEnabled: (value: boolean) => void,
  minCommitDuration: number,
  setMinCommitDuration: (value: number) => void,

  // Which commit is currently selected in the commit selector UI.
  // Note that this is the index of the commit in all commits (non-filtered) that were profiled.
  // This value is controlled by the commit selector UI in the Profiler toolbar.
  // It impacts the flame graph and ranked charts.
  selectedCommitIndex: number | null,
  selectCommitIndex: (value: number | null) => void,

  // Which fiber is currently selected in the Ranked or Flamegraph charts?
  selectedFiberID: number | null,
  selectedFiberName: string | null,
  selectFiber: (id: number | null, name: string | null) => void,

  // Which interaction is currently selected in the Interactions graph?
  selectedInteractionID: number | null,
  selectInteraction: (id: number | null) => void,
|};

const ProfilerContext = createContext<Context>(((null: any): Context));
ProfilerContext.displayName = 'ProfilerContext';

type StoreProfilingState = {|
  hasProfilingData: boolean,
  isProcessingData: boolean,
  isProfiling: boolean,
  profilingData: ProfilingDataFrontend | null,
|};

type Props = {|
  children: React$Node,
|};

function ProfilerContextController({ children }: Props) {
  const store = useContext(StoreContext);
  const { selectedElementID } = useContext(TreeStateContext);
  const dispatch = useContext(TreeDispatcherContext);

  const { profilerStore } = store;

  const subscription = useMemo(
    () => ({
      getCurrentValue: () => ({
        hasProfilingData: profilerStore.hasProfilingData,
        isProcessingData: profilerStore.isProcessingData,
        isProfiling: profilerStore.isProfiling,
        profilingData: profilerStore.profilingData,
      }),
      subscribe: (callback: Function) => {
        profilerStore.addListener('profilingData', callback);
        profilerStore.addListener('isProcessingData', callback);
        profilerStore.addListener('isProfiling', callback);
        return () => {
          profilerStore.removeListener('profilingData', callback);
          profilerStore.removeListener('isProcessingData', callback);
          profilerStore.removeListener('isProfiling', callback);
        };
      },
    }),
    [profilerStore]
  );
  const {
    hasProfilingData,
    isProcessingData,
    isProfiling,
    profilingData,
  } = useSubscription<StoreProfilingState, Store>(subscription);

  const [rootID, setRootID] = useState<number | null>(null);

  const dataForRoots =
    profilingData !== null ? profilingData.dataForRoots : null;
  if (dataForRoots != null) {
    const firstRootID = dataForRoots.keys().next().value || null;

    if (rootID === null || !dataForRoots.has(rootID)) {
      let selectedElementRootID = null;
      if (selectedElementID !== null) {
        selectedElementRootID = store.getRootIDForElement(selectedElementID);
      }
      if (
        selectedElementRootID !== null &&
        dataForRoots.has(selectedElementRootID)
      ) {
        setRootID(selectedElementRootID);
      } else {
        setRootID(firstRootID);
      }
    }
  }

  const startProfiling = useCallback(() => store.startProfiling(), [store]);
  const stopProfiling = useCallback(() => store.stopProfiling(), [store]);

  const [
    isCommitFilterEnabled,
    setIsCommitFilterEnabled,
  ] = useLocalStorage<boolean>('React::DevTools::isCommitFilterEnabled', false);
  const [minCommitDuration, setMinCommitDuration] = useLocalStorage<number>(
    'minCommitDuration',
    0
  );

  const [selectedCommitIndex, selectCommitIndex] = useState<number | null>(
    null
  );
  const [selectedTabID, selectTab] = useState<TabID>('flame-chart');
  const [selectedFiberID, selectFiberID] = useState<number | null>(null);
  const [selectedFiberName, selectFiberName] = useState<string | null>(null);
  const [selectedInteractionID, selectInteraction] = useState<number | null>(
    null
  );

  const selectFiber = useCallback(
    (id: number | null, name: string | null) => {
      selectFiberID(id);
      selectFiberName(name);
      if (id !== null) {
        // If this element is still in the store, then select it in the Components tab as well.
        const element = store.getElementByID(id);
        if (element !== null) {
          dispatch({
            type: 'SELECT_ELEMENT_BY_ID',
            payload: id,
          });
        }
      }
    },
    [dispatch, selectFiberID, selectFiberName, store]
  );

  if (isProfiling) {
    batchedUpdates(() => {
      if (selectedCommitIndex !== null) {
        selectCommitIndex(null);
      }
      if (selectedFiberID !== null) {
        selectFiberID(null);
        selectFiberName(null);
      }
      if (selectedInteractionID !== null) {
        selectInteraction(null);
      }
    });
  }

  const value = useMemo(
    () => ({
      selectedTabID,
      selectTab,

      hasProfilingData,
      isProcessingData,
      isProfiling,
      profilingData,
      startProfiling,
      stopProfiling,

      rootID,
      setRootID,

      isCommitFilterEnabled,
      setIsCommitFilterEnabled,
      minCommitDuration,
      setMinCommitDuration,

      selectedCommitIndex,
      selectCommitIndex,

      selectedFiberID,
      selectedFiberName,
      selectFiber,

      selectedInteractionID,
      selectInteraction,
    }),
    [
      selectedTabID,
      selectTab,

      hasProfilingData,
      isProcessingData,
      isProfiling,
      profilingData,
      startProfiling,
      stopProfiling,

      rootID,
      setRootID,

      isCommitFilterEnabled,
      setIsCommitFilterEnabled,
      minCommitDuration,
      setMinCommitDuration,

      selectedCommitIndex,
      selectCommitIndex,

      selectedFiberID,
      selectedFiberName,
      selectFiber,

      selectedInteractionID,
      selectInteraction,
    ]
  );

  return (
    <ProfilerContext.Provider value={value}>
      {children}
    </ProfilerContext.Provider>
  );
}

export { ProfilerContext, ProfilerContextController };
