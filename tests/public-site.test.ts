import test from "node:test";
import assert from "node:assert/strict";
import { createPublicSiteReader } from "../server/lib/public-site.mjs";
import {
  defaultSite,
  siteSettings,
  enforcePlatform,
} from "../server/lib/platform.mjs";
import { createApp } from "../server/app.mjs";
import { createContext } from "../server/lib/context.mjs";
function fixture() {
  const state = {
    config: {
      data: {
        revision: 1,
        value: { ...defaultSite, hero_title: "Judul dari cloud" },
      },
      error: null,
    } as any,
    feed: {
      data: [{ id: "public", title: "Kabar publik" }],
      error: null,
    } as any,
    reads: 0,
    rpc: [] as any[],
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => chain,
    abortSignal: async (signal: AbortSignal) => {
      assert.ok(signal instanceof AbortSignal);
      state.reads++;
      return state.config;
    },
  };
  return {
    state,
    ctx: {
      admin: {
        from: () => chain,
        rpc: (_name: string, args: any) => ({
          abortSignal: async () => {
            state.rpc.push(args);
            return state.feed;
          },
        }),
      },
    },
  };
}
test("Public site defaults when unconfigured and deduplicates live reads without recipient spoofing", async () => {
  const unconfigured = await createPublicSiteReader({ admin: null })();
  assert.equal(unconfigured.availability, "not_configured");
  assert.equal(unconfigured.source, "defaults");
  const { state, ctx } = fixture();
  const read = createPublicSiteReader(ctx);
  const results = await Promise.all([read(), read(), read()]);
  assert.equal(state.reads, 1);
  assert.equal(results[0].settings.hero_title, "Judul dari cloud");
  assert.equal(results[0].source, "live");
  assert.deepEqual(state.rpc, [{ p_user: null }]);
});
test("Public settings failure backs off and recovers; missing migration is not mistaken for live data", async () => {
  const { state, ctx } = fixture();
  let now = 1000;
  state.config = { data: null, error: { code: "", message: "fetch failed" } };
  const read = createPublicSiteReader(ctx, { now: () => now, retryMs: 1000 });
  let result = await read();
  assert.equal(result.availability, "unavailable");
  assert.equal(result.source, "defaults");
  assert.equal(result.issue, "database_unavailable");
  assert.deepEqual(result.broadcasts, []);
  await read();
  assert.equal(state.reads, 1);
  now += 1001;
  state.config = { data: null, error: { code: "PGRST205" } };
  result = await read();
  assert.equal(result.issue, "setup_required");
  assert.equal(result.configured, false);
  now += 1001;
  state.config = { data: { revision: 1, value: defaultSite }, error: null };
  result = await read();
  assert.equal(result.availability, "ready");
  assert.equal(result.source, "live");
});
test("Public fallback retains last known maintenance settings but never replays cached broadcasts", async () => {
  const { state, ctx } = fixture();
  state.config.data.value = {
    ...defaultSite,
    maintenance: true,
    hero_title: "Contoh",
  };
  const read = createPublicSiteReader(ctx);
  await read();
  state.feed = {
    data: null,
    error: { code: "", message: "Sensitive upstream details must not leak" },
  };
  const result = await read();
  assert.equal(result.source, "cached");
  assert.equal(result.settings.maintenance, true);
  assert.deepEqual(result.broadcasts, []);
  assert.equal(result.issue, "announcements_unavailable");
  assert.ok(!JSON.stringify(result).includes("Sensitive"));
});
test("Public route tolerates unavailable database but privileged service checks still fail closed", async () => {
  const env = {
    VITE_SUPABASE_URL: "https://fixture.supabase.co",
    VITE_SUPABASE_ANON_KEY: "fixture",
    SUPABASE_SERVICE_ROLE_KEY: "fixture",
  };
  const ctx = createContext(env, async () => {
    throw new Error("Network unavailable");
  });
  const { app } = createApp({ env, context: ctx });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  try {
    const result = await fetch(
      "http://127.0.0.1:" +
        (server.address() as any).port +
        "/api/public/site?user_id=spoofed",
    );
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.source, "defaults");
    assert.equal(body.availability, "unavailable");
    assert.deepEqual(body.broadcasts, []);
    await assert.rejects(
      () => siteSettings(ctx),
      (e: any) => e.status === 503,
    );
    await assert.rejects(
      () => enforcePlatform(ctx, { path: "/api/checkout", method: "POST" }),
      (e: any) => e.status === 503,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
