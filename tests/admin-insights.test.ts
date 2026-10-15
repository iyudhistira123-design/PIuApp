import test from "node:test";
import assert from "node:assert/strict";
import {
  aiOverview,
  accountDetail,
  maskBaseUrl,
  runtimeOverview,
  tierMapping,
} from "../server/lib/admin-insights.mjs";
import { resetModelCache } from "../server/lib/ai-models.mjs";
import { createApp } from "../server/app.mjs";
import { defaultSite } from "../server/lib/platform.mjs";

const ids = {
  root: "b8c3a1d2-1111-4222-8333-444455556666",
  member: "c9d4b2e3-2222-4333-8444-555566667777",
};

// Fixture: a service-role Supabase stand-in for the read-only insight queries,
// plus a provider that serves a multi-vendor model list.
function fixture({
  env = {},
  models = ["deepseek-chat", "claude-sonnet-4-20250514", "glm-4.6"],
  providerDown = false,
  runtimeSchema = true,
} = {}) {
  const now = Date.now();
  const state = {
    ledger: [
      {
        id: "l1",
        user_id: ids.member,
        delta: -3,
        reason: "ai",
        reference: "reserve:r1",
        created_at: new Date(now - 3600_000).toISOString(),
      },
      {
        id: "l2",
        user_id: ids.member,
        delta: 30,
        reason: "Pembayaran terverifikasi",
        reference: "payment:p1",
        created_at: new Date(now - 7200_000).toISOString(),
      },
      {
        id: "l3",
        user_id: ids.member,
        delta: 1,
        reason: "Pengembalian proses gagal",
        reference: "refund:r2",
        created_at: new Date(now - 86_400_000).toISOString(),
      },
    ],
    reservations: [
      {
        id: "r1",
        user_id: ids.member,
        amount: 3,
        purpose: "ai",
        status: "settled",
        created_at: new Date(now - 3600_000).toISOString(),
      },
      {
        id: "r2",
        user_id: ids.member,
        amount: 8,
        purpose: "publish",
        status: "refunded",
        created_at: new Date(now - 86_400_000).toISOString(),
      },
    ],
    slots: [
      {
        user_id: ids.member,
        project_id: "aaaaaaaa-1111-4111-8111-111111111111",
        owner: "server-a",
        expires_at: new Date(now + 600_000).toISOString(),
      },
      {
        user_id: ids.member,
        project_id: "bbbbbbbb-2222-4222-8222-222222222222",
        owner: "server-b",
        expires_at: new Date(now - 600_000).toISOString(),
      },
    ],
    buckets: [
      {
        key: "hash-a",
        hits: 3,
        expires_at: new Date(now + 60_000).toISOString(),
      },
      {
        key: "hash-b",
        hits: 9,
        expires_at: new Date(now - 60_000).toISOString(),
      },
    ],
    calls: [] as string[],
  };
  const fetcher = async (input: any, init: any = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const path = url.pathname;
    state.calls.push(path + (url.search || ""));
    const json = (data: any, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (path.endsWith("/models")) {
      if (providerDown) throw new Error("network down");
      return json({ data: models.map((id) => ({ id })) });
    }
    if (path === "/auth/v1/user") {
      const token = new Headers(init.headers).get("Authorization");
      return token?.endsWith("root")
        ? json({
            id: ids.root,
            email: "root@example.test",
            email_confirmed_at: "2026-01-01",
            user_metadata: { role: "superadmin" },
          })
        : json({});
    }
    if (path.startsWith("/auth/v1/admin/users/"))
      return url.pathname.endsWith(ids.member)
        ? json({
            user: {
              id: ids.member,
              email: "member@example.test",
              user_metadata: { name: "Anggota" },
              created_at: "2026-02-02",
              last_sign_in_at: "2026-03-03",
              email_confirmed_at: "2026-02-02",
            },
          })
        : json({ message: "not found" }, 404);
    if (path === "/rest/v1/platform_admins")
      return json([{ role: "superadmin" }]);
    if (path === "/rest/v1/platform_user_controls") return json([]);
    if (path === "/rest/v1/credit_accounts")
      return json({ balance: 128, updated_at: "2026-03-04" });
    // Honor the filters the routes rely on, as a real PostgREST would.
    const apply = (rows: any[]) => {
      let out = rows;
      for (const [key, raw] of url.searchParams) {
        if (["select", "limit", "order", "head"].includes(key)) continue;
        const [op, ...tail] = raw.split(".");
        const value = tail.join(".");
        if (op === "eq") out = out.filter((r) => String(r[key]) === value);
        if (op === "gte")
          out = out.filter((r) => Date.parse(r[key]) >= Date.parse(value));
      }
      return out;
    };
    if (path === "/rest/v1/credit_ledger") return json(apply(state.ledger));
    if (path === "/rest/v1/credit_reservations")
      return json(apply(state.reservations));
    if (path === "/rest/v1/projects") return json([], 200);
    if (path === "/rest/v1/runtime_sandbox_slots")
      return runtimeSchema
        ? json(state.slots)
        : json({ code: "42P01", message: "relation does not exist" }, 404);
    if (path === "/rest/v1/runtime_rate_buckets")
      return runtimeSchema
        ? json(state.buckets)
        : json({ code: "42P01", message: "relation does not exist" }, 404);
    if (path === "/rest/v1/site_configuration")
      return json([{ revision: 1, value: defaultSite }]);
    throw new Error("Unexpected fixture query: " + path + url.search);
  };
  return { state, fetcher, env };
}

async function serve(options: any = {}) {
  const fx = fixture(options);
  const { app } = createApp({
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test",
      SUPABASE_SERVICE_ROLE_KEY: "server-test",
      LLM_BASE_URL: "https://api.deepseek.test/v1",
      LLM_API_KEY: "sk-test-not-a-real-credential-000000",
      ...options.env,
    },
    fetcher: fx.fetcher,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((ready) => server.once("listening", ready));
  const url = "http://127.0.0.1:" + (server.address() as any).port + "/api";
  return { fx, server, url };
}

const get = async (url: string, token = "root") => {
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + token },
  });
  return { status: response.status, body: await response.json() };
};

