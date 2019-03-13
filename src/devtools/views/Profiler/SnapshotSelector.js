// @flow

import React, { Fragment, Suspense, useContext } from 'react';
import Button from '../Button';
import ButtonIcon from '../ButtonIcon';
import { StoreContext } from '../context';
import { ProfilerContext } from './ProfilerContext';
import SnapshotCommitList from './SnapshotCommitList';

import styles from './SnapshotSelector.css';

export type Props = {||};

export default function SnapshotSelectorSuspense(_: Props) {
  return (
    <Suspense fallback={<SnapshotSelectorFallback />}>
      <SnapshotSelector />
    </Suspense>
  );
}

function SnapshotSelector(_: Props) {
  const { profilingCache } = useContext(StoreContext);
  const { commitIndex, rendererID, rootID, setCommitIndex } = useContext(
    ProfilerContext
  );

  if (rendererID === null || rootID === null) {
    return null;
  }

  // TODO (profiling) Parse the summary into something easier for the views to work with
  const profilingSummary = profilingCache.ProfilingSummary.read({
    rendererID: ((rendererID: any): number),
    rootID: ((rootID: any): number),
  });

  const numCommits = profilingSummary.commitDurations.length;

  if (numCommits === 0) {
    return null;
  }

  const viewNextCommit = () => {
    setCommitIndex(Math.min(commitIndex + 1, numCommits - 1));
  };
  const viewPrevCommit = () => {
    setCommitIndex(Math.max(commitIndex - 1, 0));
  };

  return (
    <Fragment>
      <div className={styles.VRule} />
      <div className={styles.SnapshotSelector}>
        <span className={styles.Number}>
          {`${commitIndex + 1}`.padStart(`${numCommits}`.length, '0')} /{' '}
          {numCommits}
        </span>
        <Button
          className={styles.Button}
          disabled={commitIndex <= 0}
          onClick={viewPrevCommit}
        >
          <ButtonIcon type="previous" />
        </Button>
        <div className={styles.Commits}>
          <SnapshotCommitList
            profilingSummary={profilingSummary}
            selectedCommitIndex={commitIndex}
            setCommitIndex={setCommitIndex}
            viewNextCommit={viewNextCommit}
            viewPrevCommit={viewPrevCommit}
          />
        </div>
        <Button
          className={styles.Button}
          disabled={commitIndex >= numCommits - 1}
          onClick={viewNextCommit}
        >
          <ButtonIcon type="next" />
        </Button>
      </div>
    </Fragment>
  );
}

function SnapshotSelectorFallback() {
  // TODO (profiling) Better loading UI
  return <div className={styles.SnapshotSelector}>Loading...</div>;
}
