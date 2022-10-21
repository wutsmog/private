/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const ReactForgetBabelPlugin = require("../../dist").default;
const babelJest = require("babel-jest");
const { readFileSync } = require("fs");

module.exports = (useForget) => {
  function createTransformer() {
    return babelJest.createTransformer({
      passPerPreset: true,
      presets: [
        "@babel/preset-typescript",
        {
          plugins: [
            "@babel/plugin-syntax-jsx",
            ...(useForget
              ? [
                  [
                    ReactForgetBabelPlugin,
                    {
                      // Jest hashes the babel config as a cache breaker.
                      cacheBreaker: readFileSync("dist/HASH", "utf8"),
                    },
                  ],
                ]
              : []),
          ],
        },
        "@babel/preset-react",
        {
          plugins: [
            [
              function BabelPluginRewriteRequirePath(babel) {
                return {
                  visitor: {
                    CallExpression(path) {
                      if (path.node.callee.name === "require") {
                        const arg = path.node.arguments[0];
                        if (arg.type === "StringLiteral") {
                          // The compiler adds requires of "React", which is expected to be a wrapper
                          // around the "react" package. For tests, we just rewrite the require.
                          if (arg.value === "React") {
                            arg.value = "react";
                          }
                        }
                      }
                    },
                  },
                };
              },
            ],
            "@babel/plugin-transform-modules-commonjs",
          ],
        },
      ],
      targets: {
        esmodules: true,
      },
    });
  }

  return {
    createTransformer,
  };
};
