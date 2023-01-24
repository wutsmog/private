/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { CompilerPipelineValue, run } from "babel-plugin-react-forget";
import clsx from "clsx";
import invariant from "invariant";
import { useSnackbar } from "notistack";
import { useDeferredValue, useMemo } from "react";
import { useMountEffect } from "../../hooks";
import { defaultStore } from "../../lib/defaultStore";
import {
  createMessage,
  initStoreFromUrlOrLocalStorage,
  MessageLevel,
  MessageSource,
  type Store,
} from "../../lib/stores";
import { useStore, useStoreDispatch } from "../StoreContext";
import Input from "./Input";
import { CompilerOutput, default as Output } from "./Output";

function parseFunctions(
  source: string
): Array<NodePath<t.FunctionDeclaration>> {
  const items: Array<NodePath<t.FunctionDeclaration>> = [];
  try {
    const ast = parse(source, {
      plugins: ["typescript", "jsx"],
      sourceType: "module",
    });
    traverse(ast, {
      FunctionDeclaration: {
        enter(nodePath) {
          items.push(nodePath);
        },
      },
    });
  } catch (e) {
    console.error(e);
  }
  return items;
}

function compile(source: string): CompilerOutput {
  try {
    const results = new Map<string, CompilerPipelineValue[]>();
    const upsert = (result: CompilerPipelineValue) => {
      const entry = results.get(result.name);
      if (Array.isArray(entry)) {
        entry.push(result);
      } else {
        results.set(result.name, [result]);
      }
    };
    for (const fn of parseFunctions(source)) {
      for (const result of run(fn)) {
        upsert(result);
      }
    }
    return { kind: "ok", results };
  } catch (error: any) {
    console.error(error);
    return { kind: "err", error };
  }
}

export default function Editor() {
  const store = useStore();
  const deferredStore = useDeferredValue(store);
  const dispatchStore = useStoreDispatch();
  const { enqueueSnackbar } = useSnackbar();
  const compilerOutput = useMemo(
    () => compile(deferredStore.source),
    [deferredStore.source]
  );

  useMountEffect(() => {
    let mountStore: Store;
    try {
      mountStore = initStoreFromUrlOrLocalStorage();
    } catch (e) {
      invariant(e instanceof Error, "Only Error may be caught.");
      enqueueSnackbar(e.message, {
        variant: "message",
        ...createMessage(
          "Bad URL - fell back to the default Playground.",
          MessageLevel.Info,
          MessageSource.Playground
        ),
      });
      mountStore = defaultStore;
    }
    dispatchStore({
      type: "setStore",
      payload: { store: mountStore },
    });
  });

  return (
    <>
      <div className="flex basis">
        <div
          style={{ minWidth: 650 }}
          className={clsx("relative sm:basis-1/4")}
        >
          <Input
            errors={
              compilerOutput.kind === "err" ? compilerOutput.error.details : []
            }
          />
        </div>
        <div className={clsx("flex sm:flex")}>
          <Output store={deferredStore} compilerOutput={compilerOutput} />
        </div>
      </div>
    </>
  );
}
