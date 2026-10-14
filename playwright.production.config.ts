import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  webServer: undefined,
  testMatch: "**/production-bundle.smoke.ts",
  use: {
    ...base.use,
    baseURL: process.env.PIWU_VERIFY_URL || "http://127.0.0.1:3201",
    reducedMotion: "reduce",
  },
});
