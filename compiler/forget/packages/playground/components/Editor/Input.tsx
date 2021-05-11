/*
 * Copyright (c) Facebook, Inc. and its affiliates.
 */

import MonacoEditor, { type Monaco } from "@monaco-editor/react";
import type { Diagnostic } from "babel-plugin-react-forget";
import invariant from "invariant";
import type { editor } from "monaco-editor";
import { useEffect, useState } from "react";
import { renderForgetMarkers } from "../../lib/forgetMonacoDiagnostics";
import { createInputFile, getSelectedFile } from "../../lib/stores";
import { useStore, useStoreDispatch } from "../StoreContext";
import InputTabSelector from "./InputTabSelector";
import { monacoOptions } from "./monacoOptions";
// TODO: Make TS recognize .d.ts files, in addition to loading them with webpack.
// @ts-ignore
import React$Types from "../../node_modules/@types/react/index.d.ts";

export default function Input({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const [monaco, setMonaco] = useState<Monaco | null>(null);
  const store = useStore();
  const dispatchStore = useStoreDispatch();
  const selectedFile = getSelectedFile(store);

  useEffect(() => {
    if (!monaco) return;
    const uri = monaco.Uri.parse(`file:///${selectedFile.id}`);
    const model = monaco.editor.getModel(uri);
    invariant(model, "Model must exist for the selected input file.");
    renderForgetMarkers({ monaco, model, diagnostics });
  }, [diagnostics, monaco, selectedFile.id]);

  // Set tab width to 2 spaces for the selected input file.
  useEffect(() => {
    if (!monaco) return;
    const uri = monaco.Uri.parse(`file:///${selectedFile.id}`);
    const model = monaco.editor.getModel(uri);
    invariant(model, "Model must exist for the selected input file.");
    // N.B. that `tabSize` is a model property, not an editor property.
    // So, the tab size has to be set per model.
    model.updateOptions({ tabSize: 2 });
  }, [monaco, selectedFile.id]);

  useEffect(() => {
    if (!monaco) return;
    // Let Monaco Editor know of the input files so that its language
    // service can correctly resolve import statements.
    store.files.forEach((file) => {
      const lib = [file.content, `file:///${file.id}`] as const;
      monaco.languages.typescript.javascriptDefaults.addExtraLib(...lib);
      monaco.languages.typescript.typescriptDefaults.addExtraLib(...lib);
    });
  }, [monaco, store.files]);

  const handleChange = (value: string | undefined) => {
    if (!value) return;

    dispatchStore({
      type: "updateFile",
      payload: {
        file: createInputFile(store.selectedFileId, value),
      },
    });
  };

  const handleMount = (_: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    setMonaco(monaco);

    // Ignore "can only be used in TypeScript files." errors, since
    // we want to support syntax highlighting for Flow (*.js) files
    // and Flow is not a built-in language.
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      diagnosticCodesToIgnore: [
        8002, 8003, 8004, 8005, 8006, 8008, 8009, 8010, 8011, 8012, 8013,
      ],
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    const tscOptions = {
      allowNonTsExtensions: true,
      target: monaco.languages.typescript.ScriptTarget.ES2015,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      jsx: monaco.languages.typescript.JsxEmit.Preserve,
      typeRoots: ["node_modules/@types"],
      allowSyntheticDefaultImports: true,
    };
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
      tscOptions
    );
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      ...tscOptions,
      checkJs: true,
      allowJs: true,
    });

    // Add React type declarations to Monaco
    const reactLib = [
      React$Types,
      "file:///node_modules/@types/react/index.d.ts",
    ] as const;
    monaco.languages.typescript.javascriptDefaults.addExtraLib(...reactLib);
    monaco.languages.typescript.typescriptDefaults.addExtraLib(...reactLib);

    // Remeasure the font in case the custom font is loaded only after
    // Monaco Editor is mounted.
    // N.B. that this applies also to the output editor as it seems
    // Monaco Editor instances share the same font config.
    document.fonts.ready.then(() => {
      monaco.editor.remeasureFonts();
    });
  };

  return (
    <div className="relative flex flex-col flex-none border-r border-gray-200">
      <InputTabSelector />
      {/* Restrict MonacoEditor's height, since the config autoLayout:true
          will grow the editor to fit within parent element */}
      <div className="w-full h-monaco_small sm:h-monaco">
        <MonacoEditor
          path={selectedFile.id}
          // .js and .jsx files are specified to be TS so that Monaco can actually
          // check their syntax using its TS language service. They are still JS files
          // due to their extensions, so TS language features don't work.
          language={
            selectedFile.language === "javascript"
              ? "typescript"
              : selectedFile.language
          }
          value={selectedFile.content}
          onMount={handleMount}
          onChange={handleChange}
          options={monacoOptions}
        />
      </div>
    </div>
  );
}
