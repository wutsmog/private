'use strict';

const {join} = require('path');
const theme = require('../theme');
const {exec} = require('child-process-promise');
const {existsSync} = require('fs');
const {logPromise} = require('../utils');

if (process.env.GH_TOKEN == null) {
  console.log(
    theme`{error Expected GH_TOKEN to be provided as an env variable}`
  );
  process.exit(1);
}

const OWNER = 'facebook';
const REPO = 'react';
const WORKFLOW_ID = 'runtime_build_and_test.yml';
const GITHUB_HEADERS = `
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${process.env.GH_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28"`.trim();

function getWorkflowId() {
  if (
    existsSync(join(__dirname, `../../../.github/workflows/${WORKFLOW_ID}`))
  ) {
    return WORKFLOW_ID;
  } else {
    throw new Error(
      `Incorrect workflow ID: .github/workflows/${WORKFLOW_ID} does not exist. Please check the name of the workflow being downloaded from.`
    );
  }
}

async function getWorkflowRunId(commit) {
  const res = await exec(
    `curl -L ${GITHUB_HEADERS} https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${getWorkflowId()}/runs?head_sha=${commit}&branch=main&exclude_pull_requests=true`
  );

  const json = JSON.parse(res.stdout);
  let workflowRun;
  if (json.total_count === 1) {
    workflowRun = json.workflow_runs[0];
  } else {
    workflowRun = json.workflow_runs.find(
      run => run.head_sha === commit && run.head_branch === 'main'
    );
  }

  if (workflowRun == null || workflowRun.id == null) {
    console.log(
      theme`{error The workflow run for the specified commit (${commit}) could not be found.}`
    );
    process.exit(1);
  }

  return workflowRun.id;
}

async function getArtifact(workflowRunId, artifactName) {
  const res = await exec(
    `curl -L ${GITHUB_HEADERS} https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${workflowRunId}/artifacts?per_page=100&name=${artifactName}`
  );

  const json = JSON.parse(res.stdout);
  let artifact;
  if (json.total_count === 1) {
    artifact = json.artifacts[0];
  } else {
    artifact = json.artifacts.find(
      _artifact => _artifact.name === artifactName
    );
  }

  if (artifact == null) {
    console.log(
      theme`{error The specified workflow run (${workflowRunId}) does not contain any build artifacts.}`
    );
    process.exit(1);
  }

  return artifact;
}

async function downloadArtifactsFromGitHub(commit, releaseChannel) {
  const workflowRunId = await getWorkflowRunId(commit);
  const artifact = await getArtifact(workflowRunId, 'artifacts_combined');

  // Download and extract artifact
  const cwd = join(__dirname, '..', '..', '..');
  await exec(`rm -rf ./build`, {cwd});
  await exec(
    `curl -L ${GITHUB_HEADERS} ${artifact.archive_download_url} \
    > a.zip && unzip a.zip -d . && rm a.zip build2.tgz && tar -xvzf build.tgz && rm build.tgz`,
    {
      cwd,
    }
  );

  // Copy to staging directory
  // TODO: Consider staging the release in a different directory from the CI
  // build artifacts: `./build/node_modules` -> `./staged-releases`
  if (!existsSync(join(cwd, 'build'))) {
    await exec(`mkdir ./build`, {cwd});
  } else {
    await exec(`rm -rf ./build/node_modules`, {cwd});
  }
  let sourceDir;
  // TODO: Rename release channel to `next`
  if (releaseChannel === 'stable') {
    sourceDir = 'oss-stable';
  } else if (releaseChannel === 'experimental') {
    sourceDir = 'oss-experimental';
  } else if (releaseChannel === 'rc') {
    sourceDir = 'oss-stable-rc';
  } else if (releaseChannel === 'latest') {
    sourceDir = 'oss-stable-semver';
  } else {
    console.error('Internal error: Invalid release channel: ' + releaseChannel);
    process.exit(releaseChannel);
  }
  await exec(`cp -r ./build/${sourceDir} ./build/node_modules`, {cwd});
}

async function downloadBuildArtifacts(commit, releaseChannel) {
  const label = theme`commit {commit ${commit}})`;
  return logPromise(
    downloadArtifactsFromGitHub(commit, releaseChannel),
    theme`Downloading artifacts from GitHub for ${label}`
  );
}

module.exports = {
  downloadBuildArtifacts,
};
