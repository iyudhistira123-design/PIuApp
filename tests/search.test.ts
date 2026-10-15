import test from "node:test";
import assert from "node:assert/strict";
import {
  SEARCH_QUERIES_MAX,
  assertCleanSources,
  fetchSourceBodies,
  providers,
  resetSearchCache,
  resolveProvider,
  runSearch,
  searchCapability,
  searchOne,
} from "../server/lib/search.mjs";
import {
  SOURCES_TOTAL_MAX,
  buildResearchReport,
  citationReport,
  readBodies,
  researchInstruction,
  researchStatus,
  runSearchRound,
  searchReservationId,
  searchRoundsMax,
  sourcesPrompt,
  splitSearchOps,
} from "../server/lib/research.mjs";
import { capabilities } from "../server/lib/core.mjs";

const capabilityFixture = {
  tavily: {
    results: [
      {
        title: "Dokumentasi resmi",
        url: "https://docs.example.test/a",
        content: "Isi halaman",
      },
      {
        title: "Referensi kedua",
        url: "https://example.test/b",
        content: "Cuplikan",
      },
    ],
  },
  exa: {
    results: [
      { title: "Exa hit", url: "https://exa.example.test/x", text: "Teks" },
    ],
  },
  brave: {
    web: {
      results: [
        {
          title: "Brave hit",
          url: "https://brave.example.test/y",
          description: "Deskripsi",
        },
      ],
    },
  },
  parallel: {
    results: [
      {
        title: "Parallel hit",
        url: "https://parallel.example.test/z",
        excerpts: ["Kutipan satu", "Kutipan dua"],
      },
    ],
  },
};

function fixture(
  env: Record<string, string> = {},
  { fail }: { fail?: string } = {},
) {
  const calls: string[] = [];
  const ctx = {
    env: {
      SEARCH_PROVIDER: "tavily",
      SEARCH_API_KEY: "search-test-key",
      ...env,
    },
    fetcher: async (input: any) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      calls.push(url.host + url.pathname + (url.search || ""));
      if (fail && url.pathname.includes(fail))
        return new Response("nope", { status: 500 });
      for (const [name, payload] of Object.entries(capabilityFixture))
        if (url.host.startsWith(name.split(".")[0]) || url.host.includes(name))
          return Response.json(payload);
      if (url.host === "api.tavily.com")
        return Response.json(capabilityFixture.tavily);
      if (url.host === "api.exa.ai")
        return Response.json(capabilityFixture.exa);
      if (url.host === "api.search.brave.com")
        return Response.json(capabilityFixture.brave);
      if (url.host === "api.parallel.ai")
        return Response.json(capabilityFixture.parallel);
      if (url.host === "grep.app")
        return Response.json({
          hits: {
            hits: [
              {
                repo: { raw: "acme/app" },
                path: { raw: "src/db.ts" },
                content: { snippet: "<mark>retry</mark>" },
              },
            ],
          },
        });
      if (url.host === "context7.com") {
        if (url.pathname === "/api/v1/search")
          return Response.json([{ id: "/vercel/next.js", title: "Next.js" }]);
        return new Response("# Dokumentasi Next.js", {
          headers: { "Content-Type": "text/plain" },
        });
      }
      throw new Error("Unexpected search fixture: " + url.href);
    },
  };
  return { ctx: ctx as any, calls };
}

