'use strict';

var fs = require('fs');
var grunt = require('grunt');

var src = 'packages/react-noop-renderer/';
var dest = 'build/packages/react-noop-renderer/';
var modSrc = 'build/node_modules/react-noop-renderer/lib';
var lib = dest + 'lib/';

function buildRelease() {
  if (grunt.file.exists(dest)) {
    grunt.file.delete(dest);
  }

  // Copy to build/packages/react-noop-renderer
  var mappings = [].concat(
    grunt.file.expandMapping('**/*', dest, {cwd: src}),
    grunt.file.expandMapping('**/*', lib, {cwd: modSrc}),
    grunt.file.expandMapping('{LICENSE,PATENTS}', dest)
  );
  mappings.forEach(function(mapping) {
    var mappingSrc = mapping.src[0];
    var mappingDest = mapping.dest;
    if (grunt.file.isDir(mappingSrc)) {
      grunt.file.mkdir(mappingDest);
    } else {
      grunt.file.copy(mappingSrc, mappingDest);
    }
  });
}

function packRelease() {
  var done = this.async();
  var spawnCmd = {
    cmd: 'npm',
    args: ['pack', 'packages/react-noop-renderer'],
    opts: {
      cwd: 'build/',
    },
  };
  grunt.util.spawn(spawnCmd, function() {
    var buildSrc = 'build/react-noop-renderer-' + grunt.config.data.pkg.version + '.tgz';
    var buildDest = 'build/packages/react-noop-renderer.tgz';
    fs.rename(buildSrc, buildDest, done);
  });
}

module.exports = {
  buildRelease: buildRelease,
  packRelease: packRelease,
};
