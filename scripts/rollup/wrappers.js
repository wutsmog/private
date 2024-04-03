'use strict';

const {resolve} = require('path');
const {readFileSync} = require('fs');
const {signFile, getSigningToken} = require('signedsource');
const {bundleTypes, moduleTypes} = require('./bundles');

const {
  NODE_ES2015,
  ESM_DEV,
  ESM_PROD,
  UMD_DEV,
  UMD_PROD,
  UMD_PROFILING,
  NODE_DEV,
  NODE_PROD,
  NODE_PROFILING,
  BUN_DEV,
  BUN_PROD,
  FB_WWW_DEV,
  FB_WWW_PROD,
  FB_WWW_PROFILING,
  RN_OSS_DEV,
  RN_OSS_PROD,
  RN_OSS_PROFILING,
  RN_FB_DEV,
  RN_FB_PROD,
  RN_FB_PROFILING,
  BROWSER_SCRIPT,
} = bundleTypes;

const {RECONCILER} = moduleTypes;

const USE_STRICT_HEADER_REGEX = /'use strict';\n+/;

function registerInternalModuleStart(globalName) {
  const path = resolve(__dirname, 'wrappers', 'registerInternalModuleBegin.js');
  const file = readFileSync(path);
  return String(file).trim();
}

function registerInternalModuleStop(globalName) {
  const path = resolve(__dirname, 'wrappers', 'registerInternalModuleEnd.js');
  const file = readFileSync(path);

  // Remove the 'use strict' directive from the footer.
  // This directive is only meaningful when it is the first statement in a file or function.
  return String(file).replace(USE_STRICT_HEADER_REGEX, '').trim();
}

const license = ` * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.`;

const topLevelDefinitionWrappers = {
  /***************** NODE_ES2015 *****************/
  [NODE_ES2015](source, globalName, filename, moduleType) {
    return `'use strict';

${source}`;
  },

  /***************** ESM_DEV *****************/
  [ESM_DEV](source, globalName, filename, moduleType) {
    return source;
  },

  /***************** ESM_PROD *****************/
  [ESM_PROD](source, globalName, filename, moduleType) {
    return source;
  },

  /***************** BUN_DEV *****************/
  [BUN_DEV](source, globalName, filename, moduleType) {
    return source;
  },

  /***************** BUN_PROD *****************/
  [BUN_PROD](source, globalName, filename, moduleType) {
    return source;
  },

  /***************** UMD_DEV *****************/
  [UMD_DEV](source, globalName, filename, moduleType) {
    return source;
  },

  /***************** UMD_PROD *****************/
  [UMD_PROD](source, globalName, filename, moduleType) {
    return `(function(){${source}})();`;
  },

  /***************** UMD_PROFILING *****************/
  [UMD_PROFILING](source, globalName, filename, moduleType) {
    return `(function(){${source}})();`;
  },

  /***************** NODE_DEV *****************/
  [NODE_DEV](source, globalName, filename, moduleType) {
    return `'use strict';

if (process.env.NODE_ENV !== "production") {
  (function() {
${source}
  })();
}`;
  },

  /***************** NODE_PROD *****************/
  [NODE_PROD](source, globalName, filename, moduleType) {
    return source;
  },

  /***************** NODE_PROFILING *****************/
  [NODE_PROFILING](source, globalName, filename, moduleType) {
    return source;
  },

  /****************** FB_WWW_DEV ******************/
  [FB_WWW_DEV](source, globalName, filename, moduleType) {
    return `'use strict';

if (__DEV__) {
  (function() {
${source}
  })();
}`;
  },

  /****************** FB_WWW_PROD ******************/
  [FB_WWW_PROD](source, globalName, filename, moduleType) {
    return source;
  },

  /****************** FB_WWW_PROFILING ******************/
  [FB_WWW_PROFILING](source, globalName, filename, moduleType) {
    return source;
  },

  /****************** RN_OSS_DEV ******************/
  [RN_OSS_DEV](source, globalName, filename, moduleType) {
    return `'use strict';

if (__DEV__) {
  (function() {
${source}
  })();
}`;
  },

  /****************** RN_OSS_PROD ******************/
  [RN_OSS_PROD](source, globalName, filename, moduleType) {
    return source;
  },

  /****************** RN_OSS_PROFILING ******************/
  [RN_OSS_PROFILING](source, globalName, filename, moduleType) {
    return source;
  },

  /****************** RN_FB_DEV ******************/
  [RN_FB_DEV](source, globalName, filename, moduleType) {
    return `'use strict';

if (__DEV__) {
  (function() {
${source}
  })();
}`;
  },

  /****************** RN_FB_PROD ******************/
  [RN_FB_PROD](source, globalName, filename, moduleType) {
    return source;
  },

  /****************** RN_FB_PROFILING ******************/
  [RN_FB_PROFILING](source, globalName, filename, moduleType) {
    return source;
  },
};

