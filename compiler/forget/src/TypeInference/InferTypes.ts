import * as t from "@babel/types";
import invariant from "invariant";
import { Environment } from "../HIR";
import {
  HIRFunction,
  Instruction,
  makeType,
  Type,
  typeEquals,
  TypeId,
  TypeVar,
} from "../HIR/HIR";
import { ArrayShapeId, ObjectShapeId } from "../HIR/ObjectShape";
import { eachInstructionLValue, eachInstructionOperand } from "../HIR/visitors";

function isPrimitiveBinaryOp(op: t.BinaryExpression["operator"]): boolean {
  switch (op) {
    case "+":
    case "-":
    case "/":
    case "%":
    case "*":
    case "**":
    case "&":
    case "|":
    case ">>":
    case "<<":
    case "^":
    case ">":
    case "<":
    case ">=":
    case "<=":
    case "|>":
      return true;
    default:
      return false;
  }
}

export default function (func: HIRFunction): void {
  const unifier = new Unifier(func.env);
  for (const e of generate(func)) {
    unifier.unify(e.left, e.right);
  }
  apply(func, unifier);
}

function apply(func: HIRFunction, unifier: Unifier): void {
  for (const [_, block] of func.body.blocks) {
    for (const phi of block.phis) {
      phi.type = unifier.get(phi.type);
    }
    for (const instr of block.instructions) {
      for (const operand of eachInstructionLValue(instr)) {
        operand.identifier.type = unifier.get(operand.identifier.type);
      }
      for (const place of eachInstructionOperand(instr)) {
        place.identifier.type = unifier.get(place.identifier.type);
      }
      const { lvalue } = instr;
      lvalue.identifier.type = unifier.get(lvalue.identifier.type);
    }
  }
}

type FunctionCallType = {
  kind: "FunctionCall";
  returnType: TypeVar;
};

type PolyType =
  | {
      kind: "Property";
      object: Type;
      propertyName: string;
    }
  | FunctionCallType;

type TypeEquation = {
  left: Type;
  right: Type | PolyType;
};

function equation(left: Type, right: Type | PolyType): TypeEquation {
  return {
    left,
    right,
  };
}

function* generate(
  func: HIRFunction
): Generator<TypeEquation, void, undefined> {
  for (const [_, block] of func.body.blocks) {
    for (const phi of block.phis) {
      yield equation(phi.type, {
        kind: "Phi",
        operands: [...phi.operands.values()].map((id) => id.type),
      });
    }

    for (const instr of block.instructions) {
      yield* generateInstructionTypes(func.env, instr);
    }
  }
}

function* generateInstructionTypes(
  env: Environment,
  instr: Instruction
): Generator<TypeEquation, void, undefined> {
  const { lvalue, value } = instr;
  const left = lvalue.identifier.type;

  switch (value.kind) {
    case "JSXText":
    case "Primitive": {
      yield equation(left, { kind: "Primitive" });
      break;
    }

    case "UnaryExpression": {
      yield equation(left, { kind: "Primitive" });
      break;
    }

    case "LoadLocal": {
      yield equation(left, value.place.identifier.type);
      break;
    }

    case "StoreLocal": {
      yield equation(left, value.value.identifier.type);
      yield equation(
        value.lvalue.place.identifier.type,
        value.value.identifier.type
      );
      break;
    }

    case "BinaryExpression": {
      if (isPrimitiveBinaryOp(value.operator)) {
        yield equation(value.left.identifier.type, { kind: "Primitive" });
        yield equation(value.right.identifier.type, { kind: "Primitive" });
      }
      yield equation(left, { kind: "Primitive" });
      break;
    }

    case "LoadGlobal": {
      const hook = env.getHookDeclaration(value.name);
      if (hook !== null) {
        const type: Type = { kind: "Hook", definition: hook };
        yield equation(left, type);
      }
      break;
    }

    case "CallExpression": {
      const hook =
        value.callee.identifier.name !== null
          ? env.getHookDeclaration(value.callee.identifier.name)
          : null;
      let type: Type;
      if (hook !== null) {
        type = { kind: "Hook", definition: hook };
      } else {
        type = { kind: "Function", shapeId: null };
      }
      yield equation(value.callee.identifier.type, type);
      break;
    }

    case "ObjectExpression": {
      invariant(left !== null, "invald object expression");
      yield equation(left, { kind: "Object", shapeId: ObjectShapeId });
      break;
    }

    case "ArrayExpression": {
      if (left) {
        yield equation(left, { kind: "Object", shapeId: ArrayShapeId });
      }
      break;
    }

    case "PropertyLoad": {
      if (left) {
        yield equation(left, {
          kind: "Property",
          object: value.object.identifier.type,
          propertyName: value.property,
        });
      }
      break;
    }

    case "PropertyCall": {
      const returnType = makeType();
      yield equation(value.property.identifier.type, {
        kind: "FunctionCall",
        returnType,
      });
      if (left) {
        yield equation(left, returnType);
      }
    }
  }
}

