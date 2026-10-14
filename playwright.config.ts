import { defineConfig } from "@playwright/test";
const isolated = process.env.UI_TEST_FIXTURES === "1";
export default defineConfig({
  webServer: isolated
    ? {
        command:
          "node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 3101 --strictPort",
        url: "http://localhost:3101",
        reuseExistingServer: false,
        env: {
          VITE_SUPABASE_URL: "https://piwu-auth-fixture.invalid",
          VITE_SUPABASE_ANON_KEY: "public-test-placeholder-not-a-credential",
        },
      }
    : undefined,
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: isolated ? "http://localhost:3101" : "http://localhost:3001",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
        }
      : undefined,
  },
  reporter: "list",
});
