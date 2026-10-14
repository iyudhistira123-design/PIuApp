import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Prebundle lazy editor imports at startup; avoid dependency-optimizer reloads mid-edit.
  optimizeDeps: {
    include: Array.from(
      new Set(
        [
          "src/workspace/CodeEditor.tsx",
          "src/workspace/monaco-features.ts",
        ].flatMap((file) =>
          [
            ...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(
              /from "(monaco-editor[^"?]+)"|import "(monaco-editor[^"?]+)"/g,
            ),
          ].map((m) => m[1] || m[2]),
        ),
      ),
    ),
    needsInterop: [
      "monaco-editor/esm/vs/editor/contrib/inPlaceReplace/browser/inPlaceReplace.js",
      "monaco-editor/esm/vs/editor/contrib/diffEditorBreadcrumbs/browser/contribution.js",
    ],
  },
  server: {
    host: "0.0.0.0",
    port: 3001,
    strictPort: true,
    allowedHosts: true,
    proxy: { "/api": "http://127.0.0.1:3002" },
  },
  preview: {
    host: "0.0.0.0",
    port: 3001,
    strictPort: true,
    allowedHosts: true,
    proxy: { "/api": "http://127.0.0.1:3002" },
  },
  build: { chunkSizeWarningLimit: 1000 },
});
