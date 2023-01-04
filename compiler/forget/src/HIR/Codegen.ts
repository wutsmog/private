/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as t from "@babel/types";
import { invariant } from "../Utils/CompilerError";
import { todoInvariant } from "../Utils/todo";
import { assertExhaustive } from "../Utils/utils";
import {
  BlockId,
  GeneratedSource,
  HIRFunction,
  Identifier,
  IdentifierId,
  Instruction,
  InstructionId,
  InstructionKind,
  InstructionValue,
  LValue,
  Place,
  SourceLocation,
} from "./HIR";
import { BlockTerminal, Visitor, visitTree } from "./HIRTreeVisitor";

function withLoc<TNode extends t.Node, T extends (...args: any[]) => TNode>(
  fn: T
): (
  loc: SourceLocation | null | undefined,
  ...args: Parameters<T>
) => ReturnType<T> {
  return (
    loc: SourceLocation | null | undefined,
    ...args: Parameters<T>
  ): ReturnType<T> => {
    const node = fn(...args);
    if (loc != null && loc != GeneratedSource) {
      node.loc = loc;
    }
    // @ts-ignore
    return node;
  };
}

export const createBinaryExpression = withLoc(t.binaryExpression);
export const createCallExpression = withLoc(t.callExpression);
export const createExpressionStatement = withLoc(t.expressionStatement);
export const createFunctionDeclaration = withLoc(t.functionDeclaration);
export const createLabelledStatement = withLoc(t.labeledStatement);
export const createVariableDeclaration = withLoc(t.variableDeclaration);
export const createWhileStatement = withLoc(t.whileStatement);

/**
 * Converts HIR into Babel nodes, which can then be printed into source text.
 * Note that converting source to HIR and back is not guaranteed to produce
 * identicl source text: instead, it is guaranteed to produce semantically
 * equivalent JavaScript. Where possible the original shape of the source
 * code is preserved. Notably, temporary variables are only introduced
 * where strictly necessary such that in general the only variable declarations
 * that appear in the output are those that appeared in the input.
 *
 * However, it is expected that minor changes may occur, such as splitting
 * multiple variable declarations into one, converting `else` branches
 * into fallthrough branches, etc.
 *
 * Also, the *semantics* of variable resolution are preserved, but the exact
 * original block structure is *not* guaranteed to be preserved. As such,
 * variable names in the output may have a suffix attached to distinguish them.
 * It is expected that the output will be passed through a minifier which can
 * rename variables to reduce code size. In theory minification could be
 * performed as an HIR optimization pass, that is left todo for the time being.
 */
export default function codegen(fn: HIRFunction): t.Function {
  const visitor = new CodegenVisitor();
  const body = visitTree(fn, visitor);
  invariant(t.isBlockStatement(body), "Expected a block statement");
  const params = fn.params.map((param) => convertIdentifier(param.identifier));
  return createFunctionDeclaration(
    fn.loc,
    fn.id !== null ? convertIdentifier(fn.id) : null,
    params,
    body,
    fn.generator,
    fn.async
  );
}

export type Temporaries = Map<IdentifierId, t.Expression>;