test("admin AI overview reports the provider catalogue, tiers and usage without leaking the key", async () => {
  resetModelCache();
  const { fx, server, url } = await serve({
    env: { LLM_MODEL_KUAT: "claude-sonnet-4-20250514" },
  });
  try {
    const { status, body } = await get(url + "/admin/ai");
    assert.equal(status, 200);
    assert.equal(body.configured, true);
    assert.equal(body.keyPresent, true);
    assert.equal(body.keyShown, false);
    assert.equal(body.baseHost, "api.deepseek.test");
    assert.equal(body.basePath, "/v1");
    assert.deepEqual(body.catalog.models, [
      "claude-sonnet-4-20250514",
      "deepseek-chat",
      "glm-4.6",
    ]);
    assert.equal(body.catalog.count, 3);
    assert.ok(body.catalog.groups.some((g: any) => g.label === "DeepSeek"));
    const strong = body.tiers.find((t: any) => t.tier === "Kuat");
    assert.equal(strong.model, "claude-sonnet-4-20250514");
    assert.equal(strong.source, "LLM_MODEL_KUAT");
    // AI credits spent in the window come from ledger rows with reason "ai".
    assert.equal(body.usage.aiCreditsSpent, 3);
    const ai = body.usage.purposes.find((p: any) => p.purpose === "ai");
    assert.equal(ai.settled, 1);
    assert.equal(ai.settledCredits, 3);
    assert.ok(!JSON.stringify(body).includes("sk-test-not-a-real-credential"));
    assert.ok(fx.state.calls.some((c) => c.includes("/models")));
  } finally {
    server.close();
    resetModelCache();
  }
});

test("admin AI overview stays honest when the provider list is unreachable", async () => {
  resetModelCache();
  const { server, url } = await serve({ providerDown: true });
  try {
    const { status, body } = await get(url + "/admin/ai");
    assert.equal(status, 200);
    assert.equal(body.catalog, null);
    assert.match(body.catalogError, /tidak dapat dijangkau/);
    // Tier mapping still reports what the server would send.
    assert.equal(body.tiers.length, 3);
    assert.equal(body.configured, true);
  } finally {
    server.close();
    resetModelCache();
  }
});

test("admin AI overview reports an unconfigured provider instead of inventing models", async () => {
  resetModelCache();
  const { server, url } = await serve({ env: { LLM_API_KEY: "" } });
  try {
    const { body } = await get(url + "/admin/ai");
    assert.equal(body.configured, false);
    assert.equal(body.keyPresent, false);
    assert.equal(body.catalog, null);
    assert.equal(body.catalogError, "");
  } finally {
    server.close();
    resetModelCache();
  }
});

test("account detail shows balance, ledger, reservations and controls for one id only", async () => {
  const { server, url } = await serve();
  try {
    const { status, body } = await get(url + "/admin/users/" + ids.member);
    assert.equal(status, 200);
    assert.equal(body.balance, 128);
    assert.equal(body.account.email, "member@example.test");
    assert.equal(body.adminRole, "superadmin");
    assert.equal(body.ledger.length, 3);
    assert.equal(body.reservations.length, 2);
    assert.equal(body.window.added, 31);
    assert.equal(body.window.spent, 3);
    // Unknown accounts and malformed ids are refused, not treated as empty.
    assert.equal((await get(url + "/admin/users/" + ids.root)).status, 404);
    assert.equal((await get(url + "/admin/users/tidak-uuid")).status, 400);
  } finally {
    server.close();
  }
});

