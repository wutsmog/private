/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { assertExhaustive } from "../Utils/utils";
import {
  BlockId,
  Instruction,
  InstructionValue,
  makeInstructionId,
  Pattern,
  Place,
  ReactiveInstruction,
  SpreadPattern,
  Terminal,
} from "./HIR";

export function* eachInstructionLValue(
  instr: ReactiveInstruction
): Iterable<Place> {
  if (instr.lvalue !== null) {
    yield instr.lvalue;
  }
  switch (instr.value.kind) {
    case "DeclareLocal":
    case "StoreLocal": {
      yield instr.value.lvalue.place;
      break;
    }
    case "Destructure": {
      yield* eachPatternOperand(instr.value.lvalue.pattern);
      break;
    }
  }
}

export function* eachInstructionOperand(instr: Instruction): Iterable<Place> {
  yield* eachInstructionValueOperand(instr.value);
}
export function* eachInstructionValueOperand(
  instrValue: InstructionValue
): Iterable<Place> {
  switch (instrValue.kind) {
    case "NewExpression":
    case "CallExpression": {
      yield instrValue.callee;
      yield* eachCallArgument(instrValue.args);
      break;
    }
    case "BinaryExpression": {
      yield instrValue.left;
      yield instrValue.right;
      break;
    }
    case "MethodCall": {
      yield instrValue.receiver;
      yield instrValue.property;
      yield* eachCallArgument(instrValue.args);
      break;
    }
    case "DeclareLocal": {
      break;
    }
    case "LoadLocal": {
      yield instrValue.place;
      break;
    }
    case "StoreLocal": {
      yield instrValue.value;
      break;
    }
    case "Destructure": {
      yield instrValue.value;
      break;
    }
    case "PropertyLoad": {
      yield instrValue.object;
      break;
    }
    case "PropertyDelete": {
      yield instrValue.object;
      break;
    }
    case "PropertyStore": {
      yield instrValue.object;
      yield instrValue.value;
      break;
    }
    case "ComputedLoad": {
      yield instrValue.object;
      yield instrValue.property;
      break;
    }
    case "ComputedDelete": {
      yield instrValue.object;
      yield instrValue.property;
      break;
    }
    case "ComputedStore": {
      yield instrValue.object;
      yield instrValue.property;
      yield instrValue.value;
      break;
    }
    case "UnaryExpression": {
      yield instrValue.value;
      break;
    }
    case "JsxExpression": {
      yield instrValue.tag;
      for (const attribute of instrValue.props) {
        switch (attribute.kind) {
          case "JsxAttribute": {
            yield attribute.place;
            break;
          }
          case "JsxSpreadAttribute": {
            yield attribute.argument;
            break;
          }
          default: {
            assertExhaustive(
              attribute,
              `Unexpected attribute kind '${(attribute as any).kind}'`
            );
          }
        }
      }
      if (instrValue.children) {
        yield* instrValue.children;
      }
      break;
    }
    case "JsxFragment": {
      yield* instrValue.children;
      break;
    }
    case "ObjectExpression": {
      for (const property of instrValue.properties) {
        yield property.place;
      }
      break;
    }
    case "ArrayExpression": {
      for (const element of instrValue.elements) {
        if (element.kind === "Identifier") {
          yield element;
        } else {
          yield element.place;
        }
      }
      break;
    }
    case "FunctionExpression": {
      yield* instrValue.dependencies;
      break;
    }
    case "TaggedTemplateExpression": {
      yield instrValue.tag;
      break;
    }
    case "TypeCastExpression": {
      yield instrValue.value;
      break;
    }
    case "TemplateLiteral": {
      yield* instrValue.subexprs;
      break;
    }
    case "RegExpLiteral":
    case "LoadGlobal":
    case "UnsupportedNode":
    case "Primitive":
    case "JSXText": {
      break;
    }
    default: {
      assertExhaustive(
        instrValue,
        `Unexpected instruction kind '${(instrValue as any).kind}'`
      );
    }
  }
}

export function* eachCallArgument(
  args: Array<Place | SpreadPattern>
): Iterable<Place> {
  for (const arg of args) {
    if (arg.kind === "Identifier") {
      yield arg;
    } else {
      yield arg.place;
    }
  }
}