class CodegenVisitor
  implements
    Visitor<
      Array<t.Statement>,
      t.Statement,
      Array<t.Statement>,
      Array<t.Statement>,
      t.Expression,
      t.Statement,
      t.SwitchCase
    >
{
  depth: number = 0;
  temp: Map<IdentifierId, t.Expression> = new Map();

  enterBlock(): t.Statement[] {
    this.depth++;
    return [];
  }
  appendBlock(
    block: t.Statement[],
    item: t.Statement,
    blockId?: BlockId | undefined
  ): void {
    if (item.type === "EmptyStatement") {
      return;
    }
    if (blockId !== undefined) {
      block.push(
        createLabelledStatement(
          item.loc,
          t.identifier(codegenLabel(blockId)),
          item
        )
      );
    } else {
      block.push(item);
    }
  }
  leaveBlock(block: t.Statement[]): t.Statement {
    this.depth--;
    return t.blockStatement(block);
  }
  enterValueBlock(): t.Statement[] {
    return this.enterBlock();
  }
  appendValueBlock(block: t.Statement[], item: t.Statement): void {
    this.appendBlock(block, item);
  }
  leaveValueBlock(
    block: t.Statement[],
    place: t.Expression | null
  ): t.Expression {
    this.depth--;
    if (block.length === 0) {
      invariant(place !== null, "Unexpected empty value block");
      return place;
    }
    const expressions = block.map((stmt) => {
      switch (stmt.type) {
        case "ExpressionStatement":
          return stmt.expression;
        default:
          todoInvariant(
            false,
            `Handle conversion of ${stmt.type} to expression`
          );
      }
    });
    if (place !== null) {
      expressions.push(place);
    }
    return t.sequenceExpression(expressions);
  }

  enterInitBlock(block: t.Statement[]): t.Statement[] {
    return this.enterBlock();
  }

  appendInitBlock(block: t.Statement[], item: t.Statement): void {
    this.appendBlock(block, item);
  }
  leaveInitBlock(block: t.Statement[]): t.Statement[] {
    switch (block.length) {
      case 0: {
        return [t.emptyStatement()];
      }
      case 1: {
        return [block[0]];
      }
      default: {
        return [t.blockStatement(block)];
      }
    }
  }

  visitValue(value: InstructionValue): t.Expression {
    return codegenInstructionValue(this.temp, value);
  }
  visitInstruction(instr: Instruction, value: t.Expression): t.Statement {
    return codegenInstruction(this.temp, instr, value);
  }
  visitTerminalId(id: InstructionId): void {}
  visitImplicitTerminal(): t.Statement | null {
    return null;
  }
  visitTerminal(
    terminal: BlockTerminal<
      t.Statement[],
      t.Expression,
      t.Statement,
      t.SwitchCase
    >
  ): t.Statement {
    switch (terminal.kind) {
      case "break": {
        if (terminal.label) {
          return t.breakStatement(t.identifier(codegenLabel(terminal.label)));
        } else {
          return t.breakStatement();
        }
      }
      case "continue": {
        if (terminal.label) {
          return t.continueStatement(
            t.identifier(codegenLabel(terminal.label))
          );
        } else {
          return t.continueStatement();
        }
      }
      case "if": {
        return t.ifStatement(
          terminal.test,
          terminal.consequent,
          terminal.alternate
        );
      }
      case "switch": {
        return t.switchStatement(terminal.test, terminal.cases);
      }
      case "while": {
        return createWhileStatement(terminal.loc, terminal.test, terminal.loop);
      }
      case "for": {
        const initBlock = terminal.init;
        invariant(
          initBlock.length === 1,
          "Expected for init to be a single expression or statement"
        );
        const initStatement = initBlock[0]!;
        let init;
        if (initStatement.type === "VariableDeclaration") {
          init = initStatement;
        } else if (initStatement.type === "ExpressionStatement") {
          init = initStatement.expression;
        } else {
          invariant(
            false,
            `Expected 'for' init block to contain variable declaration or an expression, got '${initStatement.type}'.`
          );
        }
        return t.forStatement(
          init,
          terminal.test,
          terminal.update,
          terminal.loop
        );
      }
      case "return": {
        const createReturnStatement = withLoc(t.returnStatement);
        if (terminal.value !== null) {
          return createReturnStatement(terminal.loc, terminal.value);
        } else if (this.depth === 1) {
          // A return at the top-level of a function must be the last instruction,
          // and functions implicitly return after the last instruction of the top-level.
          // Elide the return.
          return t.emptyStatement();
        } else {
          return createReturnStatement(terminal.loc);
        }
      }
      case "throw": {
        return t.throwStatement(terminal.value);
      }
      default: {
        assertExhaustive(
          terminal,
          `Unexpected terminal kind '${(terminal as any).kind}'`
        );
      }
    }
  }
  visitCase(test: t.Expression | null, block: t.Statement): t.SwitchCase {
    return t.switchCase(test, [block]);
  }
}

export function codegenLabel(id: BlockId): string {
  return `bb${id}`;
}

export function codegenInstruction(
  temp: Temporaries,
  instr: Instruction,
  value: t.Expression
): t.Statement {
  if (t.isStatement(value)) {
    return value;
  }
  if (instr.lvalue === null) {
    return t.expressionStatement(value);
  }
  if (instr.lvalue.place.identifier.name === null) {
    // temporary
    temp.set(instr.lvalue.place.identifier.id, value);
    return t.emptyStatement();
  } else {
    switch (instr.lvalue.kind) {
      case InstructionKind.Const: {
        return createVariableDeclaration(instr.loc, "const", [
          t.variableDeclarator(codegenLVal(instr.lvalue), value),
        ]);
      }
      case InstructionKind.Let: {
        return createVariableDeclaration(instr.loc, "let", [
          t.variableDeclarator(codegenLVal(instr.lvalue), value),
        ]);
      }
      case InstructionKind.Reassign: {
        return createExpressionStatement(
          instr.loc,
          t.assignmentExpression("=", codegenLVal(instr.lvalue), value)
        );
      }
      default: {
        assertExhaustive(
          instr.lvalue.kind,
          `Unexpected instruction kind '${instr.lvalue.kind}'`
        );
      }
    }
  }
}

