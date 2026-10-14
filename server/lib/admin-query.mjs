import { z } from "zod";
import { HttpError, uuid } from "./core.mjs";
const states = {
  payments: [
    "created",
    "pending",
    "checkout_error",
    "review",
    "paid",
    "failed",
    "expired",
    "refunded",
  ],
  marketplace: ["draft", "published", "archived"],
  broadcasts: ["draft", "published", "archived"],
};
export function adminFilters(query, section) {
  const parsed = z
    .object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      q: z.string().trim().max(100).default(""),
      status: z.string().max(30).default(""),
      actor: z.union([z.uuid(), z.literal("")]).default(""),
      since: z.union([z.iso.date(), z.literal("")]).default(""),
      until: z.union([z.iso.date(), z.literal("")]).default(""),
    })
    .strict()
    .parse(query);
  if (parsed.status && !states[section]?.includes(parsed.status))
    throw new HttpError(400, "Filter status tidak berlaku untuk daftar ini.");
  if (parsed.since && parsed.until && parsed.since > parsed.until)
    throw new HttpError(400, "Tanggal akhir harus setelah tanggal mulai.");
  if (
    section === "users" &&
    (parsed.status || parsed.actor || parsed.since || parsed.until)
  )
    throw new HttpError(
      400,
      "Direktori akun mendukung pencarian nama, email, dan ID.",
    );
  return parsed;
}
export function applyAdminFilters(builder, section, f, order) {
  const text = {
    projects: "name",
    payments: "sku",
    marketplace: "title",
    broadcasts: "title",
    audit: "reason",
    roles: "role",
  }[section];
  if (f.q) {
    if (uuid(f.q))
      builder = builder.eq(section === "roles" ? "user_id" : "id", f.q);
    else
      builder = builder.ilike(text, "%" + f.q.replace(/[\\%_]/g, "\\$&") + "%");
  }
  if (f.status) builder = builder.eq("status", f.status);
  if (f.actor) {
    const col = {
      projects: "owner_id",
      payments: "user_id",
      marketplace: "owner_id",
      audit: "actor_id",
      roles: "granted_by",
    }[section];
    if (!col)
      throw new HttpError(400, "Filter pelaku tidak berlaku untuk daftar ini.");
    builder = builder.eq(col, f.actor);
  }
  if (f.since) builder = builder.gte(order, f.since + "T00:00:00.000Z");
  if (f.until)
    builder = builder.lt(
      order,
      new Date(Date.parse(f.until + "T00:00:00Z") + 86400000).toISOString(),
    );
  return builder;
}
