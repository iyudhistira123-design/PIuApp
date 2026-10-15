import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createApp } from "../server/app.mjs";
import { resetSearchCache } from "../server/lib/search.mjs";
import { SCENE_PATH } from "../server/lib/ai-ops.mjs";
import { defaultSite } from "../server/lib/platform.mjs";

// End-to-end proof that the research loop is honest end to end: the model asks
// for sources, the server really searches and reads pages, the tools' credit is
// billed once and refunded when nothing came back, and the browser receives the
// numbered sources plus a report that never resolves a citation that was not
// returned. The fake provider speaks the real OpenAI-compatible SSE contract.

const ids = { member: "7f1c3d2e-1111-4222-8333-444455556666" };
const PUBLIC_IP = "93.184.216.34";

const savedScene = () =>
  JSON.stringify({
    version: 1,
    objects: [
      {
        id: "obj-rumah",
        name: "Rumah",
        kind: "model",
        parent: null,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        size: [1, 1, 1],
        color: "#ffffff",
        anchored: true,
      },
    ],
  });

type Fixture = {
  provider?: Record<string, unknown>;
  results?: unknown[];
  /** Lets a second search round return different pages than the first. */
  resultsByQuery?: Record<string, unknown[]>;
  /** One provider reply per pass, so a multi-round turn can be scripted. */
  replies?: any[];
  reply?: any;
  researchReply?: any;
  pages?: Record<string, string>;
  searchStatus?: number;
  /** Shared fake of the `runtime_search_cache` table (migration 009). */
  cacheRows?: Map<string, any>;
};

function fixture({
  results = [
    {
      title: "Dokumentasi resmi",
      url: "https://dokumen.example.test/panduan",
      content: "Cuplikan pertama",
      score: 0.96,
      raw_content: null,
    },
    {
      title: "Artikel kedua",
      url: "https://kedua.example.test/tulis",
      content: "Cuplikan kedua",
      score: 0.82,
    },
  ],
  reply,
  researchReply,
  replies,
  resultsByQuery,
  pages = {
    "dokumen.example.test":
      "<html><title>Panduan</title><body>Gunakan pengulangan berjenjang untuk menangani galat. Isi panduan.</body></html>",
    "kedua.example.test":
      "<html><title>Artikel</title><body>Catat kegagalan agar mudah diperiksa. Isi artikel.</body></html>",
    "ketiga.example.test":
      "<html><title>Ronde dua</title><body>Isi halaman ronde dua.</body></html>",
    "keempat.example.test":
      "<html><title>Ronde dua lagi</title><body>Isi halaman keempat.</body></html>",
  },
  searchStatus = 200,
  cacheRows = new Map(),
}: Fixture = {}) {
  const chat: any[] = [];
  const rpcs: any[] = [];
  // Every outbound vendor call, so a test can assert the real HTTP contract
  // instead of trusting the provider wrapper.
  const vendor: any[] = [];
  const fetcher = async (input: any, init: any = {}) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const path = url.pathname;
    const json = (data: any, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (path.endsWith("/chat/completions")) {
      const body = JSON.parse(init.body);
      chat.push(body);
      // The fixture speaks one scripted reply per pass: a search request, then
      // another, then the answer, depending on what the test needs.
      const chain = replies?.length ? replies : [reply, researchReply];
      const content = JSON.stringify(
        chain[Math.min(chat.length - 1, chain.length - 1)],
      );
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }
    if (url.host === "api.tavily.com") {
      vendor.push({
        url: url.href,
        method: init.method || "GET",
        headers: Object.fromEntries(
          Object.entries(init.headers || {}).map(([key, value]) => [
            key.toLowerCase(),
            String(value),
          ]),
        ),
        body: JSON.parse(init.body || "{}"),
      });
      if (searchStatus !== 200)
        return new Response("nope", { status: searchStatus });
      const query = String(JSON.parse(init.body || "{}").query || "");
      const match = Object.keys(resultsByQuery || {}).find((key) =>
        query.includes(key),
      );
      return json({ results: match ? resultsByQuery![match] : results });
    }
    if (path === "/auth/v1/user")
      return json({
        id: ids.member,
        email: "member@example.test",
        email_confirmed_at: "2026-01-01",
        user_metadata: {},
      });
    if (path === "/rest/v1/projects")
      return json([
        {
          id: url.searchParams.get("id")?.replace("eq.", ""),
          owner_id: ids.member,
          name: "Project uji",
          kind: "webapp",
        },
      ]);
    if (path === "/rest/v1/project_workspaces")
      return json({
        payload: {
          id: crypto.randomUUID(),
          kind: "webapp",
          name: "Project uji",
          files: {},
        },
        revision: 1,
      });
    if (path === "/rest/v1/runtime_search_cache") {
      if ((init.method || "GET") === "POST") {
        for (const row of [].concat(JSON.parse(init.body || "[]")))
          cacheRows.set(row.key, row);
        return json([], 201);
      }
      const key = (url.searchParams.get("key") || "").replace("eq.", "");
      return json(cacheRows.has(key) ? [cacheRows.get(key)] : []);
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      const rpc = path.replace("/rest/v1/rpc/", "");
      rpcs.push({ rpc, body: JSON.parse(init.body) });
      return json({ remaining: 27, balance: 27 });
    }
    if (pages[url.hostname])
      return new Response(pages[url.hostname], {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    if (
      [
        "collaborators",
        "platform_project_controls",
        "platform_user_controls",
        "platform_admins",
      ].some((name) => path === `/rest/v1/${name}`)
    )
      return json([]);
    if (path === "/rest/v1/site_configuration")
      return json([{ revision: 1, value: defaultSite }]);
    throw new Error("Unexpected fixture query: " + path + url.search);
  };
  return { fetcher, chat, rpcs, vendor, cacheRows };
}

async function run(
  options: Fixture & {
    env?: Record<string, string>;
    research?: boolean;
    mode?: string;
    kind?: string;
  } = {},
) {
  const fx = fixture(options);
  const { app } = createApp({
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test",
      SUPABASE_SERVICE_ROLE_KEY: "server-test",
      LLM_BASE_URL: "https://provider.test/v1",
      LLM_API_KEY: "sk-test-placeholder-not-a-credential",
      LLM_MODEL: "deepseek-chat",
      ...(options.env || {}),
    },
    fetcher: fx.fetcher,
    // Offline DNS: every fixture host is treated as the public address below,
    // so the SSRF guard runs for real instead of being skipped.
    resolver: async () => [{ address: PUBLIC_IP, family: 4 }],
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((ready) => server.once("listening", ready));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  const response = await fetch(
    url + "/api/projects/" + crypto.randomUUID() + "/ai",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer member",
      },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        prompt: "Cara menangani retry di Next.js App Router?",
        mode: options.mode || "Ask",
        model: "Otomatis",
        research: options.research !== false,
        files: { [SCENE_PATH]: savedScene() },
      }),
    },
  );
  const text = await response.text();
  server.close();
  if (!response.ok && !text.startsWith("data:"))
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  const events = text
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
  return { status: response.status, events, ...fx };
}

