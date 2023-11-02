/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CompilerError } from "..";
import {
  BlockId,
  Effect,
  HIRFunction,
  Identifier,
  IdentifierId,
  Place,
  computePostDominatorTree,
  getHookKind,
} from "../HIR";
import { PostDominator } from "../HIR/Dominator";
import {
  eachInstructionLValue,
  eachInstructionValueOperand,
  eachTerminalOperand,
} from "../HIR/visitors";
import { hasBackEdge } from "../Optimization/DeadCodeElimination";
import { assertExhaustive } from "../Utils/utils";

/**
 * Infers which `Place`s are reactive, ie may *semantically* change
 * over the course of the component/hook's lifetime. Places are reactive
 * if they derive from source source of reactivity, which includes the
 * following categories.
 *
 * ## Props
 *
 * Props may change so they're reactive:
 *
 * ## Hooks
 *
 * Hooks may access state or context, which can change so they're reactive.
 *
 * ## Mutation with reactive operands
 *
 * Any value that is mutated in an instruction that also has reactive operands
 * could cause the modified value to capture a reference to the reactive value,
 * making the mutated value reactive.
 *
 * Ex:
 * ```
 * function Component(props) {
 *   const x = {}; // not yet reactive
 *   x.y = props.y;
 * }
 * ```
 *
 * Here `x` is modified in an instruction that has a reactive operand (`props.y`)
 * so x becomes reactive.
 *
 * ## Conditional assignment based on a reactive condition
 *
 * Conditionally reassigning a variable based on a condition which is reactive means
 * that the value being assigned could change, hence that variable also becomes
 * reactive.
 *
 * ```
 * function Component(props) {
 *   let x;
 *   if (props.cond) {
 *     x = 1;
 *   } else {
 *     x = 2;
 *   }
 *   return x;
 * }
 * ```
 *
 * Here `x` is never assigned a reactive value (it is assigned the constant 1 or 2) but
 * the condition, `props.cond`, is reactive, and therefore `x` could change reactively too.
 *
 *
 * # Algorithm
 *
 * The algorithm uses a fixpoint iteration in order to propagate reactivity "forward" through
 * the control-flow graph. We track whether each IdentifierId is reactive and terminate when
 * there are no changes after a given pass over the CFG.
 */
export function inferReactivePlaces(fn: HIRFunction): void {
  const reactiveIdentifiers = new ReactivityMap();
  for (const param of fn.params) {
    const place = param.kind === "Identifier" ? param : param.place;
    reactiveIdentifiers.markReactive(place);
  }

  const postDominators = computePostDominatorTree(fn, {
    includeThrowsAsExitNode: false,
  });
  const hasLoop = hasBackEdge(fn);
  const postDominatorFrontierCache = new Map<BlockId, Set<BlockId>>();
  do {
    for (const [, block] of fn.body.blocks) {
      for (const phi of block.phis) {
        if (reactiveIdentifiers.isReactiveIdentifier(phi.id)) {
          // Already marked reactive on a previous pass
          continue;
        }
        let isPhiReactive = false;
        for (const [, operand] of phi.operands) {
          if (reactiveIdentifiers.isReactiveIdentifier(operand)) {
            isPhiReactive = true;
            break;
          }
        }
        if (isPhiReactive) {
          reactiveIdentifiers.markReactiveIdentifier(phi.id);
        } else {
          // check to see if it has a reactive control dependency
          for (const [pred, _operand] of phi.operands) {
            let controlBlocks = postDominatorFrontierCache.get(pred);
            if (controlBlocks === undefined) {
              controlBlocks = postDominatorFrontier(fn, postDominators, pred);
              postDominatorFrontierCache.set(pred, controlBlocks);
            }
            control: for (const blockId of controlBlocks) {
              const controlBlock = fn.body.blocks.get(blockId)!;
              switch (controlBlock.terminal.kind) {
                case "if":
                case "branch": {
                  if (
                    reactiveIdentifiers.isReactive(controlBlock.terminal.test)
                  ) {
                    // control dependency is reactive
                    reactiveIdentifiers.markReactiveIdentifier(phi.id);
                    break control;
                  }
                  break;
                }
                case "switch": {
                  if (
                    reactiveIdentifiers.isReactive(controlBlock.terminal.test)
                  ) {
                    // control dependency is reactive
                    reactiveIdentifiers.markReactiveIdentifier(phi.id);
                    break control;
                  }
                  for (const case_ of controlBlock.terminal.cases) {
                    if (
                      case_.test !== null &&
                      reactiveIdentifiers.isReactive(case_.test)
                    ) {
                      // control dependency is reactive
                      reactiveIdentifiers.markReactiveIdentifier(phi.id);
                      break control;
                    }
                  }
                  break;
                }
              }
            }
          }
        }
      }
      for (const instruction of block.instructions) {
        const { value } = instruction;
        let hasReactiveInput = false;
        // NOTE: we want to mark all operands as reactive or not, so we
        // avoid short-circuting here
        for (const operand of eachInstructionValueOperand(value)) {
          const reactive = reactiveIdentifiers.isReactive(operand);
          hasReactiveInput ||= reactive;
        }

        // Hooks may always return a reactive variable, even if their inputs are
        // non-reactive, because they can access state or context.
        if (
          value.kind === "CallExpression" &&
          getHookKind(fn.env, value.callee.identifier) != null
        ) {
          hasReactiveInput = true;
        } else if (
          value.kind === "MethodCall" &&
          getHookKind(fn.env, value.property.identifier) != null
        ) {
          hasReactiveInput = true;
        }

        if (hasReactiveInput) {
          for (const lvalue of eachInstructionLValue(instruction)) {
            reactiveIdentifiers.markReactive(lvalue);
          }

          for (const operand of eachInstructionValueOperand(value)) {
            switch (operand.effect) {
              case Effect.Capture:
              case Effect.Store:
              case Effect.ConditionallyMutate:
              case Effect.Mutate: {
                reactiveIdentifiers.markReactive(operand);
                break;
              }
              case Effect.Freeze:
              case Effect.Read: {
                // no-op
                break;
              }
              case Effect.Unknown: {
                CompilerError.invariant(false, {
                  reason: "Unexpected unknown effect",
                  description: null,
                  loc: operand.loc,
                  suggestions: null,
                });
              }
              default: {
                assertExhaustive(
                  operand.effect,
                  `Unexpected effect kind '${operand.effect}'`
                );
              }
            }
          }
        }
      }
      for (const operand of eachTerminalOperand(block.terminal)) {
        reactiveIdentifiers.isReactive(operand);
      }
    }
  } while (reactiveIdentifiers.snapshot() && hasLoop);
}

