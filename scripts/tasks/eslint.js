/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

var path = require('path');
var spawn = require('child_process').spawn;

var extension = process.platform === 'win32' ? '.cmd' : '';

spawn(
  path.join('node_modules', '.bin', 'eslint' + extension),
  ['.', '--max-warnings=0'],
  {
    // Allow colors to pass through
    stdio: 'inherit',
  }
).on('close', function(code) {
  if (code !== 0) {
    console.error('Lint failed');
  } else {
    console.log('Lint passed');
  }

  process.exit(code);
});
