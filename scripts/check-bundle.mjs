import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const files = readdirSync("dist/assets");
const editor = files.filter((f) => /^CodeEditor-.*\.js$/.test(f));
if (editor.length !== 1)
  throw new Error("Build dahulu; satu entry CodeEditor harus tersedia.");
const bytes = readFileSync("dist/assets/" + editor[0]);
const js = files.filter((f) => f.endsWith(".js"));
const report = {
  editorBytes: bytes.length,
  editorGzipBytes: gzipSync(bytes).length,
  javaScriptAssets: js.length,
  totalJavaScriptBytes: js.reduce(
    (n, f) => n + readFileSync("dist/assets/" + f).length,
    0,
  ),
  budgets: {
    editorBytes: 3250000,
    editorGzipBytes: 840000,
    totalJavaScriptBytes: 14000000,
  },
  notice:
    "Worker TypeScript tetap disertakan dan dimuat saat diperlukan. Anggaran ukuran bukan ukuran transfer halaman awal.",
};
console.log(JSON.stringify(report, null, 2));
if (
  report.editorBytes > report.budgets.editorBytes ||
  report.editorGzipBytes > report.budgets.editorGzipBytes ||
  report.totalJavaScriptBytes > report.budgets.totalJavaScriptBytes
)
  process.exitCode = 1;