test("runtime overview counts only live leases and reports a missing migration", async () => {
  const { server, url } = await serve();
  try {
    const { status, body } = await get(url + "/admin/runtime");
    assert.equal(status, 200);
    assert.equal(body.available, true);
    assert.equal(body.slots.total, 2);
    assert.equal(body.slots.active, 1);
    assert.equal(body.items.length, 1);
    assert.equal(body.buckets.total, 2);
    assert.equal(body.buckets.active, 1);
    assert.equal(body.buckets.hits, 3);
    assert.equal(body.mode, "memory");
    assert.equal(body.sandboxRouting, "process-local");
  } finally {
    server.close();
  }
});

test("diagnostics reports the search provider and cache without ever leaking the key", async () => {
  const secret = "tvly-not-a-real-credential-000000";
  const { server, url } = await serve({
    env: {
      SEARCH_PROVIDER: "tavily",
      SEARCH_API_KEY: secret,
      SEARCH_COUNTRY: "indonesia",
      SEARCH_LANGUAGE: "id",
    },
  });
  try {
    const { status, body } = await get(url + "/admin/diagnostics");
    assert.equal(status, 200);
    assert.equal(body.search.provider, "tavily");
    assert.equal(body.search.selected, "tavily");
    assert.equal(body.search.selectedAvailable, true);
    assert.equal(body.search.keyConfigured, true);
    assert.equal(body.search.disabled, false);
    assert.equal(body.search.web, true);
    assert.equal(body.search.code, true);
    assert.equal(body.search.docs, true);
    assert.equal(body.search.rounds, 2);
    assert.deepEqual(body.search.locale, {
      country: "indonesia",
      language: "id",
    });
    assert.ok(["process", "shared"].includes(body.search.cache.mode));
    assert.equal(typeof body.search.cache.entries, "number");
    assert.equal(typeof body.search.cache.stats.hits, "number");
    assert.match(body.search.notice, /verify:search/);
    // The key is a boolean fact, never a value.
    assert.ok(!JSON.stringify(body).includes(secret));
    assert.ok(!JSON.stringify(body).includes("tvly-"));
  } finally {
    server.close();
  }
});

test("the diagnostics search block says when search is switched off", async () => {
  const { server, url } = await serve({
    env: { SEARCH_PROVIDER: "tavily", SEARCH_ENABLED: "false" },
  });
  try {
    const { body } = await get(url + "/admin/diagnostics");
    assert.equal(body.search.disabled, true);
    assert.equal(body.search.available, false);
    assert.equal(body.search.web, false);
    assert.equal(body.search.keyConfigured, false);
  } finally {
    server.close();
  }
});

test("runtime overview explains a missing migration 007 without failing the request", async () => {
  const { server, url } = await serve({ runtimeSchema: false });
  try {
    const { status, body } = await get(url + "/admin/runtime");
    assert.equal(status, 200);
    assert.equal(body.available, false);
    assert.equal(body.reason, "schema_missing");
    assert.match(body.notice, /007/);
  } finally {
    server.close();
  }
});

test("admin insights require a verified admin token", async () => {
  const { server, url } = await serve();
  try {
    for (const path of [
      "/admin/ai",
      "/admin/runtime",
      "/admin/users/" + ids.member,
    ]) {
      const anonymous = await fetch(url + path);
      assert.equal(anonymous.status, 401, path);
      const unauthorized = await get(url + path, "not-an-admin");
      assert.equal(unauthorized.status, 401, path);
    }
  } finally {
    server.close();
  }
});

test("maskBaseUrl never echoes credentials, query strings or fragments", () => {
  assert.deepEqual(
    maskBaseUrl("https://user:secret@api.example.test/v1?key=abc#x"),
    {
      host: "api.example.test",
      path: "/v1",
    },
  );
  assert.deepEqual(maskBaseUrl(""), { host: "", path: "" });
  assert.deepEqual(maskBaseUrl("bukan url"), { host: "tidak valid", path: "" });
});

test("tierMapping explains where each tier model comes from", () => {
  const catalog = { defaultModel: "deepseek-chat" } as any;
  const mapped = tierMapping(
    { LLM_MODEL_CEPAT: "glm-4-flash" } as any,
    catalog,
  );
  assert.deepEqual(
    mapped.map((t) => [t.tier, t.model, t.source]),
    [
      ["Cepat", "glm-4-flash", "LLM_MODEL_CEPAT"],
      ["Seimbang", "", "model pertama provider"],
      ["Kuat", "", "model pertama provider"],
    ],
  );
  const withDefault = tierMapping({ LLM_MODEL: "deepseek-chat" } as any, null);
  assert.equal(withDefault[0].source, "LLM_MODEL");
  assert.equal(tierMapping({} as any, null)[0].source, "belum ditentukan");
});

test("account detail refuses to fabricate a balance for an unknown auth user", async () => {
  const ctx = {
    env: {},
    admin: {
      auth: { admin: { getUserById: async () => ({ data: null }) } },
    },
  };
  await assert.rejects(
    () => accountDetail(ctx as any, ids.member),
    /Akun tidak ditemukan/,
  );
  await assert.rejects(
    () => accountDetail({ env: {}, admin: null } as any, ids.member),
    /Database cloud belum dikonfigurasi/,
  );
});