type Substitution = Map<TypeId, Type>;
class Unifier {
  substitutions: Substitution = new Map();
  env: Environment;

  constructor(env: Environment) {
    this.env = env;
  }

  unifyFunctionCall(tA: Type, tB: FunctionCallType): void {
    const propertyType = this.get(tA);
    if (propertyType.kind === "Function") {
      const fn = this.env.getFunctionSignature(propertyType);
      const returnType = fn?.returnType ?? null;
      if (returnType !== null) {
        this.unify(tB.returnType, returnType);
      }
    }
  }

  unify(tA: Type, tB: Type | PolyType): void {
    if (tB.kind === "Property") {
      const objectType = this.get(tB.object);
      const propertyType = this.env.getPropertyType(
        objectType,
        tB.propertyName
      );
      if (propertyType !== null) {
        this.unify(tA, propertyType);
      }
      return;
    } else if (tB.kind === "FunctionCall") {
      this.unifyFunctionCall(tA, tB);
      return;
    }

    if (typeEquals(tA, tB)) {
      return;
    }

    if (tA.kind === "Type") {
      this.bindVariableTo(tA, tB);
      return;
    }

    if (tB.kind === "Type") {
      this.bindVariableTo(tB, tA);
      return;
    }
  }

  bindVariableTo(v: TypeVar, type: Type): void {
    if (this.substitutions.has(v.id)) {
      this.unify(this.substitutions.get(v.id)!, type);
      return;
    }

    if (type.kind === "Type" && this.substitutions.has(type.id)) {
      this.unify(v, this.substitutions.get(type.id)!);
      return;
    }

    if (type.kind === "Phi") {
      const operands = new Set(type.operands.map((i) => this.get(i).kind));

      invariant(operands.size > 0, "there should be at least one operand");
      const kind = operands.values().next().value;

      // there's only one unique type and it's not a type var
      if (operands.size === 1 && kind !== "Type") {
        this.unify(v, type.operands[0]);
        return;
      }
    }

    if (this.occursCheck(v, type)) {
      throw new Error("cycle detected");
    }

    this.substitutions.set(v.id, type);
  }

  occursCheck(v: TypeVar, type: Type): boolean {
    if (typeEquals(v, type)) return true;

    if (type.kind === "Type" && this.substitutions.has(type.id)) {
      return this.occursCheck(v, this.substitutions.get(type.id)!);
    }

    if (type.kind === "Phi") {
      return type.operands.some((o) => this.occursCheck(v, o));
    }

    return false;
  }

  get(type: Type): Type {
    if (type.kind === "Type") {
      if (this.substitutions.has(type.id)) {
        return this.get(this.substitutions.get(type.id)!);
      }
    }

    if (type.kind === "Phi") {
      return { kind: "Phi", operands: type.operands.map((o) => this.get(o)) };
    }

    return type;
  }
}