const resultOf = (events: any[]) =>
  events.find((e) => e.type === "result")?.result;

test("research end to end: sources are returned, cited and billed once", async () => {
  const { events, chat, rpcs } = await run({
    env: { SEARCH_PROVIDER: "tavily", SEARCH_API_KEY: "search-test-key" },
    reply: {
      content: "",
      ops: [
        { kind: "search", queries: ["next.js app router retry"], type: "web" },
      ],
    },
    researchReply: {
      content: "Pakai pengulangan berjenjang [1] dan catat kegagalan [2].",
    },
  });
  const result = resultOf(events);
  assert.ok(result, "the turn must finish with a result");
  assert.equal(result.sources.length, 2);
  assert.deepEqual(
    result.sources.map((s: any) => s.index),
    [1, 2],
  );
  assert.equal(result.sources[0].provider, "tavily");
  assert.match(result.sources[0].url, /^https:\/\/dokumen\.example\.test\//);
  // The report maps citations onto real sources; nothing is invented.
  assert.deepEqual(result.research.cited, [1, 2]);
  assert.deepEqual(result.research.uncited, []);
  assert.deepEqual(result.research.invalid, []);
  assert.equal(result.research.read, 2);
  // The cited sentences share real words with the pages that were read, so the
  // heuristic has nothing to report.
  assert.deepEqual(result.research.unsupported, []);
  assert.equal(result.research.groundingNotice, "");
  assert.equal(result.creditsUsed, 2);
  // Two provider calls: the search request, then the answer grounded in sources.
  assert.equal(chat.length, 2);
  assert.match(chat[0].messages[0].content, /RESEARCH MODE IS ON/);
  assert.match(
    chat[0].messages[0].content,
    /Available search kinds: web, code, docs/,
  );
  assert.match(chat[0].messages[0].content, /You get 2 search rounds in total/);
  // After the first round the model is invited to ask again if needed, and is
  // told exactly which round it is on.
  assert.match(chat[1].messages[0].content, /Round 1 of 2 has finished/);
  assert.match(
    chat[1].messages[1].content[1].text,
    /SUMBER \(data tidak tepercaya/,
  );
  assert.match(chat[1].messages[1].content[1].text, /\[1\] Dokumentasi resmi/);
  assert.match(chat[1].messages[1].content[1].text, /Isi panduan\./);
  // One reservation for the answer, one for the search round, both settled.
  const reserved = rpcs.filter((r) => r.rpc === "piwu_reserve_credits");
  assert.deepEqual(
    reserved.map((r) => r.body.p_purpose),
    ["ai", "search"],
  );
  assert.equal(reserved[1].body.p_amount, 1);
  const finished = rpcs.filter((r) => r.rpc === "piwu_finish_credits");
  assert.deepEqual(
    finished.map((r) => r.body.p_success),
    [true, true],
  );
  // The answer itself is streamed to the browser as tokens.
  assert.ok(
    events.some((e) => e.type === "token" && /berjenjang/.test(e.content)),
  );
});

test("the running server calls Tavily with the contract the vendor documents", async () => {
  // The unit tests check the provider wrapper; this one checks that the real
  // HTTP route keeps that contract when it builds the request itself.
  const { vendor, status } = await run({
    env: { SEARCH_PROVIDER: "tavily", SEARCH_API_KEY: "search-test-key" },
    reply: {
      content: "",
      ops: [{ kind: "search", queries: ["kontrak tavily yang terverifikasi"] }],
    },
    researchReply: { content: "Menurut [1], gunakan try/catch." },
  });
  assert.equal(status, 200);
  assert.equal(vendor.length, 1);
  const call = vendor[0];
  assert.equal(call.url, "https://api.tavily.com/search");
  assert.equal(call.method, "POST");
  assert.equal(call.headers.authorization, "Bearer search-test-key");
  assert.equal(call.headers["content-type"], "application/json");
  assert.deepEqual(call.body, {
    query: "kontrak tavily yang terverifikasi",
    max_results: 8,
    search_depth: "basic",
    include_answer: false,
  });
  // The key travels in the header only, never in the body or the query string.
  assert.doesNotMatch(call.url, /search-test-key/);
  assert.doesNotMatch(JSON.stringify(call.body), /search-test-key/);
});

test("a citation whose source says something else is flagged, never silently accepted", async () => {
  const { events } = await run({
    env: { SEARCH_PROVIDER: "tavily", SEARCH_API_KEY: "search-test-key" },
    reply: {
      content: "",
      ops: [{ kind: "search", queries: ["produk pertanian"], type: "web" }],
    },
    // Neither sentence shares a significant word with the pages that were read.
    researchReply: {
      content: "Harga emas naik tajam [1] dan panen kopi menurun [2].",
    },
  });
  const result = resultOf(events);
  assert.deepEqual(result.research.cited, [1, 2]);
  assert.deepEqual(result.research.unsupported, [1, 2]);
  assert.match(result.research.groundingNotice, /Pemeriksaan heuristik/);
  assert.match(result.research.groundingNotice, /1, 2/);
});

test("two server instances share one cached search instead of paying twice", async () => {
  // One fake table, two independent apps (two `createApp` calls), same query.
  const cacheRows = new Map<string, any>();
  const first = await run({
    env: { SEARCH_PROVIDER: "tavily", SEARCH_API_KEY: "search-test-key" },
    cacheRows,
    reply: {
      content: "",
      ops: [
        {
          kind: "search",
          queries: ["cache bersama lintas instance"],
          type: "web",
        },
      ],
    },
    researchReply: { content: "Catatan [1]." },
  });
  assert.equal(first.vendor.length, 1);
  assert.equal(resultOf(first.events).research.rounds[0].cached, false);
  assert.equal(resultOf(first.events).research.rounds[0].cache, "shared");
  assert.equal(cacheRows.size, 1);

  // A different instance has its own memory: only the table carries over.
  resetSearchCache();
  const second = await run({
    env: { SEARCH_PROVIDER: "tavily", SEARCH_API_KEY: "search-test-key" },
    cacheRows,
    reply: {
      content: "",
      ops: [
        {
          kind: "search",
          queries: ["cache bersama lintas instance"],
          type: "web",
        },
      ],
    },
    researchReply: { content: "Catatan [1]." },
  });
  // The second instance answers from the shared row: no vendor call at all.
  assert.equal(second.vendor.length, 0);
  assert.equal(resultOf(second.events).research.rounds[0].cached, true);
  assert.equal(resultOf(second.events).sources.length, 2);
});

test("two rounds are numbered 1..4, billed one credit each and closed honestly", async () => {
  const { events, chat, rpcs } = await run({
    env: { SEARCH_PROVIDER: "tavily", SEARCH_API_KEY: "search-test-key" },
    resultsByQuery: {
      "ronde dua": [
        {
          title: "Halaman ronde dua",
          url: "https://ketiga.example.test/dua",
          content: "Cuplikan ketiga",
        },
        {
          title: "Halaman ronde dua lagi",
          url: "https://keempat.example.test/dua",
          content: "Cuplikan keempat",
        },
      ],
    },
    replies: [
      {
        content: "",
        ops: [{ kind: "search", queries: ["ronde satu"], type: "web" }],
      },
      // The second pass is still a search request, so a second round runs.
      {
        content: "",
        ops: [{ kind: "search", queries: ["ronde dua"], type: "web" }],
      },
      { content: "Jawaban memakai [1] dan [3]." },
    ],
  });
  const result = resultOf(events);
  assert.ok(result, "the turn must finish with a result");
  // Sources keep one numbering across rounds, so [3] really is the third one.
  assert.deepEqual(
    result.sources.map((s: any) => s.index),
    [1, 2, 3, 4],
  );
  assert.match(result.sources[2].url, /^https:\/\/ketiga\.example\.test\//);
  assert.equal(new Set(result.sources.map((s: any) => s.url)).size, 4);
  assert.equal(result.research.rounds.length, 2);
  assert.deepEqual(result.research.cited, [1, 3]);
  assert.deepEqual(result.research.uncited, [2, 4]);
  assert.equal(result.research.read, 4);
  // One credit for the answer plus one per round that returned sources.
  assert.equal(result.creditsUsed, 3);
  assert.equal(chat.length, 3);
  const finalSystem = chat[2].messages[0].content;
  assert.match(finalSystem, /Round 2 of 2 has finished/);
  assert.match(finalSystem, /No further search is possible/);
  assert.match(chat[2].messages[1].content[1].text, /\[3\] Halaman ronde dua/);
  const reserved = rpcs.filter((r) => r.rpc === "piwu_reserve_credits");
  assert.deepEqual(
    reserved.map((r) => r.body.p_purpose),
    ["ai", "search", "search"],
  );
  assert.notEqual(reserved[1].body.p_id, reserved[2].body.p_id);
  assert.deepEqual(
    rpcs
      .filter((r) => r.rpc === "piwu_finish_credits")
      .map((r) => r.body.p_success),
    [true, true, true],
  );
});

test("a request after the last allowed round is answered with the sources, not a fake reply", async () => {
  const { events, chat, rpcs } = await run({
    env: {
      SEARCH_PROVIDER: "tavily",
      SEARCH_API_KEY: "search-test-key",
      SEARCH_ROUNDS_MAX: "1",
    },
    replies: [
      {
        content: "Saya cari dulu.",
        ops: [{ kind: "search", queries: ["ronde satu"], type: "web" }],
      },
      // The model keeps asking although the cap is reached.
      {
        content: "",
        ops: [{ kind: "search", queries: ["ronde dua"], type: "web" }],
      },
    ],
  });
  const result = resultOf(events);
  assert.equal(
    events.find((e) => e.type === "error"),
    undefined,
  );
  // The sources are still delivered, with a plain explanation instead of the
  // model's request being shown as an answer.
  assert.equal(result.sources.length, 2);
  assert.match(result.content, /Saya cari dulu\./);
  assert.match(
    result.content,
    /belum menyusun jawaban akhir dalam batas ronde/,
  );
  assert.match(result.research.notice, /Ronde riset habis \(1\)/);
  assert.match(result.research.notice, /masih meminta pencarian setelah batas/);
  assert.equal(result.creditsUsed, 2);
  assert.equal(chat.length, 2);
  assert.deepEqual(
    rpcs
      .filter((r) => r.rpc === "piwu_reserve_credits")
      .map((r) => r.body.p_purpose),
    ["ai", "search"],
  );
});

test("research fails closed when search is switched off server-side", async () => {
  const { events, chat, rpcs } = await run({
    env: { SEARCH_ENABLED: "false" },
    reply: {
      content: "",
      ops: [{ kind: "search", queries: ["cuaca hari ini"], type: "web" }],
    },
    researchReply: { content: "tidak boleh sampai sini" },
  });
  assert.equal(resultOf(events), undefined);
  const error = events.find((e) => e.type === "error");
  assert.match(error.message, /belum ada provider pencarian/);
  assert.equal(chat.length, 1);
  // Nothing was searched, so the only settlement is the refunded answer.
  const reserved = rpcs.filter((r) => r.rpc === "piwu_reserve_credits");
  assert.deepEqual(
    reserved.map((r) => r.body.p_purpose),
    ["ai"],
  );
  assert.deepEqual(
    rpcs
      .filter((r) => r.rpc === "piwu_finish_credits")
      .map((r) => r.body.p_success),
    [false],
  );
});

test("a web query without a web provider is reported, refunded and never faked", async () => {
  const { events, chat, rpcs } = await run({
    env: { SEARCH_PROVIDER: "none" },
    reply: {
      content: "",
      ops: [{ kind: "search", queries: ["cuaca hari ini"], type: "web" }],
    },
    researchReply: { content: "Saya tidak menemukan sumber untuk ini." },
  });
  const result = resultOf(events);
  // The turn still answers, but with zero sources and the reason spelled out.
  assert.match(result.content, /tidak menemukan sumber/);
  assert.equal(result.sources, undefined);
  assert.equal(result.research.sources.length, 0);
  assert.match(result.research.rounds[0].error, /belum dikonfigurasi/);
  assert.match(result.research.rounds[0].error, /SEARCH_PROVIDER/);
  assert.match(result.research.notice, /Tidak ada sumber/);
  assert.equal(result.creditsUsed, 1);
  // Two provider passes (the search request and the answer), one billing.
  assert.equal(chat.length, 2);
  const reserved = rpcs.filter((r) => r.rpc === "piwu_reserve_credits");
  assert.deepEqual(
    reserved.map((r) => r.body.p_purpose),
    ["ai", "search"],
  );
  assert.deepEqual(
    rpcs
      .filter((r) => r.rpc === "piwu_finish_credits")
      .map((r) => r.body.p_success),
    [false, true],
  );
});

test("a round that finds nothing is not billed and is reported honestly", async () => {
  const { events, rpcs } = await run({
    env: { SEARCH_PROVIDER: "tavily", SEARCH_API_KEY: "search-test-key" },
    results: [],
    reply: {
      content: "",
      ops: [{ kind: "search", queries: ["topik langka"], type: "web" }],
    },
    researchReply: { content: "Sepertinya ini dijelaskan di [1]." },
  });
  const result = resultOf(events);
  assert.equal(result.sources, undefined);
  assert.equal(result.creditsUsed, 1);
  assert.equal(result.research.sources.length, 0);
  assert.equal(result.research.rounds.length, 1);
  assert.equal(result.research.rounds[0].count, 0);
  assert.match(result.research.notice, /Tidak ada sumber/);
  // A citation the server never returned is flagged, not resolved.
  assert.deepEqual(result.research.invalid, [1]);
  assert.deepEqual(result.research.cited, []);
  assert.match(result.research.citationNotice, /tidak mengutip/);
  // Still only one credit-bearing call: the answer.
  const finished = rpcs.filter((r) => r.rpc === "piwu_finish_credits");
  assert.deepEqual(
    finished.map((r) => r.body.p_success),
    [false, true],
  );
});

test("a search request outside research mode is refused, never applied as a scene edit", async () => {
  const { events } = await run({
    research: false,
    mode: "Builder",
    reply: {
      content: "Saya cari dulu.",
      ops: [{ kind: "search", queries: ["cara membuat pintu"] }],
    },
  });
  assert.equal(resultOf(events), undefined);
  const error = events.find((e) => e.type === "error");
  assert.match(error.message, /mode riset tidak aktif/);
});

test("research mode without any request for sources answers normally, unbilled by tools", async () => {
  const { events, chat, rpcs } = await run({
    env: { SEARCH_PROVIDER: "tavily", SEARCH_API_KEY: "search-test-key" },
    reply: { content: "Ini jawaban langsung tanpa perlu mencari." },
  });
  const result = resultOf(events);
  assert.equal(chat.length, 1);
  assert.equal(result.creditsUsed, 1);
  assert.equal(result.sources, undefined);
  assert.equal(result.research, undefined);
  // No search work happened, so no search reservation may exist at all.
  assert.deepEqual(
    rpcs
      .filter((r) => r.rpc === "piwu_reserve_credits")
      .map((r) => r.body.p_purpose),
    ["ai"],
  );
});
