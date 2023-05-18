/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const chalk = require('chalk');
const fs = require('fs');
const mkdirp = require('mkdirp');
const inlinedHostConfigs = require('../shared/inlinedHostConfigs');

const configTemplate = fs
  .readFileSync(__dirname + '/config/flowconfig')
  .toString();

function writeConfig(
  renderer,
  rendererInfo,
  isServerSupported,
  isFlightSupported,
) {
  const folder = __dirname + '/' + renderer;
  mkdirp.sync(folder);

  isFlightSupported =
    isFlightSupported === true ||
    (isServerSupported && isFlightSupported !== false);

  const serverRenderer = isServerSupported ? renderer : 'custom';
  const flightRenderer = isFlightSupported ? renderer : 'custom';

  const ignoredPaths = [];

  inlinedHostConfigs.forEach(otherRenderer => {
    if (otherRenderer === rendererInfo) {
      return;
    }
    otherRenderer.paths.forEach(otherPath => {
      if (rendererInfo.paths.indexOf(otherPath) !== -1) {
        return;
      }
      ignoredPaths.push(`.*/packages/${otherPath}`);
    });

    if (
      otherRenderer.shortName !== serverRenderer &&
      otherRenderer.shortName !== flightRenderer
    ) {
      ignoredPaths.push(
        `.*/packages/.*/forks/.*\\.${otherRenderer.shortName}.js`,
      );
    }
  });

  const config = configTemplate
    .replace(
      '%CI_MAX_WORKERS%\n',
      // On CI, we seem to need to limit workers.
      process.env.CI ? 'server.max_workers=4\n' : '',
    )
    .replace(
      '%REACT_RENDERER_FLOW_OPTIONS%',
      `
module.name_mapper='ReactFiberConfig$$' -> 'forks/ReactFiberConfig.${renderer}'
module.name_mapper='ReactServerStreamConfig$$' -> 'forks/ReactServerStreamConfig.${serverRenderer}'
module.name_mapper='ReactFizzConfig$$' -> 'forks/ReactFizzConfig.${serverRenderer}'
module.name_mapper='ReactFlightServerConfig$$' -> 'forks/ReactFlightServerConfig.${flightRenderer}'
module.name_mapper='ReactFlightClientConfig$$' -> 'forks/ReactFlightClientConfig.${flightRenderer}'
module.name_mapper='react-devtools-feature-flags' -> 'react-devtools-shared/src/config/DevToolsFeatureFlags.default'
    `.trim(),
    )
    .replace('%REACT_RENDERER_FLOW_IGNORES%', ignoredPaths.join('\n'));

  const disclaimer = `
# ---------------------------------------------------------------#
# NOTE: this file is generated.                                  #
# If you want to edit it, open ./scripts/flow/config/flowconfig. #
# Then run Yarn for changes to take effect.                      #
# ---------------------------------------------------------------#
  `.trim();

  const configFile = folder + '/.flowconfig';
  let oldConfig;
  try {
    oldConfig = fs.readFileSync(configFile).toString();
  } catch (err) {
    oldConfig = null;
  }
  const newConfig = `
${disclaimer}
${config}
${disclaimer}
`.trim();

  if (newConfig !== oldConfig) {
    fs.writeFileSync(configFile, newConfig);
    console.log(chalk.dim('Wrote a Flow config to ' + configFile));
  }
}

// Write multiple configs in different folders
// so that we can run those checks in parallel if we want.
inlinedHostConfigs.forEach(rendererInfo => {
  if (rendererInfo.isFlowTyped) {
    writeConfig(
      rendererInfo.shortName,
      rendererInfo,
      rendererInfo.isServerSupported,
      rendererInfo.isFlightSupported,
    );
  }
});
