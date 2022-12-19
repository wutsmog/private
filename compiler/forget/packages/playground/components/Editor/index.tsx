/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import clsx from "clsx";
import invariant from "invariant";
import { useSnackbar } from "notistack";
import { useDeferredValue, useState } from "react";
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
import { TabTypes } from "../TabbedWindow";
import Input from "./Input";
import Output from "./Output";

export default function Editor() {
  const store = useStore();
  const deferredStore = useDeferredValue(store);
  const dispatchStore = useStoreDispatch();
  const { enqueueSnackbar } = useSnackbar();
  const [tabsOpen, setTabsOpen] = useState<Map<TabTypes, boolean>>(new Map());

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
          <Input />
        </div>
        <div className={clsx("flex sm:flex")}>
          <Output
            tabsOpen={tabsOpen}
            setTabsOpen={setTabsOpen}
            store={deferredStore}
          />
        </div>
      </div>
    </>
  );
}
