/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import generate from "@babel/generator";
import DisjointSet from "../Utils/DisjointSet";
import { assertExhaustive } from "../Utils/utils";
import {
  GotoVariant,
  HIR,
  HIRFunction,
  Identifier,
  Instruction,
  InstructionKind,
  InstructionValue,
  LValue,
  MutableRange,
  Phi,
  Place,
  ReactiveInstruction,
  ReactiveScope,
  SourceLocation,
  Terminal,
  Type,
} from "./HIR";

export type Options = {
  indent: number;
};

export function printFunction(fn: HIRFunction): string {
  const output = [];
  output.push(printHIR(fn.body));
  return output.join("\n");
}

export function printHIR(ir: HIR, options: Options | null = null): string {
  let output = [];
  let indent = " ".repeat(options?.indent ?? 0);
  const push = (text: string, indent: string = "  ") => {
    output.push(`${indent}${text}`);
  };
  for (const [blockId, block] of ir.blocks) {
    output.push(`bb${blockId} (${block.kind}):`);
    if (block.preds.size > 0) {
      const preds = ["predecessor blocks:"];
      for (const pred of block.preds) {
        preds.push(`bb${pred}`);
      }
      push(preds.join(" "));
    }
    for (const phi of block.phis) {
      push(printPhi(phi));
    }
    for (const instr of block.instructions) {
      push(printInstruction(instr));
    }
    const terminal = printTerminal(block.terminal);
    if (Array.isArray(terminal)) {
      terminal.forEach((line) => push(line));
    } else {
      push(terminal);
    }
  }
  return output.map((line) => indent + line).join("\n");
}

export function printMixedHIR(
  value: Instruction | InstructionValue | Terminal
): string {
  if (!("kind" in value)) {
    return printInstruction(value);
  }
  switch (value.kind) {
    case "branch":
    case "if":
    case "logical":
    case "return":
    case "switch":
    case "throw":
    case "while":
    case "for":
    case "unsupported":
    case "goto": {
      const terminal = printTerminal(value);
      if (Array.isArray(terminal)) {
        return terminal.join("; ");
      }
      return terminal;
    }
    default: {
      return printInstructionValue(value);
    }
  }
}

export function printInstruction(instr: ReactiveInstruction): string {
  const id = `[${instr.id}]`;
  const value = printInstructionValue(instr.value);

  if (instr.lvalue !== null) {
    return `${id} ${printLValue(instr.lvalue)} = ${value}`;
  } else {
    return `${id} ${value}`;
  }
}

function printPhi(phi: Phi): string {
  const items = [];
  items.push(printIdentifier(phi.id));
  items.push(printMutableRange(phi.id));
  items.push(printType(phi.type));
  items.push(": phi(");
  const phis = [];
  for (const [blockId, id] of phi.operands) {
    phis.push(`bb${blockId}: ${printIdentifier(id)}`);
  }

  items.push(phis.join(", "));
  items.push(")");
  return items.join("");
}

