/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/// <reference path="./plugin-syntax-jsx.d.ts" />

import type * as BabelCore from "@babel/core";
import jsx from "@babel/plugin-syntax-jsx";
import * as t from "@babel/types";
import {
  CompilerError,
  CompilerErrorDetail,
  ErrorSeverity,
} from "../CompilerError";
import { compile } from "../CompilerPipeline";
import { GeneratedSource } from "../HIR";
import {
  GatingOptions,
  PluginOptions,
  parsePluginOptions,
} from "./PluginOptions";

type BabelPluginPass = {
  opts: PluginOptions;
  filename: string | null;
};

function hasUseForgetDirective(directive: t.Directive): boolean {
  return directive.value.value === "use forget";
}

function hasAnyUseForgetDirectives(directives: t.Directive[]): boolean {
  for (const directive of directives) {
    if (hasUseForgetDirective(directive)) {
      return true;
    }
  }
  return false;
}

/**
 * The React Forget Babel Plugin
 * @param {*} _babel
 * @returns
 */
export default function ReactForgetBabelPlugin(
  _babel: typeof BabelCore
): BabelCore.PluginObj {
  let hasForgetCompiledCode: boolean = false;

  function visitFn(
    fn: BabelCore.NodePath<t.FunctionDeclaration>,
    pass: BabelPluginPass
  ): void {
    try {
      const compiled = compile(fn, pass.opts.environment);

      if (pass.opts.gating != null) {
        // Rename existing function
        if (fn.node.id == null) {
          CompilerError.invariant(
            "FunctionDeclaration must have a name",
            fn.node.loc ?? GeneratedSource
          );
        }
        const original = fn.node.id;
        fn.node.id = addSuffix(fn.node.id, "_uncompiled");

        // Rename and append compiled function
        if (compiled.id == null) {
          CompilerError.invariant(
            "FunctionDeclaration must produce a name",
            fn.node.loc ?? GeneratedSource
          );
        }
        compiled.id = addSuffix(compiled.id, "_forget");
        const compiledFn = fn.insertAfter(compiled)[0];
        compiledFn.skip();

        // Build and append gating test
        compiledFn.insertAfter(
          buildGatingTest({
            originalFnDecl: fn,
            compiledIdent: compiled.id,
            originalIdent: original,
            gating: pass.opts.gating,
          })
        );
      } else {
        fn.replaceWith(compiled);
      }

      hasForgetCompiledCode = true;
    } catch (err) {
      if (pass.opts.logger && err) {
        pass.opts.logger.logEvent("err", err);
      }
      /** Always throw if the flag is enabled, otherwise we only throw if the error is critical
       * (eg an invariant is broken, meaning the compiler may be buggy). See
       * {@link CompilerError.isCritical} for mappings.
       * */
      if (
        pass.opts.panicOnBailout ||
        !(err instanceof CompilerError) ||
        (err instanceof CompilerError && err.isCritical())
      ) {
        throw err;
      } else {
        console.error(formatErrorsForConsole(err, pass.filename ?? null));
      }
    } finally {
      // We are generating a new FunctionDeclaration node, so we must skip over it or this
      // traversal will loop infinitely.
      fn.skip();
    }
  }

  const visitor = {
    FunctionDeclaration(
      fn: BabelCore.NodePath<t.FunctionDeclaration>,
      pass: BabelPluginPass
    ): void {
      if (!shouldCompile(fn, pass)) {
        return;
      }

      visitFn(fn, pass);
    },

    ArrowFunctionExpression(
      fn: BabelCore.NodePath<t.ArrowFunctionExpression>,
      pass: BabelPluginPass
    ): void {
      if (!shouldCompile(fn, pass)) {
        return;
      }

      const loweredFn = buildFunctionDeclaration(fn);
      if (loweredFn instanceof CompilerError) {
        const error = loweredFn;

        const options = parsePluginOptions(pass.opts);
        if (options.logger != null) {
          options.logger.logEvent("err", error);
        }

        if (options.panicOnBailout || error.isCritical()) {
          throw error;
        } else {
          console.error(formatErrorsForConsole(error, pass.filename));
        }
        return;
      }

      visitFn(loweredFn, pass);
    },
  };

  return {
    name: "react-forget",
    inherits: jsx,
    visitor: {
      // Note: Babel does some "smart" merging of visitors across plugins, so even if A is inserted
      // prior to B, if A does not have a Program visitor and B does, B will run first. We always
      // want Forget to run true to source as possible.
      Program(path, pass): void {
        const options = parsePluginOptions(pass.opts);

        const violations = [];
        const fileComments = pass.file.ast.comments;
        let fileHasUseForgetDirective = false;
        if (Array.isArray(fileComments)) {
          for (const comment of fileComments) {
            if (
              /eslint-disable(-next-line)? react-hooks\/(exhaustive-deps|rules-of-hooks)/.test(
                comment.value
              )
            ) {
              violations.push(comment);
            }
          }
        }

        if (violations.length > 0) {
          path.traverse({
            Directive(path) {
              if (hasUseForgetDirective(path.node)) {
                fileHasUseForgetDirective = true;
              }
            },
          });

          const reason = `One or more React eslint rules is disabled`;
          const error = new CompilerError();
          for (const violation of violations) {
            if (options.logger != null) {
              options.logger.logEvent("err", {
                reason,
                filename: pass.filename,
                violation,
              });
            }

            error.pushErrorDetail(
              new CompilerErrorDetail({
                reason,
                description: violation.value.trim(),
                severity: ErrorSeverity.UnsafeInput,
                codeframe: null,
                loc: violation.loc ?? null,
              })
            );
          }

          if (fileHasUseForgetDirective) {
            if (options.panicOnBailout || error.isCritical()) {
              throw error;
            } else {
              console.error(
                formatErrorsForConsole(error, pass.filename ?? null)
              );
            }
          }

          return;
        }

        path.traverse(visitor, {
          ...pass,
          opts: { ...pass.opts, ...options },
          filename: pass.filename ?? null,
        });

        // If there isn't already an import of * as React, insert it so useMemoCache doesn't
        // throw
        if (hasForgetCompiledCode) {
          let didInsertUseMemoCache = false;
          let hasExistingReactImport = false;
          path.traverse({
            CallExpression(callExprPath) {
              const callee = callExprPath.get("callee");
              const args = callExprPath.get("arguments");
              if (
                callee.isIdentifier() &&
                callee.node.name === "useMemoCache" &&
                args.length === 1 &&
                args[0].isNumericLiteral()
              ) {
                didInsertUseMemoCache = true;
              }
            },
            ImportDeclaration(importDeclPath) {
              if (isNonNamespacedImportOfReact(importDeclPath)) {
                hasExistingReactImport = true;
              }
            },
          });
          // If Forget did successfully compile inject/update an import of
          // `import {unstable_useMemoCache as useMemoCache} from 'react'` and rename
          // `React.unstable_useMemoCache(n)` to `useMemoCache(n)`;
          if (didInsertUseMemoCache) {
            if (hasExistingReactImport) {
              let didUpdateImport = false;
              path.traverse({
                ImportDeclaration(importDeclPath) {
                  if (isNonNamespacedImportOfReact(importDeclPath)) {
                    importDeclPath.pushContainer(
                      "specifiers",
                      t.importSpecifier(
                        t.identifier("useMemoCache"),
                        t.identifier("unstable_useMemoCache")
                      )
                    );
                    didUpdateImport = true;
                  }
                },
              });
              if (didUpdateImport === false) {
                throw new Error(
                  "Expected an ImportDeclaration of react in order to update ImportSpecifiers with useMemoCache"
                );
              }
            } else {
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [
                    t.importSpecifier(
                      t.identifier("useMemoCache"),
                      t.identifier("unstable_useMemoCache")
                    ),
                  ],
                  t.stringLiteral("react")
                )
              );
            }
          }
          if (options.gating != null) {
            path.unshiftContainer(
              "body",
              buildImportForGatingModule(options.gating)
            );
          }
        }
      },
    },
  };
}