/**
 * Computes the post-dominator frontier of @param block. These are immediate successors of nodes that
 * post-dominate @param targetId and from which execution may not reach @param block. Intuitively, these
 * are the earliest blocks from which execution branches such that it may or may not reach the target block.
 */
function postDominatorFrontier(
  fn: HIRFunction,
  postDominators: PostDominator<BlockId>,
  targetId: BlockId
): Set<BlockId> {
  const visited = new Set<BlockId>();
  const frontier = new Set<BlockId>();
  const targetPostDominators = postDominatorsOf(fn, postDominators, targetId);
  for (const blockId of [...targetPostDominators, targetId]) {
    if (visited.has(blockId)) {
      continue;
    }
    visited.add(blockId);
    const block = fn.body.blocks.get(blockId)!;
    for (const pred of block.preds) {
      if (!targetPostDominators.has(pred)) {
        // The predecessor does not always reach this block, we found an item on the frontier!
        frontier.add(pred);
      }
    }
  }
  return frontier;
}

function postDominatorsOf(
  fn: HIRFunction,
  postDominators: PostDominator<BlockId>,
  targetId: BlockId
): Set<BlockId> {
  const result = new Set<BlockId>();
  const visited = new Set<BlockId>();
  const queue = [targetId];
  while (queue.length) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    const current = fn.body.blocks.get(currentId)!;
    for (const pred of current.preds) {
      const predPostDominator = postDominators.get(pred) ?? pred;
      if (predPostDominator === targetId || result.has(predPostDominator)) {
        result.add(pred);
      }
      queue.push(pred);
    }
  }
  return result;
}

class ReactivityMap {
  hasChanges: boolean = false;
  reactive: Set<IdentifierId> = new Set();

  isReactive(place: Place): boolean {
    const reactive = this.reactive.has(place.identifier.id);
    if (reactive) {
      place.reactive = true;
    }
    return reactive;
  }

  isReactiveIdentifier(identifier: Identifier): boolean {
    return this.reactive.has(identifier.id);
  }

  markReactive(place: Place): void {
    place.reactive = true;
    this.markReactiveIdentifier(place.identifier);
  }

  markReactiveIdentifier(identifier: Identifier): void {
    if (!this.reactive.has(identifier.id)) {
      this.hasChanges = true;
      this.reactive.add(identifier.id);
    }
  }

  snapshot(): boolean {
    const hasChanges = this.hasChanges;
    this.hasChanges = false;
    return hasChanges;
  }
}