export function printTerminal(terminal: Terminal): Array<string> | string {
  let value;
  switch (terminal.kind) {
    case "if": {
      value = `[${terminal.id}] If (${printPlace(terminal.test)}) then:bb${
        terminal.consequent
      } else:bb${terminal.alternate}${
        terminal.fallthrough ? ` fallthrough=bb${terminal.fallthrough}` : ""
      }`;
      break;
    }
    case "branch": {
      value = `[${terminal.id}] Branch (${printPlace(terminal.test)}) then:bb${
        terminal.consequent
      } else:bb${terminal.alternate}`;
      break;
    }
    case "logical": {
      value = `[${terminal.id}] Logical ${terminal.operator} test:bb${terminal.test} fallthrough=bb${terminal.fallthrough}`;
      break;
    }
    case "throw": {
      value = `[${terminal.id}] Throw ${printPlace(terminal.value)}`;
      break;
    }
    case "return": {
      value = `[${terminal.id}] Return${
        terminal.value != null ? " " + printPlace(terminal.value) : ""
      }`;
      break;
    }
    case "goto": {
      value = `[${terminal.id}] Goto${
        terminal.variant === GotoVariant.Continue ? "(Continue)" : ""
      } bb${terminal.block}`;
      break;
    }
    case "switch": {
      const output = [];
      output.push(`[${terminal.id}] Switch (${printPlace(terminal.test)})`);
      terminal.cases.forEach((case_) => {
        if (case_.test !== null) {
          output.push(`  Case ${printPlace(case_.test)}: bb${case_.block}`);
        } else {
          output.push(`  Default: bb${case_.block}`);
        }
      });
      if (terminal.fallthrough) {
        output.push(`  Fallthrough: bb${terminal.fallthrough}`);
      }
      value = output;
      break;
    }
    case "while": {
      value = `[${terminal.id}] While test=bb${terminal.test} loop=${
        terminal.loop !== null ? `bb${terminal.loop}` : ""
      } fallthrough=${terminal.fallthrough ? `bb${terminal.fallthrough}` : ""}`;
      break;
    }
    case "for": {
      value = `[${terminal.id}] For init=bb${terminal.init} test=bb${terminal.test} loop=bb${terminal.loop} update=bb${terminal.update} fallthrough=bb${terminal.fallthrough}`;
      break;
    }
    case "unsupported": {
      value = `Unsupported`;
      break;
    }
    default: {
      assertExhaustive(
        terminal,
        `Unexpected terminal kind '${terminal as any as Terminal}'`
      );
    }
  }
  return value;
}

export function printInstructionValue(instrValue: InstructionValue): string {
  let value = "";
  switch (instrValue.kind) {
    case "ArrayExpression": {
      value = `Array [${instrValue.elements
        .map((element) => printPlace(element))
        .join(", ")}]`;
      break;
    }
    case "ObjectExpression": {
      const properties = [];
      if (instrValue.properties !== null) {
        for (const [key, value] of instrValue.properties) {
          properties.push(`${key}: ${printPlace(value)}`);
        }
      }
      value = `Object { ${properties.join(", ")} }`;
      break;
    }
    case "UnaryExpression": {
      value = `Unary ${printPlace(instrValue.value)}`;
      break;
    }
    case "BinaryExpression": {
      value = `Binary ${printPlace(instrValue.left)} ${
        instrValue.operator
      } ${printPlace(instrValue.right)}`;
      break;
    }
    case "CallExpression": {
      value = `Call ${printPlace(instrValue.callee)}(${instrValue.args
        .map((arg) => printPlace(arg))
        .join(", ")})`;
      break;
    }
    case "PropertyCall": {
      value = `PropertyCall ${printPlace(instrValue.receiver)}.${
        instrValue.property
      }(${instrValue.args.map((arg) => printPlace(arg)).join(", ")})`;
      break;
    }
    case "ComputedCall": {
      value = `ComputedCall ${printPlace(instrValue.receiver)}[${printPlace(
        instrValue.property
      )}](${instrValue.args.map((arg) => printPlace(arg)).join(", ")})`;
      break;
    }
    case "JSXText":
    case "Primitive": {
      value = JSON.stringify(instrValue.value);
      break;
    }
    case "JsxExpression": {
      const propItems = [];
      for (const [prop, value] of instrValue.props) {
        propItems.push(`${prop}={${printPlace(value)}}`);
      }
      const props = propItems.length !== 0 ? " " + propItems.join(" ") : "";
      if (instrValue.children !== null) {
        const children = instrValue.children.map((child) => {
          return `{${printPlace(child)}}`;
        });
        value = `JSX <${printPlace(instrValue.tag)}${props}${
          props.length > 0 ? " " : ""
        }>${children.join("")}</${printPlace(instrValue.tag)}>`;
      } else {
        value = `JSX <${printPlace(instrValue.tag)}${props}${
          props.length > 0 ? " " : ""
        }/>`;
      }
      break;
    }
    case "JsxFragment": {
      value = `JsxFragment [${instrValue.children
        .map((child) => printPlace(child))
        .join(", ")}]`;
      break;
    }
    case "NewExpression": {
      value = `New ${printPlace(instrValue.callee)}(${instrValue.args
        .map((arg) => printPlace(arg))
        .join(", ")})`;
      break;
    }
    case "UnsupportedNode": {
      value = `UnsupportedNode(${generate(instrValue.node).code})`;
      break;
    }
    case "Identifier": {
      value = printPlace(instrValue);
      break;
    }
    case "PropertyLoad": {
      value = `PropertyLoad ${printPlace(instrValue.object)}.${
        instrValue.property
      }`;
      break;
    }
    case "PropertyStore": {
      value = `PropertyStore ${printPlace(instrValue.object)}.${
        instrValue.property
      } = ${printPlace(instrValue.value)}`;
      break;
    }
    case "ComputedLoad": {
      value = `ComputedLoad ${printPlace(instrValue.object)}[${printPlace(
        instrValue.property
      )}]`;
      break;
    }
    case "ComputedStore": {
      value = `ComputedStore ${printPlace(instrValue.object)}[${printPlace(
        instrValue.property
      )}] = ${printPlace(instrValue.value)}`;
      break;
    }
    case "FunctionExpression": {
      const params = instrValue.params.join(",");
      const body = generate(instrValue.expr).code;
      const deps = instrValue.dependencies
        .map((i) => printIdentifier(i.identifier))
        .join(",");
      value = `Function ${instrValue.name ?? ""} @deps[${deps}] (${
        params ?? ""
      }){${body}}`;
      break;
    }
    case "TaggedTemplateExpression": {
      value = `${instrValue.tag}\`${instrValue.value.raw}\``;
      break;
    }
    default: {
      assertExhaustive(
        instrValue,
        `Unexpected instruction kind '${
          (instrValue as any as InstructionValue).kind
        }'`
      );
    }
  }
  return value;
}

