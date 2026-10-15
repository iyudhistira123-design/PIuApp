import { HttpError, secretPattern, searchDisabled } from "./core.mjs";
import { fetchReference } from "./references.mjs";

// Retrieval foundation for "Riset & Pencarian". One normalized result shape for
// several providers, so a new vendor is a new entry in `providers` and an env
// value — never a rewrite of the agent loop.
//
// Two rules hold for every provider:
//  1. Fail closed. Without a configured provider the caller gets an honest 503,
//     never an empty list that looks like "no results on the internet".
//  2. Provider output is untrusted data. Titles and snippets are stripped of
//     control characters, capped, and every URL is re-validated before the app
//     fetches it (the existing SSRF guard in references.mjs).
//
// Types: `web` needs a key; `code` and `docs` are keyless so they work in a
// local setup. Keys never leave the server: providers are called from here.

export const SEARCH_KINDS = ["web", "code", "docs"];
export const SEARCH_QUERIES_MAX = 3;
export const SEARCH_RESULTS_MAX = 8;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 120;
const SNIPPET_MAX = 320;

const clean = (value, max = SNIPPET_MAX) =>
  String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

// Provider text may carry markup (grep.app highlights hits with <mark>, snippets
// arrive HTML-escaped). Neither the prompt nor the chat should show tags, so
// provider text is flattened to plain text here — user queries are not, because
// `#include <stdio.h>` is a legitimate search.
const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};
const plain = (value, max) =>
  clean(
    String(value ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " "),
    max,
  );

const host = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Every provider returns the same list shape, whatever its own schema is. */
const normalize = (provider, kind, rows) =>
  rows
    .map((row) => ({
      provider,
      kind,
      title: plain(row.title, 160) || host(row.url || ""),
      url: clean(row.url, 300),
      snippet: plain(row.snippet),
    }))
    .filter((row) => /^https:\/\//.test(row.url))
    .slice(0, SEARCH_RESULTS_MAX);

// A vendor call is retried only when retrying can help: network failures, timeouts
// and the statuses vendors use to say "try again later". A 401/404 is final — we
// never want to burn three attempts (and the user's wait) on a wrong key.
const RETRY_DEFAULTS = {
  attempts: 3,
  baseMs: 400,
  maxWaitMs: 5000,
  budgetMs: 30000,
};
const retryConfig = (ctx) => ({
  ...RETRY_DEFAULTS,
  ...(ctx?.searchRetry || {}),
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryableStatus = (status) =>
  status === 408 || status === 425 || status === 429 || status >= 500;
const retryAfterMs = (response, maxWaitMs) => {
  const header = response?.headers?.get?.("retry-after");
  if (!header) return 0;
  const seconds = Number(header);
  const value = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - Date.now();
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, maxWaitMs);
};

/**
 * Runs one vendor request with bounded retries. Non-retryable statuses are final
 * immediately; the last error message always says how many tries were made.
 */
const withRetry = async (ctx, label, send) => {
  const { attempts, baseMs, maxWaitMs, budgetMs } = retryConfig(ctx);
  const deadline = Date.now() + budgetMs;
  let status = 0;
  let network = "";
  let tries = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let waitMs = 0;
    tries = attempt;
    try {
      const response = await send();
      if (response.ok) return response;
      if (!retryableStatus(response.status))
        throw new HttpError(
          502,
          `${label} menolak permintaan (${response.status}).`,
        );
      status = response.status;
      network = "";
      waitMs = retryAfterMs(response, maxWaitMs);
      await response.body?.cancel?.().catch(() => {});
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // Network error, DNS failure or our own timeout: worth one more try.
      network = error?.name === "TimeoutError" ? "timeout" : "gagal dihubungi";
      status = 0;
    }
    if (attempt === attempts) break;
    if (Date.now() >= deadline) {
      // The budget, not the attempt limit, stopped us — say so honestly.
      break;
    }
    const backoff = Math.min(maxWaitMs, baseMs * 2 ** (attempt - 1));
    await sleep(
      Math.min(waitMs || backoff, Math.max(0, deadline - Date.now())),
    );
  }
  const reason = status ? `menolak permintaan (${status})` : network;
  const stopped = tries < attempts ? " (batas waktu percobaan tercapai)" : "";
  throw new HttpError(
    502,
    `${label} ${reason} setelah ${tries} percobaan${stopped}.`,
  );
};

const postJson = async (ctx, url, body, headers = {}, timeout = 15000) => {
  const response = await withRetry(ctx, "Provider pencarian", () =>
    ctx.fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    }),
  );
  // A retried call is otherwise invisible; the status code is a response header
  // fact, so expose the attempt count for tests and diagnostics only.
  return response.json();
};

