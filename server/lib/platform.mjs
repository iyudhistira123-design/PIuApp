import { HttpError, wrap } from "./core.mjs";
export const defaultSite = {
  maintenance: false,
  maintenance_message:
    "Pemeliharaan sedang berlangsung. Coba kembali sebentar lagi.",
  hero_title: "",
  hero_subtitle: "",
  support_email: "",
  enabled_services: {
    ai: true,
    sandbox: true,
    payments: true,
    marketplace: true,
    studio: true,
    // Admin-editable package prices live here because migration 005's
    // piwu_admin_action() whitelists the top-level keys of the value; adding a
    // new top-level key would need a migration. Empty = shared price ladder.
    plan_overrides: {},
  },
};
export const schemaMissing = (e) =>
  ["42P01", "PGRST205", "PGRST202"].includes(e?.code);
/**
 * Package overrides from a stored settings value. They live beside the service
 * switches (`enabled_services.plan_overrides`) and a future top-level key is
 * accepted too, so a later migration can move them without breaking readers.
 */
export function planOverridesOf(value) {
  return value?.enabled_services?.plan_overrides ?? value?.plan_overrides ?? {};
}
export function platformResult(result) {
  if (result.error) {
    const m = result.error.message || "";
    if (schemaMissing(result.error))
      throw new HttpError(
        503,
        "Panel admin belum disiapkan. Periksa migration 005_admin.sql dan 008_admin_directory.sql.",
        "ADMIN_SETUP",
      );
    const messages = {
      ADMIN_CONFLICT:
        "Data berubah atau proses sudah berjalan. Muat ulang sebelum mencoba lagi.",
      ADMIN_DUPLICATE: "ID permintaan sudah digunakan untuk tindakan berbeda.",
      ADMIN_LAST_SUPERADMIN:
        "Superadmin terakhir tidak boleh dihapus atau diturunkan perannya.",
      ADMIN_REMOVE_ROLE_FIRST:
        "Cabut peran admin pengguna ini sebelum menangguhkan atau menghapus akun.",
      ADMIN_SELF: "Akun Anda sendiri tidak dapat dihapus dari panel admin.",
      ADMIN_NEGATIVE_BALANCE: "Pengurangan akan membuat saldo negatif.",
      ADMIN_NOT_FOUND: "Data tidak ditemukan.",
      ADMIN_INVALID: "Format tindakan admin tidak valid.",
    };
    const code = Object.keys(messages).find((k) => m.includes(k));
    // A superadmin deleting their own account is forbidden for a different
    // reason than a missing role, so it keeps its own message.
    if (code === "ADMIN_SELF")
      throw new HttpError(403, messages[code], "ADMIN_SELF");
    if (result.error.code === "42501")
      throw new HttpError(
        403,
        "Anda tidak memiliki izin untuk tindakan admin ini.",
        "ADMIN_FORBIDDEN",
      );
    throw new HttpError(
      code === "ADMIN_NOT_FOUND" ? 404 : code === "ADMIN_INVALID" ? 400 : 409,
      code
        ? messages[code]
        : "Operasi admin gagal; perubahan belum dikonfirmasi.",
      code || "ADMIN_FAILED",
    );
  }
  return result.data;
}
export async function userActive(ctx, id) {
  if (!ctx.admin) return;
  const r = await ctx.admin
    .from("platform_user_controls")
    .select("suspended")
    .eq("user_id", id)
    .maybeSingle();
  if (schemaMissing(r.error)) {
    if (ctx.env?.NODE_ENV === "production")
      throw new HttpError(
        503,
        "Kontrol keamanan platform belum tersedia. Terapkan migration admin sebelum melanjutkan.",
        "ADMIN_SETUP",
      );
    return;
  }
  if (r.error)
    throw new HttpError(503, "Status akun belum dapat diverifikasi.");
  if (r.data?.suspended)
    throw new HttpError(
      403,
      "Akun Anda sedang ditangguhkan. Hubungi administrator.",
      "ACCOUNT_SUSPENDED",
    );
}
export async function projectUnlocked(ctx, id) {
  const r = await ctx
    .needAdmin()
    .from("platform_project_controls")
    .select("locked")
    .eq("project_id", id)
    .maybeSingle();
  if (schemaMissing(r.error)) {
    if (ctx.env?.NODE_ENV === "production")
      throw new HttpError(
        503,
        "Kontrol keamanan platform belum tersedia. Terapkan migration admin sebelum melanjutkan.",
        "ADMIN_SETUP",
      );
    return;
  }
  if (r.error)
    throw new HttpError(503, "Status project belum dapat diverifikasi.");
  if (r.data?.locked)
    throw new HttpError(
      423,
      "Project dikunci administrator. Baca dan ekspor tetap tersedia.",
      "PROJECT_LOCKED",
    );
}
export async function siteSettings(ctx) {
  if (!ctx.admin) return { revision: 0, value: defaultSite };
  const r = await ctx.admin
    .from("site_configuration")
    .select("revision,value")
    .eq("id", true)
    .maybeSingle();
  if (schemaMissing(r.error)) {
    if (ctx.env?.NODE_ENV === "production")
      throw new HttpError(
        503,
        "Konfigurasi keamanan platform belum tersedia.",
        "ADMIN_SETUP",
      );
    return { revision: 0, value: defaultSite };
  }
  if (r.error)
    throw new HttpError(503, "Konfigurasi platform tidak dapat dibaca.");
  return r.data || { revision: 0, value: defaultSite };
}
export async function enforcePlatform(ctx, req) {
  const path = req.path.replace(/^\/api/, "");
  if (
    ["/health", "/status", "/verify"].includes(path) ||
    path.startsWith("/admin") ||
    path.startsWith("/public") ||
    path.startsWith("/webhooks") ||
    path.startsWith("/announcements")
  )
    return;
  if (!ctx.admin) return;
  const { value } = await siteSettings(ctx);
  if (value.maintenance && !["GET", "HEAD", "OPTIONS"].includes(req.method))
    throw new HttpError(
      503,
      value.maintenance_message || defaultSite.maintenance_message,
      "MAINTENANCE",
    );
  const service = /\/ai$/.test(path)
    ? "ai"
    : /\/sandbox|\/packages|\/audit$/.test(path)
      ? "sandbox"
      : path === "/checkout"
        ? "payments"
        : /^\/marketplace|\/template$/.test(path)
          ? "marketplace"
          : /(^|\/)studio(\/|$)/.test(path)
            ? "studio"
            : null;
  if (
    (service && value.enabled_services?.[service] === false) ||
    (path === "/checkout" &&
      req.body?.sku === "template" &&
      value.enabled_services?.marketplace === false)
  )
    throw new HttpError(
      503,
      "Layanan ini sementara dinonaktifkan administrator.",
      "SERVICE_PAUSED",
    );
}
export function platformGate(ctx) {
  return wrap(async (req, res, next) => {
    if (req.path === "/marketplace" && req.method === "GET")
      await enforcePlatform(ctx, req);
    next();
  });
}
export function platformAdmin(ctx, minimum = "auditor") {
  return wrap(async (req, res, next) => {
    const row = platformResult(
      await ctx
        .needAdmin()
        .from("platform_admins")
        .select("role")
        .eq("user_id", req.user.id)
        .maybeSingle(),
    );
    const rank = { auditor: 1, operator: 2, superadmin: 3 };
    if (
      !row ||
      !Object.hasOwn(rank, row.role) ||
      rank[row.role] < rank[minimum]
    )
      throw new HttpError(
        403,
        "Akun ini tidak memiliki akses administrator platform.",
        "ADMIN_FORBIDDEN",
      );
    req.adminRole = row.role;
    next();
  });
}
