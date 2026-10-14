// Offline-from-CDN Chromium setup for Linux sandboxes. Browser binaries and
// native libraries come from the locked npm dependency, not an unpinned URL.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chromium from "@sparticuz/chromium";
const require = createRequire(import.meta.url);
if (process.platform !== "linux")
  throw new Error(
    "Runner ini khusus Linux. Gunakan npm run test:e2e dengan browser Playwright pada platform lain.",
  );
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.resolve("@sparticuz/chromium"))),
  "..",
);
const nativeRoot = path.resolve("node_modules/.chromium-libs");
mkdirSync(nativeRoot, { recursive: true });
const tarFile = path.join(nativeRoot, "al2023.tar");
writeFileSync(
  tarFile,
  brotliDecompressSync(
    readFileSync(path.join(packageRoot, "bin/al2023.tar.br")),
  ),
);
execFileSync("tar", ["xf", tarFile, "-C", nativeRoot], { timeout: 15000 });
const child = spawn(
  process.execPath,
  [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CHROMIUM_PATH: await chromium.executablePath(),
      LD_LIBRARY_PATH:
        path.join(nativeRoot, "lib") +
        ":" +
        (process.env.LD_LIBRARY_PATH || ""),
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.once("error", () => {
  console.error("Browser test runner tidak dapat dimulai.");
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