const getJson = async (ctx, url, headers = {}, timeout = 15000) => {
  const response = await withRetry(ctx, "Sumber pencarian", () =>
    ctx.fetcher(url, {
      headers,
      signal: AbortSignal.timeout(timeout),
    }),
  );
  // Docs endpoints answer with text/plain, so read text and parse when it is JSON.
  const body = await response.text();
  if (/^\s*[[{]/.test(body))
    try {
      return JSON.parse(body);
    } catch {
      throw new HttpError(502, "Balasan sumber pencarian bukan JSON yang sah.");
    }
  return body;
};

/**
 * Registry. `web` providers bill per call and therefore need a key; `code` and
 * `docs` are keyless so they are always available.
 */
export const providers = {
  // Tavily — contract checked against the official SDKs (tavily-js `src/utils.ts`
  // sends `Authorization: Bearer <key>` and no key in the body; `src/search.ts`
  // sends snake_case fields and reads `results[].content`).
  tavily: {
    kind: "web",
    label: "Tavily",
    env: "SEARCH_API_KEY",
    async run(ctx, query) {
      // Optional Indonesian (or any) bias, only when the operator asks for it:
      // a default bias would quietly ruin English documentation queries.
      const locale = {};
      const country = clean(ctx.env.SEARCH_COUNTRY, 40);
      const language = clean(ctx.env.SEARCH_LANGUAGE, 12);
      if (country) locale.country = country;
      if (language) locale.language = language;
      const data = await postJson(
        ctx,
        "https://api.tavily.com/search",
        {
          ...locale,
          query,
          max_results: SEARCH_RESULTS_MAX,
          search_depth: "basic",
          include_answer: false,
        },
        { Authorization: "Bearer " + ctx.env.SEARCH_API_KEY },
      );
      return normalize(
        "tavily",
        "web",
        (data.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content || r.snippet,
        })),
      );
    },
  },
  // Exa — contract checked against exa-js/exa-py: `x-api-key`, camelCase body
  // (`numResults`, `type`), and an explicit `contents` block; without it the API
  // returns no page text, so snippets would come back empty. Exa highlights are
  // relevance-sized excerpts and the vendors recommend them for AI context.
  exa: {
    kind: "web",
    label: "Exa",
    env: "SEARCH_API_KEY",
    async run(ctx, query) {
      const data = await postJson(
        ctx,
        "https://api.exa.ai/search",
        {
          query,
          numResults: SEARCH_RESULTS_MAX,
          type: "auto",
          contents: { highlights: true },
        },
        { "x-api-key": ctx.env.SEARCH_API_KEY },
      );
      return normalize(
        "exa",
        "web",
        (data.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          // `highlights` is a LIST of strings, unlike Tavily's single `content`.
          snippet:
            r.text ||
            (Array.isArray(r.highlights) ? r.highlights.join(" ") : "") ||
            r.summary ||
            "",
        })),
      );
    },
  },
  // Brave — contract checked against brave-search-mcp-server (`src/BraveAPI/`):
  // GET `https://api.search.brave.com/res/v1/web/search`, header
  // `X-Subscription-Token`, and results read from `web.results[]`. Brave caps
  // the query at 50 words, so a long model query is trimmed instead of 422-ing.
  brave: {
    kind: "web",
    label: "Brave Search",
    env: "SEARCH_API_KEY",
    async run(ctx, query) {
      const words = query.split(/\s+/).filter(Boolean).slice(0, 50).join(" ");
      const data = await getJson(
        ctx,
        "https://api.search.brave.com/res/v1/web/search?count=" +
          SEARCH_RESULTS_MAX +
          "&q=" +
          encodeURIComponent(words),
        {
          Accept: "application/json",
          "X-Subscription-Token": ctx.env.SEARCH_API_KEY,
        },
      );
      return normalize(
        "brave",
        "web",
        (data.web?.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet:
            r.description ||
            (Array.isArray(r.extra_snippets) ? r.extra_snippets.join(" ") : ""),
        })),
      );
    },
  },
  // Parallel — contract checked against the vendor OpenAPI document
  // (`parallel-llms-txt` → `/v1/search`): `x-api-key`, POST body with a REQUIRED
  // `search_queries` array, and results carrying `excerpts[]` (no `snippet`).
  parallel: {
    kind: "web",
    label: "Parallel",
    env: "SEARCH_API_KEY",
    async run(ctx, query) {
      const data = await postJson(
        ctx,
        "https://api.parallel.ai/v1/search",
        {
          objective: query,
          search_queries: [query],
          mode: "basic",
          max_chars_total: 6000,
        },
        { "x-api-key": ctx.env.SEARCH_API_KEY },
      );
      return normalize(
        "parallel",
        "web",
        (data.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: Array.isArray(r.excerpts) ? r.excerpts.join(" ") : "",
        })),
      );
    },
  },
  // Keyless: real code in public repositories. Results are file/line hits.
  grepp: {
    kind: "code",
    label: "grep.app",
    env: "",
    async run(ctx, query) {
      const data = await getJson(
        ctx,
        "https://grep.app/api/search?q=" + encodeURIComponent(query),
      );
      const hits = data.hits?.hits || [];
      return normalize(
        "grepp",
        "code",
        hits.map((hit) => ({
          title: `${hit.repo?.raw || data.facets?.repo?.buckets?.[0]?.val || "repo"} · ${hit.path?.raw || ""}`,
          url:
            hit.repo?.raw && hit.path?.raw
              ? `https://github.com/${hit.repo.raw}/blob/HEAD/${hit.path.raw}`
              : "",
          snippet: hit.content?.snippet || "",
        })),
      );
    },
  },
  // Keyless: version-specific library documentation.
  context7: {
    kind: "docs",
    label: "Context7",
    env: "",
    async run(ctx, query) {
      const headers = ctx.env.CONTEXT7_API_KEY
        ? { Authorization: "Bearer " + ctx.env.CONTEXT7_API_KEY }
        : {};
      const found = await getJson(
        ctx,
        "https://context7.com/api/v1/search?query=" + encodeURIComponent(query),
        headers,
      );
      const libraries = (
        Array.isArray(found) ? found : found.results || []
      ).slice(0, 3);
      const rows = [];
      for (const library of libraries) {
        const id = library.id || library.libraryId;
        if (!id) continue;
        const docs = await getJson(
          ctx,
          "https://context7.com/api/v1/" +
            id.replace(/^\//, "") +
            "?query=" +
            encodeURIComponent(query) +
            "&type=txt",
          headers,
        ).catch(() => null);
        rows.push({
          title: `${library.title || id} — dokumentasi`,
          url: "https://context7.com" + (id.startsWith("/") ? id : "/" + id),
          snippet: typeof docs === "string" ? docs : library.description || "",
        });
      }
      return normalize("context7", "docs", rows);
    },
  },
};

