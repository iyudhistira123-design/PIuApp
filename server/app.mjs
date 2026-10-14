import { createCoordination } from "./lib/coordination.mjs";
import { registerStudio } from "./routes/studio.mjs";
import { createReadinessReader } from "./lib/readiness.mjs";
import express from "express";
import { registerAdmin } from "./routes/admin.mjs";
import { platformGate } from "./lib/platform.mjs";
import { registerData } from "./routes/data.mjs";
import { ZodError } from "zod";
import { createContext, rateLimit } from "./lib/context.mjs";
import { HttpError, capabilities, wrap } from "./lib/core.mjs";
import { registerWhatsApp } from "./routes/whatsapp.mjs";
import { registerAI } from "./routes/ai.mjs";
import { registerCollaboration } from "./routes/collaboration.mjs";
import { registerAssets } from "./routes/assets.mjs";
import { registerBilling } from "./routes/billing.mjs";
import { registerSandbox } from "./routes/sandbox.mjs";
import { registerPublish, startPublishWorker } from "./routes/publish.mjs";
import { registerAnalytics } from "./routes/analytics.mjs";
import { registerMarketplace } from "./routes/marketplace.mjs";
import { registerRecordings } from "./routes/recordings.mjs";
import { SandboxProvider } from "./providers/sandbox.mjs";
import { NetlifyHosting } from "./providers/hosting.mjs";
import { fetchReference } from "./lib/references.mjs";
export function createApp({
  env = process.env,
  fetcher = fetch,
  context,
  sandbox,
  hosting,
  worker = false,
} = {}) {
  const app = express(),
    ctx = context || createContext(env, fetcher);
  const coordination = createCoordination(ctx);
  app.locals.coordination = coordination;
  sandbox ||= new SandboxProvider(env, coordination);
  hosting ||= new NetlifyHosting(env, fetcher);
  app.disable("x-powered-by");
  if (env.TRUST_PROXY_CIDRS)
    app.set(
      "trust proxy",
      env.TRUST_PROXY_CIDRS.split(",").map((s) => s.trim()),
    );
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    });
    next();
  });
  registerWhatsApp(app, ctx);
  app.use(express.json({ limit: "12mb" }));
  app.get("/api/status", (_, res) => {
    const c = capabilities(env);
    res.json({
      ai: c.ai ? "configured" : "not_configured",
      storage: c.cloud ? "supabase-configured" : "not_configured",
      mode: "real",
      production: env.NODE_ENV === "production",
      verification: "configuration-only",
      capabilities: c,
      paymentMode: env.PAYMENT_LIVE === "true" ? "live" : "sandbox",
    });
  });
  const readReadiness = createReadinessReader(ctx);
  app.get(
    "/api/public/readiness",
    rateLimit({ max: 30 }),
    wrap(async (_, res) => res.json(await readReadiness())),
  );
  app.get("/api/health", (_, res) => res.json({ ok: true }));
  app.post("/api/ai", (_, res) =>
    res.status(409).json({
      error:
        "Endpoint AI sekarang membutuhkan project cloud. Gunakan /api/projects/:id/ai.",
    }),
  );
  app.post(
    "/api/verify",
    ctx.auth,
    rateLimit({ max: 3 }),
    wrap(async (req, res) => {
      const database = await ctx
        .needAdmin()
        .from("credit_accounts")
        .select("user_id")
        .limit(1);
      const result = {
        auth: "verified",
        database: database.error ? "failed" : "verified",
        ai: "not_configured",
        notice:
          "Pemeriksaan koneksi tidak menjalankan inference AI atau transaksi pembayaran.",
      };
      if (capabilities(env).ai) {
        try {
          const r = await fetcher(
            env.LLM_BASE_URL.replace(/\/$/, "") + "/models",
            {
              headers: { Authorization: "Bearer " + env.LLM_API_KEY },
              signal: AbortSignal.timeout(10000),
            },
          );
          if (r.ok) {
            const d = await r.json();
            result.ai =
              Array.isArray(d.data) &&
              d.data.some((m) => m.id === env.LLM_MODEL)
                ? "model_available"
                : "endpoint_reachable";
          } else result.ai = "inconclusive";
        } catch {
          result.ai = "unreachable";
        }
      }
      res.json(result);
    }),
  );
  app.use("/api", platformGate(ctx));
  registerAdmin(app, ctx);
  registerData(app, ctx);
  registerStudio(app, ctx);
  registerAI(app, ctx);
  registerCollaboration(app, ctx);
  registerAssets(app, ctx);
  registerBilling(app, ctx);
  registerSandbox(app, ctx, sandbox);
  registerPublish(app, ctx, hosting);
  registerAnalytics(app, ctx);
  registerMarketplace(app, ctx);
  registerRecordings(app, ctx);
  app.post(
    "/api/projects/:id/reference",
    ctx.auth,
    ctx.project("Editor"),
    rateLimit({ max: 10 }),
    wrap(async (req, res) => {
      if (typeof req.body.url !== "string" || req.body.url.length > 2000)
        throw new HttpError(400, "URL tidak valid.");
      res.json({ reference: await fetchReference(req.body.url) });
    }),
  );
  app.use("/api", (_, res) =>
    res.status(404).json({ error: "Endpoint tidak ditemukan." }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return res.end();
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof ZodError
          ? 400
          : error.type === "entity.too.large"
            ? 413
            : error.type === "entity.parse.failed"
              ? 400
              : 500;
    res.status(status).json({
      error:
        error instanceof HttpError
          ? error.message
          : error instanceof ZodError
            ? "Format permintaan tidak valid. Periksa isian formulir."
            : status === 413
              ? "Payload terlalu besar."
              : "Layanan tidak dapat menyelesaikan permintaan. Coba lagi atau periksa konfigurasi server.",
      code: error instanceof HttpError ? error.code : "SERVICE_ERROR",
    });
  });
  const stopWorker = worker
    ? startPublishWorker(ctx, sandbox, hosting)
    : () => {};
  const recovery =
    worker && ctx.admin
      ? setInterval(() => {
          void Promise.resolve(ctx.admin.rpc("piwu_recover_credits")).catch(
            () => {},
          );
        }, 60000)
      : null;
  recovery?.unref();
  const stop = () => {
    stopWorker();
    if (recovery) clearInterval(recovery);
  };
  return { app, stop };
}