function isMutable(range: MutableRange): boolean {
  return range.end > range.start + 1;
}

function printMutableRange(identifier: Identifier): string {
  const range =
    identifier.scope !== null
      ? identifier.scope.range
      : identifier.mutableRange;
  return isMutable(range) ? `[${range.start}:${range.end}]` : "";
}

export function printLValue(lval: LValue): string {
  let lvalue = `${printPlace(lval.place)}${printMutableRange(
    lval.place.identifier
  )}`;

  switch (lval.kind) {
    case InstructionKind.Let: {
      return `Let ${lvalue}`;
    }
    case InstructionKind.Const: {
      return `Const ${lvalue}$`;
    }
    case InstructionKind.Reassign: {
      return `Reassign ${lvalue}`;
    }
    default: {
      assertExhaustive(lval.kind, `Unexpected lvalue kind '${lval.kind}'`);
    }
  }
}

export function printPlace(place: Place): string {
  const items = [place.effect, " ", printIdentifier(place.identifier)];
  items.push(printType(place.identifier.type));
  return items.filter((x) => x != null).join("");
}

export function printIdentifier(id: Identifier): string {
  return `${printName(id.name)}\$${id.id}${printScope(id.scope)}`;
}

function printName(name: string | null): string {
  return name ?? "";
}

function printScope(scope: ReactiveScope | null): string {
  return `${scope !== null ? `_@${scope.id}` : ""}`;
}

function printType(type: Type): string {
  if (type.kind === "Type") return "";
  return `:T${type.kind}`;
}

export function printSourceLocation(loc: SourceLocation): string {
  if (typeof loc === "symbol") {
    return "generated";
  } else {
    return `${loc.start.line}:${loc.start.column}:${loc.end.line}:${loc.end.column}`;
  }
}

export function printAliases(aliases: DisjointSet<Identifier>): string {
  const aliasSets = aliases.buildSets();

  const items = [];
  for (const aliasSet of aliasSets) {
    items.push([...aliasSet].map((id) => printIdentifier(id)).join(","));
  }

  return items.join("\n");
}
