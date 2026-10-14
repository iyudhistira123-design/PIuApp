import { z } from "zod";
export const columnSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,39}$/)
      .refine((k) => !["constructor", "prototype"].includes(k)),
    label: z.string().trim().min(1).max(80),
    type: z.enum(["text", "number", "boolean"]),
  })
  .strict();
export const dataShape = z.object({
  name: z.string().trim().min(1).max(80),
  columns: z.array(columnSchema).min(1).max(32),
  rows: z
    .array(
      z
        .object({
          id: z.uuid(),
          values: z.record(
            z.string(),
            z.union([
              z.string().max(4000),
              z.number().min(-1e15).max(1e15),
              z.boolean(),
              z.null(),
            ]),
          ),
        })
        .strict(),
    )
    .max(1000),
});
export type DataColumn = z.infer<typeof columnSchema>;
export type DataRow = z.infer<typeof dataShape>["rows"][number];
export type Dataset = z.infer<typeof dataShape> & {
  id: string;
  revision: number;
};
export interface DatasetMeta {
  id: string;
  name: string;
  revision: number;
  updated_at?: string;
}
export function validateDataset(value: unknown): Dataset {
  const parsed = dataShape
    .extend({
      id: z.uuid(),
      revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    })
    .safeParse(value);
  if (!parsed.success)
    throw new Error(
      "Format tabel tidak valid. Gunakan 1–32 kolom, maksimal 1.000 baris, nilai sesuai tipe, dan nama maksimal 80 karakter.",
    );
  const d = parsed.data;
  const keys = new Set(d.columns.map((c) => c.key));
  if (
    keys.size !== d.columns.length ||
    new Set(d.rows.map((r) => r.id)).size !== d.rows.length
  )
    throw new Error("Kunci kolom atau ID baris tidak boleh berulang.");
  for (const row of d.rows) {
    if (Object.keys(row.values).some((k) => !keys.has(k)))
      throw new Error("Baris memiliki kolom yang tidak dikenal.");
    for (const c of d.columns) {
      const v = row.values[c.key];
      if (
        v !== null &&
        v !== undefined &&
        typeof v !==
          ({ text: "string", number: "number", boolean: "boolean" } as const)[
            c.type
          ]
      )
        throw new Error("Nilai kolom " + c.label + " tidak sesuai tipe.");
    }
  }
  if (new TextEncoder().encode(JSON.stringify(d)).length > 2000000)
    throw new Error("Tabel maksimal 2 MB.");
  return d;
}
export function emptyDataset(name = "Tabel baru"): Dataset {
  return {
    id: crypto.randomUUID(),
    revision: 0,
    name,
    columns: [{ key: "nama", label: "Nama", type: "text" }],
    rows: [],
  };
}
export function serializeDataset(d: Dataset) {
  return JSON.stringify(
    { format: "piwu-data-v1", name: d.name, columns: d.columns, rows: d.rows },
    null,
    2,
  );
}
export function importDataset(text: string): Dataset {
  if (new TextEncoder().encode(text).length > 2500000)
    throw new Error("File impor terlalu besar.");
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("File bukan JSON yang valid.");
  }
  if (raw?.format !== "piwu-data-v1")
    throw new Error("Gunakan JSON hasil ekspor tabel PiwuApp (piwu-data-v1).");
  const data = validateDataset({
    ...raw,
    id: crypto.randomUUID(),
    revision: 0,
  });
  return {
    ...data,
    name: (data.name + " (impor)").slice(0, 80),
    rows: data.rows.map((r) => ({ ...r, id: crypto.randomUUID() })),
  };
}
