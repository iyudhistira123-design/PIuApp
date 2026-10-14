import test from "node:test";
import assert from "node:assert/strict";
import { createReadinessReader } from "../server/lib/readiness.mjs";
const env = {
  VITE_SUPABASE_URL: "https://example.test",
  VITE_SUPABASE_ANON_KEY: "test-public",
  SUPABASE_SERVICE_ROLE_KEY: "test-private",
  LLM_API_KEY: "test-ai-private",
  LLM_BASE_URL: "https://model.test",
  LLM_MODEL: "test-model",
};
test("readiness never calls paid providers or returns keys; configured is not verified", async () => {
  const calls: string[] = [];
  const read = createReadinessReader({
    env,
    fetcher: async (url: string) => {
      calls.push(url);
      return Response.json([]);
    },
  });
  const result = await read();
  assert.equal(result.database, "reachable");
  assert.equal(result.auth, "reachable");
  assert.equal(result.ai, "configured_unverified");
  assert.equal(result.sandbox, "not_configured");
  assert.equal(calls.length, 7);
  assert.ok(calls.every((s) => s.startsWith("https://example.test/")));
  assert.ok(!JSON.stringify(result).includes("test-private"));
  assert.ok(!JSON.stringify(result).includes("test-ai-private"));
  await read();
  assert.equal(calls.length, 7);
});
test("readiness distinguishes unavailable, schema missing, and missing configuration with dedup/retry", async () => {
  let n = 0,
    time = 0,
    fail = true;
  const read = createReadinessReader(
    {
      env,
      fetcher: async () => {
        n++;
        if (fail) throw new Error("private detail never exposed");
        return Response.json({ code: "42P01" }, { status: 404 });
      },
    },
    { now: () => time, ttlMs: 30 },
  );
  const [a, b] = await Promise.all([read(), read()]);
  assert.equal(a, b);
  assert.equal(n, 7);
  assert.equal(a.database, "unreachable");
  fail = false;
  time = 31;
  assert.equal((await read()).database, "schema_missing");
  assert.equal(n, 14);
  const empty = await createReadinessReader({
    env: {},
    fetcher: () => {
      throw new Error("must not call");
    },
  })();
  assert.equal(empty.auth, "not_configured");
  assert.equal(empty.mode, "real");
});

test("readiness detects missing Studio and dataset migrations even when core tables respond", async () => {
  const result = await createReadinessReader({
    env,
    fetcher: async (url: string) =>
      url.includes("studio_bridges") || url.includes("project_datasets")
        ? Response.json({ code: "PGRST205" }, { status: 404 })
        : Response.json([]),
  })();
  assert.equal(result.database, "reachable");
  assert.equal(result.studio, "schema_missing");
  assert.equal(result.datasets, "schema_missing");
  assert.equal(result.administration, "reachable");
});
