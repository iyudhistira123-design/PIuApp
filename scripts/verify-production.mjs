// Bounded unauthenticated HTTP smoke checks. Does NOT certify production or pentest completion.
const base = new URL(process.env.PIWU_VERIFY_URL || "http://127.0.0.1:3201");
if (
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password ||
  base.search ||
  base.hash
)
  throw new Error("Gunakan URL HTTP(S) tanpa kredensial/query.");
const checks = [];
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, status: "passed" });
  } catch {
    checks.push({ name, status: "failed" });
  }
}
const request = (path, init = {}) =>
  fetch(new URL(path, base), {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
const require = (condition) => {
  if (!condition) throw new Error("Unverified");
};
let html = "";
await check("mode produksi benar-benar aktif", async () => {
  const r = await request("/api/status");
  require(r.status === 200);
  const data = await r.json();
  require(data.production === true && data.mode === "real");
});
await check("HTML produksi dan entry JavaScript tersedia", async () => {
  const r = await request("/");
  html = await r.text();
  require(r.status === 200 && html.includes('<div id="root"'));
  const src = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  require(src);
  const asset = await request(src);
  require(
    asset.ok && /javascript/.test(asset.headers.get("content-type") || ""),
  );
  await asset.body?.cancel();
});
await check("health, no-store, dan nosniff", async () => {
  const r = await request("/api/health");
  require(
    r.ok &&
      (await r.json()).ok === true &&
      r.headers.get("cache-control") === "no-store" &&
      r.headers.get("x-content-type-options") === "nosniff",
  );
});
for (const path of [
  "/api/admin/session",
  "/api/admin/users",
  "/api/admin/diagnostics",
  "/api/announcements",
]) {
  await check("tanpa sesi tidak mendapatkan data: " + path, async () => {
    const r = await request(path);
    require([401, 403, 503].includes(r.status));
    const d = await r.json();
    require(typeof d.error === "string" && !("items" in d) && !("stack" in d));
  });
}
await check("JSON rusak ditolak tanpa stack trace", async () => {
  const r = await request("/api/admin/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"action":',
  });
  const d = await r.json();
  require(r.status === 400 && !("stack" in d));
});
await check(
  "endpoint API tidak dikenal tetap JSON 404, bukan fallback HTML",
  async () => {
    const r = await request("/api/__verification_unknown");
    require(r.status === 404 && typeof (await r.json()).error === "string");
  },
);
for (const path of ["/.env", "/.git/config"]) {
  await check("file sensitif tidak disajikan: " + path, async () => {
    const r = await request(path);
    const text = await r.text();
    require(
      r.status === 404 ||
        (r.status === 200 &&
          /text\/html/.test(r.headers.get("content-type") || "") &&
          text === html),
    );
  });
}
console.log(
  JSON.stringify(
    {
      scope: "Smoke HTTP build produksi lokal/staging tanpa sesi",
      checks,
      httpChecksPassed: checks.every((c) => c.status === "passed"),
      liveVerified: false,
      notice:
        "401/403 atau 503 berarti tidak ada data privat diberikan; 503 bukan bukti autentikasi/provider berfungsi. Bukan pentest menyeluruh atau uji perangkat asli.",
    },
    null,
    2,
  ),
);
if (checks.some((c) => c.status !== "passed")) process.exitCode = 1;