export function doesPatternContainSpreadElement(pattern: Pattern): boolean {
  switch (pattern.kind) {
    case "ArrayPattern": {
      for (const item of pattern.items) {
        if (item.kind === "Spread") {
          return true;
        }
      }
      break;
    }
    case "ObjectPattern": {
      for (const property of pattern.properties) {
        if (property.kind === "Spread") {
          return true;
        }
      }
      break;
    }
    default: {
      assertExhaustive(
        pattern,
        `Unexpected pattern kind '${(pattern as any).kind}'`
      );
    }
  }
  return false;
}

export function* eachPatternOperand(pattern: Pattern): Iterable<Place> {
  switch (pattern.kind) {
    case "ArrayPattern": {
      for (const item of pattern.items) {
        if (item.kind === "Identifier") {
          yield item;
        } else if (item.kind === "Spread") {
          yield item.place;
        } else {
          assertExhaustive(
            item,
            `Unexpected item kind '${(item as any).kind}'`
          );
        }
      }
      break;
    }
    case "ObjectPattern": {
      for (const property of pattern.properties) {
        if (property.kind === "ObjectProperty") {
          if (property.place.kind === "Identifier") {
            yield property.place;
          }
        } else if (property.kind === "Spread") {
          yield property.place;
        } else {
          assertExhaustive(
            property,
            `Unexpected item kind '${(property as any).kind}'`
          );
        }
      }
      break;
    }
    default: {
      assertExhaustive(
        pattern,
        `Unexpected pattern kind '${(pattern as any).kind}'`
      );
    }
  }
}

export function mapInstructionLValues(
  instr: Instruction,
  fn: (place: Place) => Place
): void {
  switch (instr.value.kind) {
    case "DeclareLocal":
    case "StoreLocal": {
      const lvalue = instr.value.lvalue;
      lvalue.place = fn(lvalue.place);
      break;
    }
    case "Destructure": {
      mapPatternOperands(instr.value.lvalue.pattern, fn);
      break;
    }
  }
  if (instr.lvalue !== null) {
    instr.lvalue = fn(instr.lvalue);
  }
}

export function mapInstructionOperands(
  instr: Instruction,
  fn: (place: Place) => Place
): void {
  const instrValue = instr.value;
  switch (instrValue.kind) {
    case "BinaryExpression": {
      instrValue.left = fn(instrValue.left);
      instrValue.right = fn(instrValue.right);
      break;
    }
    case "PropertyLoad": {
      instrValue.object = fn(instrValue.object);
      break;
    }
    case "PropertyDelete": {
      instrValue.object = fn(instrValue.object);
      break;
    }
    case "PropertyStore": {
      instrValue.object = fn(instrValue.object);
      instrValue.value = fn(instrValue.value);
      break;
    }
    case "ComputedLoad": {
      instrValue.object = fn(instrValue.object);
      instrValue.property = fn(instrValue.property);
      break;
    }
    case "ComputedDelete": {
      instrValue.object = fn(instrValue.object);
      instrValue.property = fn(instrValue.property);
      break;
    }
    case "ComputedStore": {
      instrValue.object = fn(instrValue.object);
      instrValue.property = fn(instrValue.property);
      instrValue.value = fn(instrValue.value);
      break;
    }
    case "DeclareLocal": {
      break;
    }
    case "LoadLocal": {
      instrValue.place = fn(instrValue.place);
      break;
    }
    case "StoreLocal": {
      instrValue.value = fn(instrValue.value);
      break;
    }
    case "Destructure": {
      instrValue.value = fn(instrValue.value);
      break;
    }
    case "NewExpression":
    case "CallExpression": {
      instrValue.callee = fn(instrValue.callee);
      instrValue.args = mapCallArguments(instrValue.args, fn);
      break;
    }
    case "MethodCall": {
      instrValue.receiver = fn(instrValue.receiver);
      instrValue.property = fn(instrValue.property);
      instrValue.args = mapCallArguments(instrValue.args, fn);
      break;
    }
    case "UnaryExpression": {
      instrValue.value = fn(instrValue.value);
      break;
    }
    case "JsxExpression": {
      instrValue.tag = fn(instrValue.tag);
      for (const attribute of instrValue.props) {
        switch (attribute.kind) {
          case "JsxAttribute": {
            attribute.place = fn(attribute.place);
            break;
          }
          case "JsxSpreadAttribute": {
            attribute.argument = fn(attribute.argument);
            break;
          }
          default: {
            assertExhaustive(
              attribute,
              `Unexpected attribute kind '${(attribute as any).kind}'`
            );
          }
        }
      }
      if (instrValue.children) {
        instrValue.children = instrValue.children.map((p) => fn(p));
      }
      break;
    }
    case "ObjectExpression": {
      for (const property of instrValue.properties) {
        property.place = fn(property.place);
      }
      break;
    }
    case "ArrayExpression": {
      instrValue.elements = instrValue.elements.map((element) => {
        if (element.kind === "Identifier") {
          return fn(element);
        } else {
          element.place = fn(element.place);
          return element;
        }
      });
      break;
    }
    case "JsxFragment": {
      instrValue.children = instrValue.children.map((e) => fn(e));
      break;
    }
    case "FunctionExpression": {
      instrValue.dependencies = instrValue.dependencies.map((d) => fn(d));
      break;
    }
    case "TaggedTemplateExpression": {
      instrValue.tag = fn(instrValue.tag);
      break;
    }
    case "TypeCastExpression": {
      instrValue.value = fn(instrValue.value);
      break;
    }
    case "TemplateLiteral": {
      instrValue.subexprs = instrValue.subexprs.map(fn);
      break;
    }
    case "RegExpLiteral":
    case "LoadGlobal":
    case "UnsupportedNode":
    case "Primitive":
    case "JSXText": {
      break;
    }
    default: {
      assertExhaustive(instrValue, "Unexpected instruction kind");
    }
  }
}

