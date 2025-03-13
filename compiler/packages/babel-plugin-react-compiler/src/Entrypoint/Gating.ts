/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {NodePath} from '@babel/core';
import * as t from '@babel/types';
import {PluginOptions} from './Options';
import {CompilerError} from '../CompilerError';

export function insertGatedFunctionDeclaration(
  fnPath: NodePath<
    t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression
  >,
  compiled:
    | t.FunctionDeclaration
    | t.ArrowFunctionExpression
    | t.FunctionExpression,
  gating: NonNullable<PluginOptions['gating']>,
  referencedBeforeDeclaration: boolean,
): void {
  if (referencedBeforeDeclaration) {
    const identifier =
      fnPath.node.type === 'FunctionDeclaration' ? fnPath.node.id : null;
    CompilerError.invariant(false, {
      reason: `Encountered a function used before its declaration, which breaks Forget's gating codegen due to hoisting`,
      description: `Rewrite the reference to ${identifier?.name ?? 'this function'} to not rely on hoisting to fix this issue`,
      loc: identifier?.loc ?? null,
      suggestions: null,
    });
  } else {
    const gatingExpression = t.conditionalExpression(
      t.callExpression(t.identifier(gating.importSpecifierName), []),
      buildFunctionExpression(compiled),
      buildFunctionExpression(fnPath.node),
    );

    /*
     * Convert function declarations to named variables *unless* this is an
     * `export default function ...` since `export default const ...` is
     * not supported. For that case we fall through to replacing w the raw
     * conditional expression
     */
    if (
      fnPath.parentPath.node.type !== 'ExportDefaultDeclaration' &&
      fnPath.node.type === 'FunctionDeclaration' &&
      fnPath.node.id != null
    ) {
      fnPath.replaceWith(
        t.variableDeclaration('const', [
          t.variableDeclarator(fnPath.node.id, gatingExpression),
        ]),
      );
    } else if (
      fnPath.parentPath.node.type === 'ExportDefaultDeclaration' &&
      fnPath.node.type !== 'ArrowFunctionExpression' &&
      fnPath.node.id != null
    ) {
      fnPath.insertAfter(
        t.exportDefaultDeclaration(t.identifier(fnPath.node.id.name)),
      );
      fnPath.parentPath.replaceWith(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(fnPath.node.id.name),
            gatingExpression,
          ),
        ]),
      );
    } else {
      fnPath.replaceWith(gatingExpression);
    }
  }
}

function buildFunctionExpression(
  node:
    | t.FunctionDeclaration
    | t.ArrowFunctionExpression
    | t.FunctionExpression,
): t.ArrowFunctionExpression | t.FunctionExpression {
  if (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  ) {
    return node;
  } else {
    const fn: t.FunctionExpression = {
      type: 'FunctionExpression',
      async: node.async,
      generator: node.generator,
      loc: node.loc ?? null,
      id: node.id ?? null,
      params: node.params,
      body: node.body,
    };
    return fn;
  }
}
