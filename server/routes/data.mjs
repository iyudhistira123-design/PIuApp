import { z } from "zod";
import { HttpError, wrap, uuid } from "../lib/core.mjs";
import { rateLimit } from "../lib/context.mjs";
const column = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,39}$/)
      .refine((v) => !["constructor", "prototype"].includes(v)),
    label: z.string().trim().min(1).max(80),
    type: z.enum(["text", "number", "boolean"]),
  })
  .strict();
const value = z.union([
  z.string().max(4000),
  z.number().min(-1e15).max(1e15),
  z.boolean(),
  z.null(),
]);
export const datasetInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    columns: z.array(column).min(1).max(32),
    rows: z
      .array(
        z
          .object({ id: z.uuid(), values: z.record(z.string(), value) })
          .strict(),
      )
      .max(1000),
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export function datasetResult(result) {
  if (result.error) {
    const message = result.error.message || "";
    if (message.includes("PIWU_DATA_CONFLICT"))
      throw new HttpError(
        409,
        "Tabel berubah atau dihapus di cloud. Draft Anda belum ditimpa. Muat ulang atau simpan sebagai tabel baru.",
        "DATA_CONFLICT",
      );
    if (result.error.code === "42501")
      throw new HttpError(
        403,
        "Akses ke data project ditolak. Periksa keanggotaan Anda.",
        "DATA_FORBIDDEN",
      );
    if (result.error.code === "23505")
      throw new HttpError(
        409,
        "Nama tabel sudah digunakan dalam project ini.",
        "DATA_NAME_EXISTS",
      );
    if (message.includes("PIWU_DATA_LIMIT"))
      throw new HttpError(
        413,
        "Batas data: 20 tabel/project, 32 kolom, 1.000 baris, dan 2 MB per tabel.",
        "DATA_LIMIT",
      );
    if (message.includes("PIWU_DATA_INVALID"))
      throw new HttpError(
        400,
        "Struktur atau tipe nilai tabel tidak valid.",
        "DATA_INVALID",
      );
    if (["42P01", "PGRST202", "PGRST205", "42703"].includes(result.error.code))
      throw new HttpError(
        503,
        "Database data belum siap. Terapkan migration 004_project_data.sql setelah migration 001–003.",
        "DATA_SETUP",
      );
    throw new HttpError(
      502,
      "Data belum dikonfirmasi oleh server. Draft tetap tersedia untuk dicoba kembali.",
      "DATA_UNAVAILABLE",
    );
  }
  return result.data;
}
export function registerData(app, ctx) {
  const base = "/api/projects/:id/data";
  app.get(
    base,
    ctx.auth,
    ctx.project(),
    wrap(async (req, res) => {
      const tables = datasetResult(
        await req.db
          .from("project_datasets")
          .select("id,name,revision,created_at,updated_at")
          .eq("project_id", req.project.id)
          .order("name")
          .limit(20),
      );
      res.json({ tables });
    }),
  );
  app.get(
    base + "/:tableId",
    ctx.auth,
    ctx.project(),
    wrap(async (req, res) => {
      if (!uuid(req.params.tableId))
        throw new HttpError(400, "ID tabel tidak valid.");
      const table = datasetResult(
        await req.db
          .from("project_datasets")
          .select("*")
          .eq("project_id", req.project.id)
          .eq("id", req.params.tableId)
          .maybeSingle(),
      );
      if (!table)
        throw new HttpError(
          404,
          "Tabel sudah dihapus atau tidak dapat diakses.",
          "DATA_NOT_FOUND",
        );
      res.json({ table });
    }),
  );
  app.put(
    base + "/:tableId",
    ctx.auth,
    ctx.project("Editor"),
    rateLimit({ max: 30 }),
    wrap(async (req, res) => {
      if (!uuid(req.params.tableId))
        throw new HttpError(400, "ID tabel tidak valid.");
      const b = datasetInput.parse(req.body);
      if (Buffer.byteLength(JSON.stringify(b)) > 2000000)
        throw new HttpError(413, "Tabel maksimal 2 MB.", "DATA_LIMIT");
      const table = datasetResult(
        await req.db
          .rpc("piwu_save_dataset", {
            p_project: req.project.id,
            p_id: req.params.tableId,
            p_name: b.name,
            p_columns: b.columns,
            p_rows: b.rows,
            p_expected_revision: b.revision,
          })
          .single(),
      );
      res.json({ table });
    }),
  );
  app.delete(
    base + "/:tableId",
    ctx.auth,
    ctx.project("Owner"),
    wrap(async (req, res) => {
      if (!uuid(req.params.tableId))
        throw new HttpError(400, "ID tabel tidak valid.");
      const revision = z.number().int().positive().parse(req.body.revision);
      datasetResult(
        await req.db.rpc("piwu_delete_dataset", {
          p_project: req.project.id,
          p_id: req.params.tableId,
          p_expected_revision: revision,
        }),
      );
      res.json({ deleted: true });
    }),
  );
}