export function mapCallArguments(
  args: Array<Place | SpreadPattern>,
  fn: (place: Place) => Place
): Array<Place | SpreadPattern> {
  return args.map((arg) => {
    if (arg.kind === "Identifier") {
      return fn(arg);
    } else {
      arg.place = fn(arg.place);
      return arg;
    }
  });
}

export function mapPatternOperands(
  pattern: Pattern,
  fn: (place: Place) => Place
): void {
  switch (pattern.kind) {
    case "ArrayPattern": {
      pattern.items = pattern.items.map((item) => {
        if (item.kind === "Identifier") {
          return fn(item);
        } else {
          item.place = fn(item.place);
          return item;
        }
      });
      break;
    }
    case "ObjectPattern": {
      for (const property of pattern.properties) {
        property.place = fn(property.place);
      }
      break;
    }
    default: {
      assertExhaustive(
        pattern,
        `Unexpected pattern kind '${(pattern as any).kind}'`
      );
    }
  }
}

/**
 * Maps a terminal node's block assignments using the provided function.
 */
export function mapTerminalSuccessors(
  terminal: Terminal,
  fn: (block: BlockId) => BlockId
): Terminal {
  switch (terminal.kind) {
    case "goto": {
      const target = fn(terminal.block);
      return {
        kind: "goto",
        block: target,
        variant: terminal.variant,
        id: makeInstructionId(0),
      };
    }
    case "if": {
      const consequent = fn(terminal.consequent);
      const alternate = fn(terminal.alternate);
      const fallthrough =
        terminal.fallthrough !== null ? fn(terminal.fallthrough) : null;
      return {
        kind: "if",
        test: terminal.test,
        consequent,
        alternate,
        fallthrough,
        id: makeInstructionId(0),
      };
    }
    case "branch": {
      const consequent = fn(terminal.consequent);
      const alternate = fn(terminal.alternate);
      return {
        kind: "branch",
        test: terminal.test,
        consequent,
        alternate,
        id: makeInstructionId(0),
      };
    }
    case "switch": {
      const cases = terminal.cases.map((case_) => {
        const target = fn(case_.block);
        return {
          test: case_.test,
          block: target,
        };
      });
      const fallthrough =
        terminal.fallthrough !== null ? fn(terminal.fallthrough) : null;
      return {
        kind: "switch",
        test: terminal.test,
        cases,
        fallthrough,
        id: makeInstructionId(0),
      };
    }
    case "logical": {
      const test = fn(terminal.test);
      const fallthrough = fn(terminal.fallthrough);
      return {
        kind: "logical",
        test,
        fallthrough,
        operator: terminal.operator,
        id: makeInstructionId(0),
        loc: terminal.loc,
      };
    }
    case "ternary": {
      const test = fn(terminal.test);
      const fallthrough = fn(terminal.fallthrough);
      return {
        kind: "ternary",
        test,
        fallthrough,
        id: makeInstructionId(0),
        loc: terminal.loc,
      };
    }
    case "optional-call": {
      const test = fn(terminal.test);
      const fallthrough = fn(terminal.fallthrough);
      return {
        kind: "optional-call",
        optional: terminal.optional,
        test,
        fallthrough,
        id: makeInstructionId(0),
        loc: terminal.loc,
      };
    }
    case "return": {
      return {
        kind: "return",
        loc: terminal.loc,
        value: terminal.value,
        id: makeInstructionId(0),
      };
    }
    case "throw": {
      return terminal;
    }
    case "do-while": {
      const loop = fn(terminal.loop);
      const test = fn(terminal.test);
      const fallthrough = fn(terminal.fallthrough);
      return {
        kind: "do-while",
        loc: terminal.loc,
        test,
        loop,
        fallthrough,
        id: makeInstructionId(0),
      };
    }
    case "while": {
      const test = fn(terminal.test);
      const loop = fn(terminal.loop);
      const fallthrough = fn(terminal.fallthrough);
      return {
        kind: "while",
        loc: terminal.loc,
        test,
        loop,
        fallthrough,
        id: makeInstructionId(0),
      };
    }
    case "for": {
      const init = fn(terminal.init);
      const test = fn(terminal.test);
      const update = fn(terminal.update);
      const loop = fn(terminal.loop);
      const fallthrough = fn(terminal.fallthrough);
      return {
        kind: "for",
        loc: terminal.loc,
        init,
        test,
        update,
        loop,
        fallthrough,
        id: makeInstructionId(0),
      };
    }
    case "unsupported": {
      return terminal;
    }
    default: {
      assertExhaustive(
        terminal,
        `Unexpected terminal kind '${(terminal as any as Terminal).kind}'`
      );
    }
  }
}