test("web search normalizes every provider to one source shape", async () => {
  for (const provider of ["tavily", "exa", "brave", "parallel"]) {
    resetSearchCache();
    const { ctx } = fixture({ SEARCH_PROVIDER: provider });
    const result = await searchOne(ctx, {
      query: "cara pakai vite",
      kind: "web",
    });
    assert.equal(result.provider, provider, provider);
    assert.ok(result.sources.length >= 1, provider);
    for (const source of result.sources) {
      assert.match(source.url, /^https:\/\//, provider);
      assert.equal(source.kind, "web");
      assert.equal(source.provider, provider);
      assert.ok(source.title.length > 0 && source.title.length <= 160);
      assert.ok(source.snippet.length > 0, provider + " snippet");
      assert.ok(source.snippet.length <= 320);
    }
  }
});

test("a provider that returns a private or plain-http URL is dropped, not fetched", async () => {
  const { ctx } = fixture();
  ctx.fetcher = async () =>
    Response.json({
      results: [
        { title: "internal", url: "http://10.0.0.5/admin", content: "rahasia" },
        {
          title: "metadata service",
          url: "http://169.254.169.254/latest/meta-data",
          content: "kredensial",
        },
        { title: "aman", url: "https://contoh.test/dokumen", content: "ok" },
      ],
    });
  const result = await searchOne(ctx, { query: "apa saja", kind: "web" });
  assert.deepEqual(
    result.sources.map((s: any) => s.url),
    ["https://contoh.test/dokumen"],
  );
});

test("provider text is stripped of control characters before it reaches a prompt", async () => {
  const { ctx } = fixture();
  ctx.fetcher = async () =>
    Response.json({
      results: [
        {
          title: "Judul\u0000dengan\u001b[31mkontrol",
          url: "https://contoh.test/x",
          content: "Cuplikan\u0007dengan\u0000nul\n\n baris   baru",
        },
      ],
    });
  const result = await searchOne(ctx, { query: "kontrol", kind: "web" });
  assert.equal(result.sources[0].title, "Judul dengan [31mkontrol");
  assert.equal(result.sources[0].snippet, "Cuplikan dengan nul baris baru");
});

test("results are cached with a time window, so one page is not billed twice", async () => {
  resetSearchCache();
  const { ctx, calls } = fixture();
  const first = await searchOne(ctx, {
    query: "NextJs 16 router",
    kind: "web",
  });
  const second = await searchOne(ctx, {
    query: "nextjs 16 router",
    kind: "web",
  });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.deepEqual(first.sources, second.sources);
  assert.equal(calls.length, 1);
});

test("web search fails closed when nothing is configured, and never silently falls back", async () => {
  resetSearchCache();
  // The key exists but no provider is named, so no vendor may be guessed.
  const { ctx } = fixture({ SEARCH_PROVIDER: "none" });
  await assert.rejects(
    () => searchOne(ctx, { query: "apa pun", kind: "web" }),
    /Pencarian web belum dikonfigurasi/,
  );
  const capability = searchCapability(ctx.env);
  assert.equal(capability.web, false);
  assert.equal(capability.selected, "none");
  // Keyless code and docs search still work, so research is available; only the
  // explicit kill switch reports the feature as off.
  const adminEnv = {
    ...ctx.env,
    VITE_SUPABASE_URL: "u",
    VITE_SUPABASE_ANON_KEY: "a",
    SUPABASE_SERVICE_ROLE_KEY: "s",
  };
  assert.equal(capabilities(adminEnv).search, true);
  assert.equal(
    capabilities({ ...adminEnv, SEARCH_ENABLED: "false" }).search,
    false,
  );
  const off = searchCapability({ SEARCH_ENABLED: "off" });
  assert.equal(off.web, false);
  assert.equal(off.code, false);
  assert.equal(off.docs, false);
  assert.equal(off.disabled, true);
  await assert.rejects(
    async () => resolveProvider({ SEARCH_ENABLED: "false" }, "web"),
    { message: /dinonaktifkan/ },
  );
  // A configured kind is never used for a different kind. `resolveProvider`
  // throws synchronously, so it needs an async wrapper to surface as rejection.
  await assert.rejects(async () => resolveProvider(ctx.env, "web", "grepp"), {
    message: /tidak melayani pencarian web/,
  });
  await assert.rejects(
    async () => resolveProvider(ctx.env, "lagu", undefined),
    {
      message: /tidak dikenal/,
    },
  );
});

test("a page body that looks like a credential is redacted, not copied into the prompt", async () => {
  resetSearchCache();
  const { ctx } = fixture();
  const bodies = await fetchSourceBodies(
    {
      ...ctx,
      fetcher: async () =>
        new Response(
          "<html><title>Bocor</title><body>kunci AKIAIOSFODNN7EXAMPLE dan teks lain</body></html>",
          { headers: { "Content-Type": "text/html" } },
        ),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    },
    [
      { index: 1, title: "Halaman", url: "https://bocor.example.test/a" },
    ] as any[],
    { limit: 1 },
  );
  const text = bodies[0].text as string;
  assert.doesNotMatch(text, /AKIAIOSFODNN7EXAMPLE/);
  assert.match(text, /kredensial diredaksi/);
  assert.match(text, /teks lain/);
});

test("keyless code and docs search work without any API key", async () => {
  resetSearchCache();
  const { ctx } = fixture({ SEARCH_PROVIDER: "none", SEARCH_API_KEY: "" });
  const capability = searchCapability(ctx.env);
  assert.equal(capability.web, false);
  assert.equal(capability.code, true);
  assert.equal(capability.docs, true);

  const code = await searchOne(ctx, { query: "fetchWithRetry", kind: "code" });
  assert.equal(code.provider, "grepp");
  assert.equal(
    code.sources[0].url,
    "https://github.com/acme/app/blob/HEAD/src/db.ts",
  );
  assert.match(code.sources[0].title, /acme\/app/);

  const docs = await searchOne(ctx, { query: "next.js routing", kind: "docs" });
  assert.equal(docs.provider, "context7");
  assert.equal(docs.sources[0].url, "https://context7.com/vercel/next.js");
  assert.match(docs.sources[0].snippet, /Dokumentasi Next\.js/);
});

test("runSearch batches queries, dedupes by URL, caps the count and reports per-query failures", async () => {
  resetSearchCache();
  const { ctx } = fixture();
  const result = await runSearch(ctx, {
    queries: ["satu", "dua", "tiga", "empat", "lima"],
  });
  assert.equal(result.rounds.length, SEARCH_QUERIES_MAX);
  assert.equal(
    new Set(result.sources.map((s: any) => s.url)).size,
    result.sources.length,
  );
  assert.deepEqual(
    result.sources.map((s: any) => s.index),
    result.sources.map((_: unknown, i: number) => i + 1),
  );

  const failing = await runSearch(
    { ...ctx, fetcher: async () => new Response("boom", { status: 500 }) },
    { queries: ["gagal"] },
  );
  assert.equal(failing.sources.length, 0);
  assert.equal(failing.rounds[0].count, 0);
  assert.match(failing.rounds[0].error, /menolak permintaan/);
});

test("search rejects empty queries, unknown providers and secret-shaped provider text", async () => {
  const { ctx } = fixture();
  await assert.rejects(
    () => runSearch(ctx, { queries: ["  "] }),
    /kata kunci/i,
  );
  await assert.rejects(
    () => searchOne(ctx, { query: "x", kind: "web", provider: "tidak-ada" }),
    /tidak dikenal/,
  );
  assert.throws(
    () =>
      assertCleanSources([
        {
          title: "bocor",
          snippet: "key=sk-live-abcdefghijklmnopqrstuvwxyz",
          url: "https://x.test",
          provider: "tavily",
          kind: "web",
        },
      ]),
    /pola kredensial/,
  );
  assert.equal(
    searchReservationId("2b1f0a54-0000-4000-8000-000000000000"),
    searchReservationId("2b1f0a54-0000-4000-8000-000000000000"),
  );
  assert.match(
    searchReservationId("2b1f0a54-0000-4000-8000-000000000000"),
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.notEqual(
    searchReservationId("2b1f0a54-0000-4000-8000-000000000000"),
    searchReservationId("2b1f0a54-0000-4000-8000-000000000001"),
  );
  // Each round gets its own deterministic id, so a retried round is not billed
  // twice while a second round is still billed once.
  assert.notEqual(
    searchReservationId("2b1f0a54-0000-4000-8000-000000000000", 1),
    searchReservationId("2b1f0a54-0000-4000-8000-000000000000", 2),
  );
  assert.equal(
    searchReservationId("2b1f0a54-0000-4000-8000-000000000000", 2),
    searchReservationId("2b1f0a54-0000-4000-8000-000000000000", 2),
  );
  // The rounds cap is bounded and never unbounded.
  assert.equal(searchRoundsMax({}), 2);
  assert.equal(searchRoundsMax({ SEARCH_ROUNDS_MAX: "1" }), 1);
  assert.equal(searchRoundsMax({ SEARCH_ROUNDS_MAX: "5" }), 3);
  assert.equal(searchRoundsMax({ SEARCH_ROUNDS_MAX: "abc" }), 2);
});

test("search ops are validated strictly and separated from scene ops", () => {
  const { searches, rest } = splitSearchOps([
    { kind: "search", queries: ["roblox mesh limit"], type: "web" },
    { kind: "scene.transform", ops: [{ target: "a", move: [1, 0, 0] }] },
  ]);
  assert.equal(searches.length, 1);
  assert.equal(searches[0].type, "web");
  assert.equal(rest!.length, 1);
  // Nothing to split when the reply carries no ops at all.
  assert.deepEqual(splitSearchOps(undefined), {
    searches: [],
    rest: undefined,
  });
  for (const bad of [
    [{ kind: "search", queries: [] }],
    [{ kind: "search", queries: ["x"] }],
    [{ kind: "search", queries: ["ok"], type: "video" }],
    [{ kind: "search", queries: ["ok"], extra: true }],
    [{ kind: "search", queries: ["1", "2", "3", "4"] }],
  ])
    assert.throws(
      () => splitSearchOps(bad),
      /tidak valid/,
      JSON.stringify(bad),
    );
});

test("the research instruction is honest about what is available", () => {
  const none = researchInstruction({ web: false, code: false, docs: false });
  assert.match(none, /do not request a search/i);
  const web = researchInstruction({ web: true, code: false, docs: true });
  assert.match(web, /Available search kinds: web, docs/);
  assert.match(web, /You get 1 search round in total/);
  assert.match(web, /untrusted reference data/);
  // After the first of two rounds the model is told what it already has; once
  // the cap is reached it is told to stop asking.
  const second = researchInstruction(
    { web: true, code: false, docs: false },
    { round: 1, max: 2 },
  );
  assert.match(second, /Round 1 of 2 has finished/);
  assert.doesNotMatch(second, /No further search is possible/);
  const done = researchInstruction(
    { web: true, code: false, docs: false },
    { round: 2, max: 2 },
  );
  assert.match(done, /No further search is possible/);
  assert.match(done, /say plainly if they are not enough/);
  assert.equal(researchStatus({ SEARCH_PROVIDER: "none" }).web, false);
  assert.equal(
    researchStatus({ SEARCH_PROVIDER: "tavily", SEARCH_API_KEY: "x" }).provider,
    "tavily",
  );
  assert.equal(
    researchStatus({ SEARCH_PROVIDER: "tavily", SEARCH_API_KEY: "x" })
      .available,
    true,
  );
  // A keyless kind keeps research usable without any key at all.
  assert.equal(researchStatus({ SEARCH_PROVIDER: "none" }).available, true);
});

test("the sources block numbers every source and marks unreadable pages", () => {
  const prompt = sourcesPrompt({
    sources: [
      {
        index: 1,
        title: "A",
        url: "https://a.test",
        provider: "tavily",
        kind: "web",
        snippet: "cuplikan A",
      },
      {
        index: 2,
        title: "B",
        url: "https://b.test",
        provider: "tavily",
        kind: "web",
        snippet: "cuplikan B",
      },
    ],
    bodies: [
      { index: 1, url: "https://a.test", title: "A", text: "isi halaman" },
      {
        index: 2,
        url: "https://b.test",
        title: "B",
        text: "",
        unreadable: true,
      },
    ],
  });
  assert.match(prompt, /\[1\] A — https:\/\/a\.test/);
  assert.match(prompt, /isi halaman/);
  assert.match(prompt, /halaman tidak dapat dibaca/);
});

test("a round only returns new sources, and the report counts what was really read", async () => {
  resetSearchCache();
  const { ctx } = fixture();
  const seen = new Set(["https://docs.example.test/a"]);
  const round = await runSearchRound(ctx, {
    searches: [{ queries: ["dokumen"], type: "web" }],
    seen,
  });
  // `seen` started with the first fixture hit, so only the second one is new,
  // and it arrives unnumbered: the caller owns the numbering.
  assert.equal(round.sources.length, 1);
  assert.equal(round.sources[0].url, "https://example.test/b");
  assert.equal(round.sources[0].index, undefined);
  assert.equal(seen.size, 2);
  assert.equal(round.rounds.length, 1);

  const numbered = [{ ...round.sources[0], index: 4 }];
  const bodies = await readBodies(ctx, { sources: numbered as any, read: 5 });
  // The read budget is exhausted, so nothing is fetched again.
  assert.deepEqual(bodies, []);

  const report = buildResearchReport({
    rounds: [{ ...round.rounds[0], count: 1 }] as any,
    sources: numbered as any,
    bodies: [{ index: 4, text: "isi", url: numbered[0].url }] as any,
    notes: ["Catatan operator ikut dilaporkan."],
  });
  assert.equal(report.sources.length, 1);
  assert.deepEqual(Object.keys(report.sources[0]).sort(), [
    "index",
    "kind",
    "provider",
    "title",
    "url",
  ]);
  assert.equal(report.read, 1);
  assert.match(report.notice, /1 sumber dari 1 pencarian; 1 halaman dibaca/);
  assert.match(report.notice, /data tidak tepercaya/);
  assert.match(report.notice, /Catatan operator ikut dilaporkan\./);
  assert.equal(SOURCES_TOTAL_MAX, 12);
});

test("citations are mapped to real sources; invented numbers are flagged, not resolved", () => {
  const sources = [{ index: 1 }, { index: 2 }] as any[];
  const good = citationReport(
    "Menurut dokumentasi [1], batasnya 250 objek [2].",
    sources,
  );
  assert.deepEqual(good.cited, [1, 2]);
  assert.deepEqual(good.uncited, []);
  assert.deepEqual(good.invalid, []);
  assert.equal(good.citationNotice, "");

  const bad = citationReport(
    "Menurut sumber [9] dan [0] jawabannya jelas.",
    sources,
  );
  assert.deepEqual(bad.cited, []);
  assert.deepEqual(bad.uncited, [1, 2]);
  assert.deepEqual(bad.invalid, [9, 0]);
  assert.match(bad.citationNotice, /tidak mengutip/);

  const partial = citationReport("Hanya [2] yang relevan.", sources);
  assert.deepEqual(partial.cited, [2]);
  assert.deepEqual(partial.uncited, [1]);
});

test("every provider that needs a key declares it, so nothing is charged by surprise", () => {
  for (const [name, provider] of Object.entries(providers)) {
    assert.ok(provider.label, name);
    assert.ok(["web", "code", "docs"].includes(provider.kind), name);
    if (provider.kind === "web")
      assert.equal(provider.env, "SEARCH_API_KEY", name);
    else assert.equal(provider.env, "", name);
  }
});
