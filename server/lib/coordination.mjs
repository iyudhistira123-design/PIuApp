import { createHash, randomUUID } from "node:crypto";
import { HttpError } from "./core.mjs";

export function createCoordination(ctx) {
  const mode =
    ctx.env.RATE_LIMIT_MODE ||
    (ctx.env.NODE_ENV === "production" ? "database" : "memory");
  if (!["database", "memory"].includes(mode))
    throw new Error("RATE_LIMIT_MODE tidak valid.");
  if (ctx.env.NODE_ENV === "production" && mode !== "database")
    throw new Error("Produksi memerlukan RATE_LIMIT_MODE=database.");
  const owner = randomUUID(); // Never reuse an identity across process restarts.
  async function rpc(name, args) {
    try {
      if (!ctx.admin) throw new Error("Unconfigured");
      const result = await ctx.admin
        .rpc(name, args)
        .abortSignal(AbortSignal.timeout(8000));
      if (
        result.error ||
        !result.data ||
        typeof result.data.allowed !== "boolean"
      )
        throw new Error("Unverified");
      return result.data;
    } catch {
      throw new HttpError(
        503,
        "Kontrol runtime bersama belum tersedia. Periksa database dan migration 007; operasi tidak dijalankan.",
        "RUNTIME_UNAVAILABLE",
      );
    }
  }
  return {
    mode,
    async take(req, max, windowMs) {
      const scope = `${req.method}:${req.baseUrl || ""}:${req.route?.path || req.path}:${max}:${windowMs}`;
      const key = createHash("sha256")
        .update(`${scope}:${req.user?.id || req.ip}`)
        .digest("hex");
      return rpc("piwu_take_rate", {
        p_key: key,
        p_max: max,
        p_window_ms: windowMs,
      });
    },
    async acquireSlot(user, project) {
      if (mode !== "database") return;
      const result = await rpc("piwu_sandbox_slot", {
        p_user: user,
        p_project: project,
        p_owner: owner,
        p_release: false,
      });
      if (!result.allowed)
        throw new HttpError(
          result.code === "SANDBOX_QUOTA" ? 429 : 409,
          result.code === "SANDBOX_QUOTA"
            ? "Kuota sandbox bersama penuh: maksimal dua per akun dan 50 di seluruh server."
            : "Sesi sandbox dimiliki server lain. Gunakan routing sesi tetap atau tunggu sesi berakhir; tidak dibuat sesi duplikat.",
          result.code,
        );
    },
    async releaseSlot(user, project) {
      if (mode === "database")
        await rpc("piwu_sandbox_slot", {
          p_user: user,
          p_project: project,
          p_owner: owner,
          p_release: true,
        });
    },
  };
}
