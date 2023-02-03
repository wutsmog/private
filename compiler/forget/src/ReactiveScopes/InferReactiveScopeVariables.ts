/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import invariant from "invariant";
import {
  HIRFunction,
  Identifier,
  Instruction,
  InstructionValue,
  makeInstructionId,
  makeScopeId,
  Place,
  ReactiveScope,
  ScopeId,
} from "../HIR/HIR";
import { eachInstructionOperand } from "../HIR/visitors";
import DisjointSet from "../Utils/DisjointSet";
import { assertExhaustive } from "../Utils/utils";

/**
 * Note: this is the 1st of 4 passes that determine how to break a function into discrete
 * reactive scopes (independently memoizeable units of code):
 * 1. InferReactiveScopeVariables (this pass, on HIR) determines operands that mutate
 *    together and assigns them a unique reactive scope.
 * 2. AlignReactiveScopesToBlockScopes (on ReactiveFunction) aligns reactive scopes
 *    to block scopes.
 * 3. MergeOverlappingReactiveScopes (on ReactiveFunction) ensures that reactive
 *    scopes do not overlap, merging any such scopes.
 * 4. BuildReactiveBlocks (on ReactiveFunction) groups the statements for each scope into
 *    a ReactiveScopeBlock.
 *
 * For each mutable variable, infers a reactive scope which will construct that
 * variable. Variables that co-mutate are assigned to the same reactive scope.
 * This pass does *not* infer the set of instructions necessary to compute each
 * variable/scope, only the set of variables that will be computed by each scope.
 *
 * Examples:
 * ```javascript
 * // Mutable arguments
 * let x = {};
 * let y = [];
 * foo(x, y); // both args mutable, could alias each other
 * y.push(x); // y is part of callee, counts as operand
 *
 * let z = {};
 * y.push(z);
 *
 * // Mutable assignment
 * let x = {};
 * let y = [];
 * x.y = y; // trivial aliasing
 * ```
 *
 * More generally, all mutable operands (incl lvalue) of an instruction must go in the
 * same scope.
 *
 * ## Implementation
 *
 * 1. Iterate over all instructions in all blocks (order does not matter, single pass),
 *    and create disjoint sets ({@link DisjointSet}) for each set of operands that
 *    mutate together per above rules.
 * 2. Iterate the contents of each set, and assign a new {@link ScopeId} to each set,
 *    and update the `scope` property of each item in that set to that scope id.
 *
 * ## Other Issues Uncovered
 *
 * Mutable lifetimes need to account for aliasing (known todo, already described in InferMutableLifetimes.ts)
 *
 * ```javascript
 * let x = {};
 * let y = [];
 * x.y = y; // RHS is not considered mutable here bc not further mutation
 * mutate(x); // bc y is aliased here, it should still be considered mutable above
 * ```
 */
export function inferReactiveScopeVariables(fn: HIRFunction) {
  // Represents the set of reactive scopes as disjoint sets of identifiers
  // that mutate together.
  const scopeIdentifiers = new DisjointSet<Identifier>();
  for (const [_, block] of fn.body.blocks) {
    invariant(
      block.phis.size === 0,
      "Expected phis to be cleared by LeaveSSA pass"
    );

    for (const instr of block.instructions) {
      const operands: Array<Identifier> = [];
      const range = instr.lvalue.place.identifier.mutableRange;
      if (range.end > range.start + 1 || mayAllocate(instr.value)) {
        operands.push(instr.lvalue!.place.identifier);
      }
      for (const operand of eachInstructionOperand(instr)) {
        if (
          isMutable(instr, operand) &&
          // exclude global variables from being added to scopes, we can't recreate them!
          // TODO: improve handling of module-scoped variables and globals
          operand.identifier.mutableRange.start > 0
        ) {
          operands.push(operand.identifier);
        }
      }
      if (operands.length !== 0) {
        scopeIdentifiers.union(operands);
      }
    }
  }

  // Maps each scope (by its identifying member) to a ScopeId value
  const scopes: Map<Identifier, ReactiveScope> = new Map();
  const scopeVariables: Map<ReactiveScope, Set<Identifier>> = new Map();

  /**
   * Iterate over all the identifiers and assign a unique ScopeId
   * for each scope (based on the set identifier).
   *
   * At the same time, group the identifiers in each scope and
   * build a MutableRange that describes the span of mutations
   * across all identifiers in each scope.
   */
  scopeIdentifiers.forEach((identifier, groupIdentifier) => {
    let scope = scopes.get(groupIdentifier);
    if (scope === undefined) {
      scope = {
        id: makeScopeId(scopes.size),
        range: identifier.mutableRange,
        dependencies: new Set(),
        outputs: new Set(),
      };
      scopes.set(groupIdentifier, scope);
    } else {
      scope.range.start = makeInstructionId(
        Math.min(scope.range.start, identifier.mutableRange.start)
      );
      scope.range.end = makeInstructionId(
        Math.max(scope.range.end, identifier.mutableRange.end)
      );
    }
    identifier.scope = scope;

    let vars = scopeVariables.get(scope);
    if (vars === undefined) {
      vars = new Set();
      scopeVariables.set(scope, vars);
    }
    vars.add(identifier);
  });

  // Copy scope ranges to identifier ranges: not strictly required but this is useful
  // for visualization
  for (const [scope, vars] of scopeVariables) {
    for (const identifier of vars) {
      identifier.mutableRange.start = scope.range.start;
      identifier.mutableRange.end = scope.range.end;
    }
  }
}

// Is the operand mutable at this given instruction
function isMutable({ id }: Instruction, place: Place): boolean {
  const range = place.identifier.mutableRange;
  return id >= range.start && id < range.end;
}

function mayAllocate(value: InstructionValue): boolean {
  switch (value.kind) {
    case "TypeCastExpression":
    case "BinaryExpression":
    case "Identifier":
    case "PropertyLoad":
    case "ComputedLoad":
    case "JSXText":
    case "UnaryExpression":
    case "TemplateLiteral":
    case "Primitive": {
      return false;
    }
    case "PropertyCall":
    case "ComputedCall":
    case "PropertyStore":
    case "ComputedStore":
    case "ArrayExpression":
    case "CallExpression":
    case "JsxExpression":
    case "JsxFragment":
    case "NewExpression":
    case "ObjectExpression":
    case "UnsupportedNode":
    case "FunctionExpression":
    case "TaggedTemplateExpression": {
      return true;
    }
    default: {
      assertExhaustive(value, `Unexpected value kind '${(value as any).kind}'`);
    }
  }
}
