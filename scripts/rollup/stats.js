'use strict';

const Table = require('cli-table');
const filesize = require('filesize');
const chalk = require('chalk');
const join = require('path').join;
const fs = require('fs');
const prevBuildResults = require('./results.json');

const currentBuildResults = {
  // Mutated inside build.js during a build run.
  // We make a copy so that partial rebuilds don't erase other stats.
  bundleSizes: [...prevBuildResults.bundleSizes],
};

function saveResults() {
  fs.writeFileSync(
    join('scripts', 'rollup', 'results.json'),
    JSON.stringify(currentBuildResults, null, 2)
  );
}

function fractionalChange(prev, current) {
  return (current - prev) / prev;
}

function percentChangeString(change) {
  if (!isFinite(change)) {
    // When a new package is created
    return 'n/a';
  }
  const formatted = (change * 100).toFixed(1);
  if (/^-|^0(?:\.0+)$/.test(formatted)) {
    return `${formatted}%`;
  } else {
    return `+${formatted}%`;
  }
}

const resultsHeaders = [
  'Bundle',
  'Prev Size',
  'Current Size',
  'Diff',
  'Prev Gzip',
  'Current Gzip',
  'Diff',
];

function generateResultsArray(current, prevResults) {
  return current.bundleSizes
    .map(result => {
      const prev = prevResults.bundleSizes.filter(
        res =>
          res.filename === result.filename &&
          res.bundleType === result.bundleType
      )[0];
      if (result === prev) {
        // We didn't rebuild this bundle.
        return;
      }

      const size = result.size;
      const gzip = result.gzip;
      let prevSize = prev ? prev.size : 0;
      let prevGzip = prev ? prev.gzip : 0;

      return {
        filename: result.filename,
        bundleType: result.bundleType,
        packageName: result.packageName,
        prevSize: filesize(prevSize),
        prevFileSize: filesize(size),
        prevFileSizeChange: fractionalChange(prevSize, size),
        prevGzip: filesize(prevGzip),
        prevGzipSize: filesize(gzip),
        prevGzipSizeChange: fractionalChange(prevGzip, gzip),
      };
      // Strip any nulls
    })
    .filter(f => f);
}

function printResults() {
  const table = new Table({
    head: resultsHeaders.map(label => chalk.gray.yellow(label)),
  });

  const results = generateResultsArray(currentBuildResults, prevBuildResults);
  results.forEach(result => {
    table.push([
      chalk.white.bold(`${result.filename}  (${result.bundleType})`),
      chalk.gray.bold(result.prevSize),
      chalk.white.bold(result.prevFileSize),
      percentChangeString(result.prevFileSizeChange),
      chalk.gray.bold(result.prevGzip),
      chalk.white.bold(result.prevGzipSize),
      percentChangeString(result.prevGzipSizeChange),
    ]);
  });

  return table.toString();
}

module.exports = {
  currentBuildResults,
  generateResultsArray,
  printResults,
  saveResults,
  resultsHeaders,
};