function shouldCompile(
  fn: BabelCore.NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
  pass: BabelPluginPass
): boolean {
  if (pass.opts.enableOnlyOnUseForgetDirective) {
    const body = fn.get("body");
    if (!body.isBlockStatement()) {
      return false;
    }
    if (!hasAnyUseForgetDirectives(body.node.directives)) {
      return false;
    }
  }

  if (fn.scope.getProgramParent() !== fn.scope.parent) {
    return false;
  }

  return true;
}

function formatErrorsForConsole(
  error: CompilerError,
  filename: string | null
): string {
  const filenameStr = filename ? `in ${filename}` : "";
  return error.details
    .map(
      (e) =>
        `[ReactForget] Skipping compilation of component ${filenameStr}: ${e.printErrorMessage()}`
    )
    .join("\n");
}

function makeError(
  reason: string,
  loc: t.SourceLocation | null
): CompilerError {
  const error = new CompilerError();
  error.pushErrorDetail(
    new CompilerErrorDetail({
      reason,
      description: null,
      severity: ErrorSeverity.InvalidInput,
      codeframe: null,
      loc,
    })
  );
  return error;
}

function buildFunctionDeclaration(
  fn: BabelCore.NodePath<t.ArrowFunctionExpression>
): BabelCore.NodePath<t.FunctionDeclaration> | CompilerError {
  if (!fn.parentPath.isVariableDeclarator()) {
    return makeError(
      "ArrowFunctionExpression must be declared in variable declaration",
      fn.node.loc ?? null
    );
  }
  const variableDeclarator = fn.parentPath;

  if (!variableDeclarator.parentPath.isVariableDeclaration()) {
    return makeError(
      "ArrowFunctionExpression must be a single declaration",
      fn.node.loc ?? null
    );
  }
  const variableDeclaration = variableDeclarator.parentPath;

  const id = variableDeclarator.get("id");
  if (!id.isIdentifier()) {
    return makeError(
      "ArrowFunctionExpression must have an id",
      fn.node.loc ?? null
    );
  }

  const rewrittenFn = variableDeclaration.replaceWith(
    t.functionDeclaration(
      id.node,
      fn.node.params,
      buildBlockStatement(fn),
      fn.node.generator,
      fn.node.async
    )
  )[0];
  fn.skip();
  return rewrittenFn;
}