const reconcilerWrappers = {
  /***************** NODE_DEV (reconciler only) *****************/
  [NODE_DEV](source, globalName, filename, moduleType) {
    return `'use strict';

if (process.env.NODE_ENV !== "production") {
  module.exports = function $$$reconciler($$$config) {
    var exports = {};
${source}
    return exports;
  };
  module.exports.default = module.exports;
  Object.defineProperty(module.exports, "__esModule", { value: true });
}
`;
  },

  /***************** NODE_PROD (reconciler only) *****************/
  [NODE_PROD](source, globalName, filename, moduleType) {
    return `module.exports = function $$$reconciler($$$config) {

    var exports = {};
${source}
    return exports;
};
module.exports.default = module.exports;
Object.defineProperty(module.exports, "__esModule", { value: true });
`;
  },

  /***************** NODE_PROFILING (reconciler only) *****************/
  [NODE_PROFILING](source, globalName, filename, moduleType) {
    return `module.exports = function $$$reconciler($$$config) {
    var exports = {};
${source}
    return exports;
};
module.exports.default = module.exports;
Object.defineProperty(module.exports, "__esModule", { value: true });
`;
  },
};

const licenseHeaderWrappers = {
  /***************** NODE_ES2015 *****************/
  [NODE_ES2015](source, globalName, filename, moduleType) {
    return `/**
 * @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /***************** ESM_DEV *****************/
  [ESM_DEV](source, globalName, filename, moduleType) {
    return `/**
* @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /***************** ESM_PROD *****************/
  [ESM_PROD](source, globalName, filename, moduleType) {
    return `/**
* @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /***************** BUN_DEV *****************/
  [BUN_DEV](source, globalName, filename, moduleType) {
    return `/**
* @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /***************** BUN_PROD *****************/
  [BUN_PROD](source, globalName, filename, moduleType) {
    return `/**
 * @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /***************** UMD_DEV *****************/
  [UMD_DEV](source, globalName, filename, moduleType) {
    return `/**
 * @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /***************** UMD_PROD *****************/
  [UMD_PROD](source, globalName, filename, moduleType) {
    return `/**
 * @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /***************** UMD_PROFILING *****************/
  [UMD_PROFILING](source, globalName, filename, moduleType) {
    return `/**
 * @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /***************** NODE_DEV *****************/
  [NODE_DEV](source, globalName, filename, moduleType) {
    return `/**
 * @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /***************** NODE_PROD *****************/
  [NODE_PROD](source, globalName, filename, moduleType) {
    return `/**
 * @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /***************** NODE_PROFILING *****************/
  [NODE_PROFILING](source, globalName, filename, moduleType) {
    return `/**
 * @license React
 * ${filename}
 *
${license}
 */

${source}`;
  },

  /****************** FB_WWW_DEV ******************/
  [FB_WWW_DEV](source, globalName, filename, moduleType) {
    return `/**
${license}
 *
 * @noflow
 * @nolint
 * @preventMunge
 * @preserve-invariant-messages
 */

${source}`;
  },

  /****************** FB_WWW_PROD ******************/
  [FB_WWW_PROD](source, globalName, filename, moduleType) {
    return `/**
${license}
 *
 * @noflow
 * @nolint
 * @preventMunge
 * @preserve-invariant-messages
 */

${source}`;
  },

  /****************** FB_WWW_PROFILING ******************/
  [FB_WWW_PROFILING](source, globalName, filename, moduleType) {
    return `/**
${license}
 *
 * @noflow
 * @nolint
 * @preventMunge
 * @preserve-invariant-messages
 */

${source}`;
  },

  /****************** RN_OSS_DEV ******************/
  [RN_OSS_DEV](source, globalName, filename, moduleType) {
    return signFile(`/**
${license}
 *
 * @noflow
 * @nolint
 * @preventMunge
 * ${getSigningToken()}
 */

${source}`);
  },

  /****************** RN_OSS_PROD ******************/
  [RN_OSS_PROD](source, globalName, filename, moduleType) {
    return signFile(`/**
${license}
 *
 * @noflow
 * @nolint
 * @preventMunge
 * ${getSigningToken()}
 */

${source}`);
  },

  /****************** RN_OSS_PROFILING ******************/
  [RN_OSS_PROFILING](source, globalName, filename, moduleType) {
    return signFile(`/**
${license}
 *
 * @noflow
 * @nolint
 * @preventMunge
 * ${getSigningToken()}
 */

${source}`);
  },

  /****************** RN_FB_DEV ******************/
  [RN_FB_DEV](source, globalName, filename, moduleType) {
    return signFile(`/**
${license}
 *
 * @noflow
 * @nolint
 * @preventMunge
 * ${getSigningToken()}
 */

${source}`);
  },

  /****************** RN_FB_PROD ******************/
  [RN_FB_PROD](source, globalName, filename, moduleType) {
    return signFile(`/**
${license}
 *
 * @noflow
 * @nolint
 * @preventMunge
 * ${getSigningToken()}
 */

${source}`);
  },

  /****************** RN_FB_PROFILING ******************/
  [RN_FB_PROFILING](source, globalName, filename, moduleType) {
    return signFile(`/**
${license}
 *
 * @noflow
 * @nolint
 * @preventMunge
 * ${getSigningToken()}
 */

${source}`);
  },
};

function wrapWithTopLevelDefinitions(
  source,
  bundleType,
  globalName,
  filename,
  moduleType,
  wrapWithModuleBoundaries
) {
  if (wrapWithModuleBoundaries) {
    switch (bundleType) {
      case NODE_DEV:
      case NODE_PROFILING:
      case FB_WWW_DEV:
      case FB_WWW_PROFILING:
      case RN_OSS_DEV:
      case RN_OSS_PROFILING:
      case RN_FB_DEV:
      case RN_FB_PROFILING:
        // Remove the 'use strict' directive from source.
        // The module start wrapper will add its own.
        // This directive is only meaningful when it is the first statement in a file or function.
        source = source.replace(USE_STRICT_HEADER_REGEX, '');

        // Certain DEV and Profiling bundles should self-register their own module boundaries with DevTools.
        // This allows the Timeline to de-emphasize (dim) internal stack frames.
        source = `
          ${registerInternalModuleStart(globalName)}
          ${source}
          ${registerInternalModuleStop(globalName)}
        `;
        break;
    }
  }

  if (bundleType === BROWSER_SCRIPT) {
    // Bundles of type BROWSER_SCRIPT get sent straight to the browser without
    // additional processing. So we should exclude any extra wrapper comments.
    return source;
  }

  if (moduleType === RECONCILER) {
    // Standalone reconciler is only used by third-party renderers.
    // It is handled separately.
    const wrapper = reconcilerWrappers[bundleType];
    if (typeof wrapper !== 'function') {
      throw new Error(
        `Unsupported build type for the reconciler package: ${bundleType}.`
      );
    }

    return wrapper(source, globalName, filename, moduleType);
  }

  // All the other packages.
  const wrapper = topLevelDefinitionWrappers[bundleType];
  if (typeof wrapper !== 'function') {
    throw new Error(`Unsupported build type: ${bundleType}.`);
  }

  return wrapper(source, globalName, filename, moduleType);
}

function wrapWithLicenseHeader(
  source,
  bundleType,
  globalName,
  filename,
  moduleType
) {
  if (bundleType === BROWSER_SCRIPT) {
    // Bundles of type BROWSER_SCRIPT get sent straight to the browser without
    // additional processing. So we should exclude any extra wrapper comments.
    return source;
  }

  // All the other packages.
  const wrapper = licenseHeaderWrappers[bundleType];
  if (typeof wrapper !== 'function') {
    throw new Error(`Unsupported build type: ${bundleType}.`);
  }

  return wrapper(source, globalName, filename, moduleType);
}

module.exports = {
  wrapWithTopLevelDefinitions,
  wrapWithLicenseHeader,
};