/** Which provider serves a kind, and whether its key is present. */
export function searchCapability(env) {
  if (searchDisabled(env))
    return {
      web: false,
      code: false,
      docs: false,
      selected: "none",
      selectedAvailable: false,
      disabled: true,
    };
  const configured = (name) => {
    const provider = providers[name];
    return Boolean(provider) && (!provider.env || Boolean(env[provider.env]));
  };
  const selected = String(env.SEARCH_PROVIDER || "none").toLowerCase();
  const keyless = (kind) =>
    Object.keys(providers).some(
      (name) => providers[name].kind === kind && !providers[name].env,
    );
  return {
    // A key alone never tells us the vendor, so web search needs a NAMED
    // provider. Code and docs providers are keyless, so they stay available.
    web:
      selected !== "none" &&
      providers[selected]?.kind === "web" &&
      configured(selected),
    code: keyless("code"),
    docs: keyless("docs"),
    selected,
    selectedAvailable: selected !== "none" && configured(selected),
    disabled: false,
  };
}

/**
 * Picks the provider for a kind. An explicit `provider` argument must be
 * configured and of that kind — asking for code search cannot silently run a
 * web search instead.
 */
export function resolveProvider(env, kind, requested) {
  if (searchDisabled(env))
    throw new HttpError(
      503,
      "Pencarian dinonaktifkan di server ini (SEARCH_ENABLED=false).",
    );
  if (!SEARCH_KINDS.includes(kind))
    throw new HttpError(400, `Jenis pencarian "${kind}" tidak dikenal.`);
  if (requested && requested !== "auto") {
    const provider = providers[requested];
    if (!provider)
      throw new HttpError(
        400,
        `Provider pencarian "${requested}" tidak dikenal.`,
      );
    if (provider.kind !== kind)
      throw new HttpError(
        400,
        `${provider.label} tidak melayani pencarian ${kind}.`,
      );
    if (!provider.env || env[provider.env]) return requested;
    throw new HttpError(
      503,
      `Provider pencarian ${provider.label} belum dikonfigurasi.`,
    );
  }
  const selected = String(env.SEARCH_PROVIDER || "none").toLowerCase();
  const chosen =
    selected !== "none" &&
    providers[selected]?.kind === kind &&
    (!providers[selected].env || env[providers[selected].env])
      ? selected
      : Object.keys(providers).find(
          (n) => providers[n].kind === kind && !providers[n].env,
        );
  if (chosen) return chosen;
  throw new HttpError(
    503,
    kind === "web"
      ? "Pencarian web belum dikonfigurasi. Isi SEARCH_PROVIDER dan SEARCH_API_KEY di server."
      : `Pencarian ${kind} belum tersedia.`,
  );
}

