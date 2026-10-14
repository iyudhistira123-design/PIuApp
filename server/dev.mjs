// Node 22 watch + --env-file-if-exists can crash when the file is absent.
// Load an optional local environment here instead, without logging its values.
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
if (existsSync(".env")) loadEnvFile(".env");
process.env.NODE_ENV = "development";
await import("./index.mjs");