export function codegenInstructionValue(
  temp: Temporaries,
  instrValue: InstructionValue
): t.Expression {
  let value: t.Expression;
  switch (instrValue.kind) {
    case "ArrayExpression": {
      const elements = instrValue.elements.map((element) =>
        codegenPlace(temp, element)
      );
      value = t.arrayExpression(elements);
      break;
    }
    case "BinaryExpression": {
      const left = codegenPlace(temp, instrValue.left);
      const right = codegenPlace(temp, instrValue.right);
      value = createBinaryExpression(
        instrValue.loc,
        instrValue.operator,
        left,
        right
      );
      break;
    }
    case "UnaryExpression": {
      value = t.unaryExpression(
        instrValue.operator as "throw", // todo
        codegenPlace(temp, instrValue.value)
      );
      break;
    }
    case "Primitive": {
      value = codegenValue(temp, instrValue.value);
      break;
    }
    case "CallExpression": {
      const callee = codegenPlace(temp, instrValue.callee);
      const args = instrValue.args.map((arg) => codegenPlace(temp, arg));
      value = createCallExpression(instrValue.loc, callee, args);
      break;
    }
    case "NewExpression": {
      const callee = codegenPlace(temp, instrValue.callee);
      const args = instrValue.args.map((arg) => codegenPlace(temp, arg));
      value = t.newExpression(callee, args);
      break;
    }
    case "ObjectExpression": {
      const properties = [];
      if (instrValue.properties !== null) {
        for (const [property, value] of instrValue.properties) {
          properties.push(
            t.objectProperty(
              t.stringLiteral(property),
              codegenPlace(temp, value)
            )
          );
        }
      }
      value = t.objectExpression(properties);
      break;
    }
    case "JSXText": {
      value = t.stringLiteral(instrValue.value);
      break;
    }
    case "JsxExpression": {
      const attributes: Array<t.JSXAttribute> = [];
      for (const [prop, value] of instrValue.props) {
        attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier(prop),
            t.jsxExpressionContainer(codegenPlace(temp, value))
          )
        );
      }
      let tagValue = codegenPlace(temp, instrValue.tag);
      let tag: string;
      if (tagValue.type === "Identifier") {
        tag = tagValue.name;
      } else {
        invariant(
          tagValue.type === "StringLiteral",
          "Expected JSX tag to be an identifier or string"
        );
        tag = tagValue.value;
      }
      const children =
        instrValue.children !== null
          ? instrValue.children.map((child) => codegenJsxElement(temp, child))
          : [];
      value = t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier(tag),
          attributes,
          instrValue.children === null
        ),
        instrValue.children !== null
          ? t.jsxClosingElement(t.jsxIdentifier(tag))
          : null,
        children,
        instrValue.children === null
      );
      break;
    }
    case "JsxFragment": {
      value = t.jsxFragment(
        t.jsxOpeningFragment(),
        t.jsxClosingFragment(),
        instrValue.children.map((child) => codegenJsxElement(temp, child))
      );
      break;
    }
    case "OtherStatement": {
      const node = instrValue.node;
      if (!t.isExpression(node)) {
        return node as any; // TODO handle statements, jsx fragments
      }
      value = node;
      break;
    }
    case "PropertyStore": {
      value = t.assignmentExpression(
        "=",
        t.memberExpression(
          codegenPlace(temp, instrValue.object),
          t.identifier(instrValue.property)
        ),
        codegenPlace(temp, instrValue.value)
      );
      break;
    }
    case "PropertyLoad": {
      value = t.memberExpression(
        codegenPlace(temp, instrValue.object),
        t.identifier(instrValue.property)
      );
      break;
    }
    case "ComputedStore": {
      value = t.assignmentExpression(
        "=",
        t.memberExpression(
          codegenPlace(temp, instrValue.object),
          codegenPlace(temp, instrValue.property),
          true
        ),
        codegenPlace(temp, instrValue.value)
      );
      break;
    }
    case "ComputedLoad": {
      value = t.memberExpression(
        codegenPlace(temp, instrValue.object),
        codegenPlace(temp, instrValue.property),
        true
      );
      break;
    }
    case "Identifier": {
      value = codegenPlace(temp, instrValue);
      break;
    }
    default: {
      assertExhaustive(
        instrValue,
        `Unexpected instruction value kind '${(instrValue as any).kind}'`
      );
    }
  }
  return value;
}

function codegenJsxElement(
  temp: Temporaries,
  place: Place
):
  | t.JSXText
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXElement
  | t.JSXFragment {
  const value = codegenPlace(temp, place);
  switch (value.type) {
    case "StringLiteral": {
      return t.jsxText(value.value);
    }
    default: {
      return t.jsxExpressionContainer(value);
    }
  }
}

export function codegenLVal(lval: LValue): t.LVal {
  return convertIdentifier(lval.place.identifier);
}

function codegenValue(
  temp: Temporaries,
  value: boolean | number | string | null | undefined
): t.Expression {
  if (typeof value === "number") {
    return t.numericLiteral(value);
  } else if (typeof value === "boolean") {
    return t.booleanLiteral(value);
  } else if (typeof value === "string") {
    return t.stringLiteral(value);
  } else if (value === null) {
    return t.nullLiteral();
  } else if (value === undefined) {
    return t.identifier("undefined");
  } else {
    assertExhaustive(value, "Unexpected primitive value kind");
  }
}

export function codegenPlace(temp: Temporaries, place: Place): t.Expression {
  todoInvariant(place.kind === "Identifier", "support scope values");
  let tmp = temp.get(place.identifier.id);
  if (tmp != null) {
    return tmp;
  }
  return convertIdentifier(place.identifier);
}

export function convertIdentifier(identifier: Identifier): t.Identifier {
  if (identifier.name !== null) {
    return t.identifier(`${identifier.name}`);
  }
  return t.identifier(`t${identifier.id}`);
}