const cache = new Map();
export function resetSearchCache() {
  cache.clear();
}

/** One query against one provider, cached, with no secrets in the cache key. */
export async function searchOne(ctx, { query, kind = "web", provider } = {}) {
  const text = clean(query, 300);
  if (!text) throw new HttpError(400, "Kata kunci pencarian kosong.");
  const name = resolveProvider(ctx.env, kind, provider);
  const key = `${name}:${kind}:${text.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return { ...hit.value, cached: true };
  const sources = await providers[name].run(ctx, text);
  const value = {
    provider: name,
    label: providers[name].label,
    kind,
    query: text,
    sources,
  };
  cache.delete(key);
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return { ...value, cached: false };
}

/**
 * Tracking parameters and a trailing slash do not change the page, so they must
 * not make the same result look like a new source across queries or rounds.
 */
export function canonicalSourceKey(url) {
  try {
    const u = new URL(url);
    const drop = [...u.searchParams.keys()].filter((key) =>
      /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref_src$)/i.test(key),
    );
    for (const key of drop) u.searchParams.delete(key);
    const query = [...u.searchParams.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const host = u.host.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
    return host + path + (query ? "?" + query : "");
  } catch {
    return String(url || "");
  }
}

const STOPWORDS =
  /^(the|and|for|with|from|that|this|you|your|are|was|were|how|what|when|why|does|into|out|not|but|all|any|can|use|using|dan|yang|untuk|dengan|dari|pada|ini|itu|adalah|atau|juga|ke|di|apa|bagaimana|cara|sebuah|the|of|in|on|to)$/i;
const terms = (text) =>
  new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9.+_-]+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.test(word)),
  );

/**
 * Cheap lexical relevance: how many query terms the title (weight 2) and the
 * snippet (weight 1) share. No extra vendor call, and it only reorders results
 * that already came back — it never invents or drops a source.
 */
export function relevanceScore(source, query) {
  const wanted = terms(query);
  if (!wanted.size) return 0;
  const title = terms(source.title);
  const snippet = terms(source.snippet);
  let score = 0;
  for (const term of wanted) {
    if (title.has(term)) score += 2;
    else if (snippet.has(term)) score += 1;
  }
  return score;
}

/** Titles that are near-identical on the same host are the same page. */
export function sameTitle(a, b) {
  const left = terms(a);
  const right = terms(b);
  if (!left.size || !right.size) return false;
  let shared = 0;
  for (const term of left) if (right.has(term)) shared++;
  return shared / Math.min(left.size, right.size) >= 0.85;
}

/**
 * Runs a batch of queries (from an AI `search` op) with a hard cap, reranks each
 * query's results by lexical relevance, drops duplicates (same canonical URL, or
 * near-identical title on the same host) and never lets provider text carry
 * control characters into the prompt. Every kept source reports the query that
 * produced it, so the panel can explain where a source came from.
 */
export async function runSearch(ctx, { queries, kind = "web", provider } = {}) {
  const list = (Array.isArray(queries) ? queries : [queries])
    .map((q) => clean(q, 300))
    .filter(Boolean)
    .slice(0, SEARCH_QUERIES_MAX);
  if (!list.length) throw new HttpError(400, "Tidak ada kata kunci pencarian.");
  const rounds = [];
  const seen = new Set();
  const seenTitles = [];
  const sources = [];
  for (const query of list) {
    let result;
    try {
      result = await searchOne(ctx, { query, kind, provider });
    } catch (e) {
      // One failing query must not fail the whole turn, but it must be visible.
      rounds.push({
        query,
        kind,
        provider: "",
        label: "",
        cached: false,
        count: 0,
        error: e instanceof HttpError ? e.message : "Pencarian gagal.",
      });
      continue;
    }
    const ranked = result.sources
      .map((source) => ({ source, score: relevanceScore(source, query) }))
      .sort((a, b) => b.score - a.score);
    let added = 0;
    let duplicates = 0;
    for (const { source } of ranked) {
      const key = canonicalSourceKey(source.url);
      const duplicateTitle = seenTitles.some(
        (known) =>
          known.host === host(source.url) &&
          sameTitle(known.title, source.title),
      );
      if (seen.has(key) || duplicateTitle) {
        duplicates++;
        continue;
      }
      seen.add(key);
      seenTitles.push({ host: host(source.url), title: source.title });
      sources.push({ ...source, query, index: sources.length + 1 });
      added++;
    }
    rounds.push({
      query,
      kind: result.kind,
      provider: result.provider,
      label: result.label,
      cached: result.cached,
      count: added,
      duplicates,
      error: "",
    });
  }
  return {
    rounds,
    sources: sources.slice(0, SEARCH_RESULTS_MAX),
    provider: rounds.find((r) => r.provider)?.provider || "",
  };
}

/** Provider text goes into the prompt, so keep secrets out of it first. */
export function assertCleanSources(sources) {
  for (const source of sources) {
    if (secretPattern.test(source.title + " " + source.snippet))
      throw new HttpError(
        422,
        "Hasil pencarian diblokir karena memuat pola kredensial.",
      );
  }
  return sources;
}

/** A real page may legitimately contain something key-shaped; redact instead of
 * failing the turn, because the page is data we chose to read, not provider
 * text that claimed to be a result. */
const redact = (text) =>
  text.replace(new RegExp(secretPattern.source, "g"), "[kredensial diredaksi]");

/**
 * Reads the first N sources so the model can cite real page content instead of
 * a snippet. Bodies are capped and treated as untrusted data.
 */
export async function fetchSourceBodies(
  ctx,
  sources,
  { limit = 3, characters = 4000 } = {},
) {
  const out = [];
  // The fetcher is injectable (tests, and the production default is fetch); the
  // resolver is optional so the SSRF guard falls back to real DNS lookups.
  const options = { fetcher: ctx.fetcher };
  if (ctx.resolver) options.resolve = ctx.resolver;
  for (const source of sources.slice(0, limit)) {
    try {
      const page = await fetchReference(source.url, options);
      out.push({
        index: source.index,
        url: page.url,
        title: page.title || source.title,
        text: redact(clean(page.text, characters)),
      });
    } catch {
      // A page that cannot be read stays a snippet-only citation.
      out.push({
        index: source.index,
        url: source.url,
        title: source.title,
        text: "",
        unreadable: true,
      });
    }
  }
  return out;
}
