import { useIDETheme } from "./IDETheme";
import Editor, { DiffEditor, loader } from "@monaco-editor/react";
// Explicit language registration avoids bundling every language shipped by Monaco.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "./monaco-features";
import "monaco-editor/esm/vs/language/typescript/monaco.contribution";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import "monaco-editor/esm/vs/language/css/monaco.contribution";
import "monaco-editor/esm/vs/language/html/monaco.contribution";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution";
import "monaco-editor/esm/vs/basic-languages/css/css.contribution";
import "monaco-editor/esm/vs/basic-languages/html/html.contribution";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import "monaco-editor/esm/vs/basic-languages/lua/lua.contribution";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
(self as any).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "typescript" || label === "javascript") return new tsWorker();
    if (label === "json") return new jsonWorker();
    if (label === "css") return new cssWorker();
    if (label === "html") return new htmlWorker();
    return new editorWorker();
  },
};
loader.config({ monaco });
monaco.editor.defineTheme("piwu-workbench", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#1f1f1f",
    "editor.foreground": "#d4d4d4",
    "editorLineNumber.foreground": "#858585",
    "editorLineNumber.activeForeground": "#cccccc",
    "editorGutter.background": "#1f1f1f",
    "editor.lineHighlightBackground": "#ffffff05",
    "editor.lineHighlightBorder": "#ffffff07",
    "editor.selectionBackground": "#264f78",
    "editorIndentGuide.background1": "#383838",
    "editorCursor.foreground": "#aeafad",
    "editorWidget.background": "#252526",
  },
});
monaco.editor.defineTheme("piwu-workbench-light", {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#222c3a",
    "editorGutter.background": "#ffffff",
    "editorLineNumber.foreground": "#64748b",
    "editor.selectionBackground": "#d9e9fc",
    "editor.lineHighlightBackground": "#f3f6fa",
    "editorWidget.background": "#f4f6f8",
  },
});
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
});
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  jsx: monaco.languages.typescript.JsxEmit.React,
  allowNonTsExtensions: true,
  allowJs: true,
  target: monaco.languages.typescript.ScriptTarget.ESNext,
});
export default function CodeEditor({
  path,
  content,
  onChange,
  original,
  line,
  readOnly = false,
  onCursorChange,
}: {
  path: string;
  content: string;
  onChange: (s: string) => void;
  original?: string;
  line?: number;
  readOnly?: boolean;
  onCursorChange?: (p: { lineNumber: number; column: number }) => void;
}) {
  const { theme } = useIDETheme();
  const editorTheme =
    theme === "light" ? "piwu-workbench-light" : "piwu-workbench";
  const language = /\.lua(u)?$/.test(path)
    ? "lua"
    : path.endsWith(".css")
      ? "css"
      : path.endsWith(".json")
        ? "json"
        : path.endsWith(".md")
          ? "markdown"
          : path.endsWith(".html")
            ? "html"
            : "typescript";
  const options = {
    readOnly,
    fontSize: 13,
    lineHeight: 22,
    lineNumbersMinChars: 4,
    renderLineHighlight: "all" as const,
    renderWhitespace: "selection" as const,
    bracketPairColorization: { enabled: true },
    guides: { indentation: true, bracketPairs: true },
    fontFamily: '"JetBrains Mono", monospace',
    minimap: { enabled: false },
    padding: { top: 12 },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: "on" as const,
  };
  if (original !== undefined)
    return (
      <DiffEditor
        height="100%"
        language={language}
        original={original}
        modified={content}
        theme={editorTheme}
        options={{ ...options, readOnly: true, renderSideBySide: false }}
      />
    );
  return (
    <Editor
      height="100%"
      path={path}
      value={content}
      language={language}
      theme={editorTheme}
      options={options}
      loading={<div className="ws-loading">Memuat editor…</div>}
      onChange={(value) => onChange(value || "")}
      onMount={(editor) => {
        onCursorChange?.(editor.getPosition() || { lineNumber: 1, column: 1 });
        const positionListener = editor.onDidChangeCursorPosition((e) =>
          onCursorChange?.(e.position),
        );
        editor.onDidDispose(() => positionListener.dispose());
        if (line) {
          editor.revealLineInCenter(line);
          editor.setPosition({ lineNumber: line, column: 1 });
        }
      }}
    />
  );
}