function buildBlockStatement(
  fn: BabelCore.NodePath<t.ArrowFunctionExpression>
): t.BlockStatement {
  const body = fn.get("body");
  if (body.isExpression()) {
    const wrappedBody = body.replaceWith(
      t.blockStatement([t.returnStatement(body.node)])
    )[0];
    body.skip();

    return wrappedBody.node;
  }

  if (!body.isBlockStatement()) {
    CompilerError.invariant(
      "Body must be a BlockStatement",
      body.node.loc ?? GeneratedSource
    );
  }
  return body.node;
}

type GatingTestOptions = {
  originalFnDecl: BabelCore.NodePath<t.FunctionDeclaration>;
  compiledIdent: t.Identifier;
  originalIdent: t.Identifier;
  gating: GatingOptions;
};
function buildGatingTest({
  originalFnDecl,
  compiledIdent,
  originalIdent,
  gating,
}: GatingTestOptions): t.Node | t.Node[] {
  const testVarDecl = t.variableDeclaration("const", [
    t.variableDeclarator(
      originalIdent,
      t.conditionalExpression(
        t.callExpression(buildSpecifierIdent(gating), []),
        compiledIdent,
        originalFnDecl.node.id!
      )
    ),
  ]);

  // Re-export new declaration
  const parent = originalFnDecl.parentPath;
  if (t.isExportDefaultDeclaration(parent)) {
    // Re-add uncompiled function
    parent.replaceWith(originalFnDecl)[0].skip();

    // Add test and synthesize new export
    return [testVarDecl, t.exportDefaultDeclaration(originalIdent)];
  } else if (t.isExportNamedDeclaration(parent)) {
    // Re-add uncompiled function
    parent.replaceWith(originalFnDecl)[0].skip();

    // Add and export test
    return t.exportNamedDeclaration(testVarDecl);
  }

  // Just add the test, no need for re-export
  return testVarDecl;
}

function addSuffix(id: t.Identifier, suffix: string): t.Identifier {
  return t.identifier(`${id.name}${suffix}`);
}

function buildImportForGatingModule(
  gating: GatingOptions
): t.ImportDeclaration {
  const specifierIdent = buildSpecifierIdent(gating);
  return t.importDeclaration(
    [t.importSpecifier(specifierIdent, specifierIdent)],
    t.stringLiteral(gating.source)
  );
}

function buildSpecifierIdent(gating: GatingOptions): t.Identifier {
  return t.identifier(gating.importSpecifierName);
}

/**
 * Matches `import { ... } from 'react';`
 * but not `import * as React from 'react';`
 */
function isNonNamespacedImportOfReact(
  importDeclPath: BabelCore.NodePath<t.ImportDeclaration>
): boolean {
  return (
    importDeclPath.get("source").node.value === "react" &&
    importDeclPath
      .get("specifiers")
      .every((specifier) => specifier.isImportSpecifier())
  );
}
