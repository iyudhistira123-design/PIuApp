// Live verification of the search providers against the real APIs.
//
// Why this exists: unit tests only prove that our parser matches the contract we
// wrote down. This script proves the contract itself — one real query per
// provider, straight to the vendor, through exactly the code the app uses.
//
//   npm run verify:search                      # every provider that has a key
//   npm run verify:search -- --provider=exa    # force one provider
//   npm run verify:search -- --read            # also read the first result page
//   npm run verify:search -- --json            # machine-readable report
//
// Honest bounds: each web call spends real vendor quota/credits, `skipped` means
// "not tested here" (never "works"), and keys are read from the environment and
// never printed. Exit code 1 means at least one real call failed.
import {
  providers,
  searchCapability,
  searchOne,
  fetchSourceBodies,
} from "../server/lib/search.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const hit = args.find(
    (a) => a === "--" + name || a.startsWith("--" + name + "="),
  );
  if (!hit) return fallback;
  const value = hit.split("=")[1];
  return value === undefined ? "true" : value;
};
const json = args.includes("--json");
const readFirst = args.includes("--read");
const strict = args.includes("--strict");
const only = flag("provider").toLowerCase();
const kind = flag("kind", "web").toLowerCase();
const query = flag("query", "cara pakai vite di React 19");

const env = process.env;
const capability = searchCapability(env);
const ctx = { env, fetcher: fetch };

const names = only
  ? [only]
  : Object.keys(providers).filter((name) => {
      const provider = providers[name];
      return provider.kind === kind && (!provider.env || env[provider.env]);
    });

const keyOf = (name) => providers[name]?.env || "";
const hasKey = (name) => {
  const key = keyOf(name);
  return !key || Boolean(env[key]);
};

const checks = [];
for (const name of names) {
  const provider = providers[name];
  if (!provider) {
    checks.push({ provider: name, status: "unknown_provider" });
    continue;
  }
  if (provider.kind !== kind) {
    checks.push({
      provider: name,
      kind: provider.kind,
      status: "skipped",
      reason: `${provider.label} melayani pencarian ${provider.kind}, bukan ${kind}.`,
    });
    continue;
  }
  if (!hasKey(name)) {
    checks.push({
      provider: name,
      kind,
      status: "skipped",
      reason: `${keyOf(name)} belum diisi.`,
    });
    continue;
  }
  const started = Date.now();
  try {
    const result = await searchOne(ctx, { query, kind, provider: name });
    const check = {
      provider: name,
      label: result.label,
      kind,
      status: "ok",
      ms: Date.now() - started,
      results: result.sources.length,
      first: result.sources[0]
        ? {
            title: result.sources[0].title,
            url: result.sources[0].url,
            snippetChars: result.sources[0].snippet.length,
          }
        : null,
    };
    if (!result.sources.length)
      check.warning =
        "API menjawab tanpa hasil. Cek kuota langganan dan kata kunci.";
    if (readFirst && result.sources.length) {
      const bodies = await fetchSourceBodies(ctx, result.sources, { limit: 1 });
      check.read = {
        url: bodies[0]?.url || "",
        title: bodies[0]?.title || "",
        chars: (bodies[0]?.text || "").length,
        error: bodies[0]?.error || "",
      };
    }
    checks.push(check);
  } catch (error) {
    checks.push({
      provider: name,
      kind,
      status: "failed",
      ms: Date.now() - started,
      // Never echo a response body here: it is untrusted and may quote secrets.
      error: String(error?.message || error).slice(0, 200),
    });
  }
}

const failed = checks.filter(
  (c) => c.status === "failed" || c.status === "unknown_provider",
);
const skipped = checks.filter((c) => c.status === "skipped");
const report = {
  capability,
  query,
  checks,
  notice:
    "Satu kueri nyata per provider (memakai kuota/langganan vendor). Status skipped berarti tidak diuji, bukan berarti berfungsi.",
};
if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `Provider web terpilih: ${capability.selected} (web=${capability.web}, code=${capability.code}, docs=${capability.docs})`,
  );
  for (const check of checks) {
    if (check.status === "ok")
      console.log(
        `OK       ${check.label || check.provider}: ${check.results} hasil dalam ${check.ms} ms${
          check.first
            ? ` — contoh: ${check.first.title} (${check.first.snippetChars} char cuplikan)`
            : ""
        }`,
      );
    else if (check.status === "failed")
      console.log(`GAGAL    ${check.provider}: ${check.error}`);
    else
      console.log(
        `DILEWATI ${check.provider}: ${check.reason || check.status}`,
      );
    if (check.warning) console.log(`         peringatan: ${check.warning}`);
    if (check.read)
      console.log(
        `         baca halaman: ${check.read.chars} char dari ${check.read.url || "-"}${
          check.read.error ? " (" + check.read.error + ")" : ""
        }`,
      );
  }
  console.log(report.notice);
}
if (!checks.length)
  console.log(
    "Tidak ada provider yang diuji. Isi SEARCH_PROVIDER + SEARCH_API_KEY di .env, atau pakai --provider=nama.",
  );
if (failed.length) process.exitCode = 1;
// Naming one provider means it must really be tested: a skip is then a gap.
else if (strict || (only && skipped.length)) process.exitCode = 1;
