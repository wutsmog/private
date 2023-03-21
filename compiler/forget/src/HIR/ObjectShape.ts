/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import invariant from "invariant";
import { Effect } from "./HIR";
import { BuiltInType, FunctionType, PrimitiveType } from "./Types";

const PRIMITIVE_TYPE: PrimitiveType = {
  kind: "Primitive",
};

let nextAnonId = 0;
// use strings since they are easily debuggable, even though `Symbol()`
// might be more performant
function createAnonId(): string {
  return `<generated_${nextAnonId++}>`;
}

function addFunction(
  registry: ShapeRegistry,
  properties: Iterable<[string, BuiltInType | null]>,
  fn: FunctionSignature
): FunctionType {
  const shapeId = createAnonId();
  addShape(registry, shapeId, properties, fn);
  return {
    kind: "Function",
    shapeId,
  };
}

function addShape(
  registry: ShapeRegistry,
  id: string,
  properties: Iterable<[string, BuiltInType | null]>,
  functionType?: FunctionSignature
): ObjectShape {
  const shape: ObjectShape = {
    properties: new Map(properties),
    functionType: functionType ?? null,
  };

  invariant(
    !registry.has(id),
    `[ObjectShape] Could not add shape to registry: name ${id} already exists.`
  );
  registry.set(id, shape);
  return shape;
}

// Param type not recorded since it currently does not affect inference.
// Specifically, we currently do not:
//  - infer types based on their usage in argument position
//  - handle inference for overloaded / generic functions
export type FunctionSignature = {
  positionalParams: Array<Effect>;
  restParam: Effect | null;
  returnType: BuiltInType | null;
  calleeEffect: Effect;
};

export type ObjectShape = {
  properties: Map<string, BuiltInType | null>;
  functionType: FunctionSignature | null;
};

export type ShapeRegistry = Map<string, ObjectShape>;

/**
 * Shapes of built-in types
 */

// The only "entrypoints" should be Globals and recursive lookups from properties / functions
export const BUILTIN_SHAPES: ShapeRegistry = new Map();
export const ArrayShapeId = "Array";
export const ObjectShapeId = "Object";

/* Built-in array shape */
addShape(BUILTIN_SHAPES, ArrayShapeId, [
  [
    "at",
    addFunction(BUILTIN_SHAPES, [], {
      positionalParams: [Effect.Read],
      restParam: null,
      returnType: null,
      calleeEffect: Effect.Capture,
    }),
  ],
  [
    "concat",
    addFunction(BUILTIN_SHAPES, [], {
      positionalParams: [],
      restParam: Effect.Capture,
      returnType: {
        kind: "Object",
        shapeId: ArrayShapeId,
      },
      calleeEffect: Effect.Capture,
    }),
  ],
  ["length", PRIMITIVE_TYPE],
  [
    "push",
    addFunction(BUILTIN_SHAPES, [], {
      positionalParams: [],
      restParam: Effect.Capture,
      returnType: {
        kind: "Primitive",
      },
      calleeEffect: Effect.Store,
    }),
  ],
  // TODO: rest of Array properties
]);

/* Built-in Object shape */
addShape(BUILTIN_SHAPES, ObjectShapeId, [
  [
    "toString",
    addFunction(BUILTIN_SHAPES, [], {
      positionalParams: [],
      restParam: null,
      returnType: {
        kind: "Primitive",
      },
      calleeEffect: Effect.Read,
    }),
  ],
  // TODO:
  // hasOwnProperty, isPrototypeOf, propertyIsEnumerable, toLocaleString, valueOf
]);