/**
 * Iterates over the successor block ids of the provided terminal. The function is called
 * specifically for the successors that define the standard control flow, and not
 * pseduo-successors such as fallthroughs.
 */
export function* eachTerminalSuccessor(terminal: Terminal): Iterable<BlockId> {
  switch (terminal.kind) {
    case "goto": {
      yield terminal.block;
      break;
    }
    case "if": {
      yield terminal.consequent;
      yield terminal.alternate;
      break;
    }
    case "branch": {
      yield terminal.consequent;
      yield terminal.alternate;
      break;
    }
    case "switch": {
      for (const case_ of terminal.cases) {
        yield case_.block;
      }
      break;
    }
    case "optional-call":
    case "ternary":
    case "logical": {
      yield terminal.test;
      break;
    }
    case "return": {
      break;
    }
    case "throw": {
      break;
    }
    case "do-while": {
      yield terminal.loop;
      break;
    }
    case "while": {
      yield terminal.test;
      break;
    }
    case "for": {
      yield terminal.init;
      break;
    }
    case "unsupported":
      break;
    default: {
      assertExhaustive(
        terminal,
        `Unexpected terminal kind '${(terminal as any as Terminal).kind}'`
      );
    }
  }
}

export function mapTerminalOperands(
  terminal: Terminal,
  fn: (place: Place) => Place
): void {
  switch (terminal.kind) {
    case "if": {
      terminal.test = fn(terminal.test);
      break;
    }
    case "branch": {
      terminal.test = fn(terminal.test);
      break;
    }
    case "switch": {
      terminal.test = fn(terminal.test);
      for (const case_ of terminal.cases) {
        if (case_.test === null) {
          continue;
        }
        case_.test = fn(case_.test);
      }
      break;
    }
    case "return":
    case "throw": {
      if (terminal.value !== null) {
        terminal.value = fn(terminal.value);
      }
      break;
    }
    case "optional-call":
    case "ternary":
    case "logical":
    case "do-while":
    case "while":
    case "for":
    case "goto":
    case "unsupported": {
      // no-op
      break;
    }
    default: {
      assertExhaustive(
        terminal,
        `Unexpected terminal kind '${(terminal as any).kind}'`
      );
    }
  }
}

export function* eachTerminalOperand(terminal: Terminal): Iterable<Place> {
  switch (terminal.kind) {
    case "if": {
      yield terminal.test;
      break;
    }
    case "branch": {
      yield terminal.test;
      break;
    }
    case "switch": {
      yield terminal.test;
      for (const case_ of terminal.cases) {
        if (case_.test === null) {
          continue;
        }
        yield case_.test;
      }
      break;
    }
    case "return":
    case "throw": {
      if (terminal.value !== null) {
        yield terminal.value;
      }
      break;
    }
    case "optional-call":
    case "ternary":
    case "logical":
    case "do-while":
    case "while":
    case "for":
    case "goto":
    case "unsupported": {
      // no-op
      break;
    }
    default: {
      assertExhaustive(
        terminal,
        `Unexpected terminal kind '${(terminal as any).kind}'`
      );
    }
  }
}
