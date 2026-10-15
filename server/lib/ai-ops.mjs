import { z } from "zod";
import { HttpError } from "./core.mjs";

// Deterministic scene ops. The model never rewrites scene.roblox.json for a
// small edit; it returns structured ops and this module applies them, so the
// result is reproducible, validated against the scene limits below, and either
// fully applied or fully rejected.
//
// The scene schema mirrors src/lib/roblox/scene.ts (the source of truth for the
// browser renderer). The server cannot import that TypeScript module, so the
// limits are repeated here and pinned by tests on both sides.
export const SCENE_PATH = "scene.roblox.json";
export const OPS_VERSION = 1;
export const OPS_MAX = 40;
export const SCENE_LIMITS = {
  objects: 250,
  meshVertices: 512,
  meshFaces: 1024,
  vector: 10000,
  sizeMin: 0.05,
  sizeMax: 1000,
  characters: 240000,
};

const component = z
  .number()
  .finite()
  .min(-SCENE_LIMITS.vector)
  .max(SCENE_LIMITS.vector);
const vec = z.tuple([component, component, component]);
const size = vec.refine(
  (v) => v.every((n) => n >= SCENE_LIMITS.sizeMin && n <= SCENE_LIMITS.sizeMax),
  "Ukuran harus 0,05–1000 stud",
);
const mesh = z
  .object({
    vertices: z.array(vec).min(3).max(SCENE_LIMITS.meshVertices),
    faces: z
      .array(
        z.tuple([
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
        ]),
      )
      .max(SCENE_LIMITS.meshFaces),
  })
  .refine(
    (m) =>
      m.faces.every(
        (f) => new Set(f).size === 3 && f.every((i) => i < m.vertices.length),
      ),
    "Indeks face tidak valid",
  );
export const sceneObjectSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["block", "sphere", "cylinder", "mesh", "model"]),
    parent: z.string().max(100).nullable(),
    position: vec,
    rotation: vec,
    size,
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    anchored: z.boolean(),
    mesh: mesh.optional(),
  })
  .refine(
    (o) => o.kind !== "mesh" || !!o.mesh,
    "Mesh memerlukan vertices dan faces",
  );
export const sceneSchema = z
  .object({
    version: z.literal(1),
    objects: z.array(sceneObjectSchema).max(SCENE_LIMITS.objects),
  })
  .superRefine((s, ctx) => {
    const ids = new Set(s.objects.map((o) => o.id));
    if (ids.size !== s.objects.length)
      ctx.addIssue({ code: "custom", message: "ID objek harus unik" });
    for (const o of s.objects) {
      const seen = new Set([o.id]);
      let parent = o.parent;
      while (parent) {
        const p = s.objects.find((n) => n.id === parent);
        if (!p || p.kind !== "model" || seen.has(parent)) {
          ctx.addIssue({
            code: "custom",
            message: "Struktur parent tidak valid",
          });
          break;
        }
        seen.add(parent);
        parent = p.parent;
      }
    }
  });

const change = z
  .object({
    target: z.string().trim().min(1).max(100),
    move: vec.optional(),
    rotate: vec.optional(),
    scale: z
      .union([z.number().finite().min(SCENE_LIMITS.sizeMin).max(100), size])
      .optional(),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
  })
  .strict()
  .refine(
    (c) =>
      c.move !== undefined ||
      c.rotate !== undefined ||
      c.scale !== undefined ||
      c.color !== undefined,
    "Operasi tidak mengubah apa pun",
  );

// One entry per op kind, so a new kind is added explicitly and anything else is
// reported as unsupported instead of being silently dropped.
const opEntry = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("scene.transform"),
      ops: z.array(change).min(1).max(OPS_MAX),
    })
    .strict(),
]);
export const opsSchema = z.array(opEntry).min(1).max(OPS_MAX);

const round = (n) => Number(n.toFixed(3));
const trimmed = (v) => JSON.stringify(v.map(round));

/** Resolves a target string to exactly one object; ambiguity is a rejection. */
function resolveTarget(objects, target) {
  const byId = objects.find((o) => o.id === target);
  if (byId) return byId;
  const lower = target.toLowerCase();
  const byName = objects.filter((o) => o.name.toLowerCase() === lower);
  if (byName.length === 1) return byName[0];
  return {
    error: byName.length
      ? "Nama dipakai lebih dari satu objek"
      : "Objek tidak ditemukan",
  };
}

/** Descendants of a model, so scaling it also scales what it contains. */
function descendants(objects, id) {
  const out = [];
  const queue = objects.filter((o) => o.parent === id);
  while (queue.length) {
    const next = queue.shift();
    out.push(next);
    queue.push(...objects.filter((o) => o.parent === next.id));
  }
  return out;
}

function applyChange(objects, change, report) {
  const found = resolveTarget(objects, change.target);
  if (found.error) {
    report.rejected.push({
      kind: "scene.transform",
      target: change.target,
      reason:
        found.error === "Objek tidak ditemukan"
          ? `Objek "${change.target}" tidak ditemukan`
          : `Nama "${change.target}" dipakai lebih dari satu objek; pakai ID`,
    });
    return false;
  }
  const changes = [];
  const touched =
    change.scale !== undefined
      ? [found, ...descendants(objects, found.id)]
      : [found];
  if (change.move) {
    for (const object of [found]) {
      object.position = object.position.map((n, i) =>
        round(n + change.move[i]),
      );
    }
    changes.push("geser " + trimmed(change.move));
  }
  if (change.rotate) {
    for (const object of [found]) {
      object.rotation = object.rotation.map((n, i) =>
        round(n + change.rotate[i]),
      );
    }
    changes.push("putar " + trimmed(change.rotate) + " derajat");
  }
  if (change.scale !== undefined) {
    const factors = Array.isArray(change.scale)
      ? change.scale
      : [change.scale, change.scale, change.scale];
    for (const object of touched) {
      object.position = object.position.map((n, i) => round(n * factors[i]));
      // A model size is ignored by the renderer, so only its descendants grow.
      if (object.kind !== "model")
        object.size = object.size.map((n, i) => round(n * factors[i]));
    }
    changes.push(
      "skala " +
        trimmed(factors) +
        (touched.length > 1 ? ` (${touched.length - 1} turunan)` : ""),
    );
  }
  if (change.color) {
    found.color = change.color.toLowerCase();
    changes.push("warna " + change.color.toLowerCase());
  }
  report.applied.push({
    kind: "scene.transform",
    target: change.target,
    id: found.id,
    name: found.name,
    changes,
  });
  return true;
}

export function parseOps(value) {
  const parsed = opsSchema.safeParse(value);
  if (parsed.success) return { value: parsed.data, issues: [] };
  const issues = parsed.error.issues.slice(0, 10).map((i) => {
    const where = i.path.join(".") || "ops";
    if (/Invalid discriminator/.test(i.message))
      return `${where}: jenis operasi tidak didukung (hanya scene.transform)`;
    if (/Unrecognized key/.test(i.message))
      return `${where}: ada kolom yang tidak dikenal pada operasi`;
    return `${where}: ${i.message}`;
  });
  return { value: [], issues };
}

/**
 * Applies an ops batch to a saved scene. Atomic on purpose: if any single op is
 * invalid the scene is left untouched, so a review never shows a half-applied
 * batch. Returns the scene text, or null when nothing may be written.
 */
export function applySceneOps({ scene, ops }) {
  const report = {
    version: OPS_VERSION,
    applied: [],
    rejected: [],
    sceneChanged: false,
    note: "",
  };
  if (scene === undefined || scene === null || scene === "") {
    report.note = `${SCENE_PATH} belum ada di project ini, jadi operasi tidak diterapkan.`;
    return { scene: null, report };
  }
  let parsed;
  try {
    parsed = typeof scene === "string" ? JSON.parse(scene) : scene;
  } catch {
    report.note = `${SCENE_PATH} tidak dapat dibaca sebagai JSON, jadi operasi tidak diterapkan.`;
    return { scene: null, report };
  }
  const valid = sceneSchema.safeParse(parsed);
  if (!valid.success) {
    report.note = `${SCENE_PATH} tidak lolos validasi skema (${valid.error.issues[0]?.message || "tidak diketahui"}), jadi operasi tidak diterapkan.`;
    return { scene: null, report };
  }
  const { value, issues } = parseOps(ops);
  if (issues.length) {
    report.rejected.push({
      kind: "ops",
      target: "",
      reason: issues.join("; "),
    });
    report.note =
      "Batch operasi tidak valid, jadi tidak ada perubahan diterapkan.";
    return { scene: null, report };
  }
  const working = structuredClone(valid.data);
  for (const entry of value) {
    const entryReport = { applied: [], rejected: [] };
    for (const item of entry.ops)
      applyChange(working.objects, item, entryReport);
    if (entryReport.rejected.length) {
      report.rejected.push(...entryReport.rejected);
      report.note =
        "Ada operasi yang tidak dapat diterapkan, jadi tidak ada perubahan diterapkan (batch bersifat semua-atau-tidak).";
      return { scene: null, report };
    }
    report.applied.push(...entryReport.applied);
  }
  const finalCheck = sceneSchema.safeParse(working);
  if (!finalCheck.success) {
    report.applied = [];
    report.rejected.push({
      kind: "scene.transform",
      target: "",
      reason: finalCheck.error.issues[0]?.message || "Hasil tidak valid",
    });
    report.note =
      "Hasil operasi melanggar batas scene, jadi tidak ada perubahan diterapkan.";
    return { scene: null, report };
  }
  const text = JSON.stringify(finalCheck.data, null, 2);
  if (text.length > SCENE_LIMITS.characters) {
    report.applied = [];
    report.rejected.push({
      kind: "scene.transform",
      target: "",
      reason: `Scene melebihi ${SCENE_LIMITS.characters} karakter`,
    });
    report.note = "Hasil operasi terlalu besar untuk disimpan.";
    return { scene: null, report };
  }
  report.sceneChanged = true;
  report.note = `${report.applied.length} operasi diterapkan pada ${SCENE_PATH}. Tinjau sebelum dipakai.`;
  return { scene: text, report };
}

/**
 * Turns an AI result that may carry ops into files plus an honest report.
 * `saved` is the file set the browser sent with the request: that is the scene
 * ops are applied to. `files` is what the reply proposed.
 * Only Roblox Builder replies may change geometry; ops on anything else are
 * dropped with a note instead of being ignored silently.
 */
export function applyResultOps({ kind, mode, files, saved, result }) {
  if (!result?.ops?.length) return { files, report: null };
  if (kind !== "roblox" || mode !== "Builder")
    return {
      files,
      report: {
        version: OPS_VERSION,
        applied: [],
        rejected: result.ops.map((entry) => ({
          kind: entry?.kind || "ops",
          target: "",
          reason:
            kind !== "roblox"
              ? "Operasi scene hanya berlaku untuk project Roblox"
              : "Operasi scene hanya dijalankan pada mode Builder",
        })),
        sceneChanged: false,
        note: "Tidak ada operasi scene yang dijalankan.",
      },
    };
  // A reply that carries ops may not also replace the scene file: the batch is
  // authoritative, so an invalid scene cannot slip in beside it.
  const proposed = { ...(files || {}) };
  const replacedScene = proposed[SCENE_PATH] !== undefined;
  delete proposed[SCENE_PATH];
  const trimmed = replacedScene ? proposed : files;
  const { scene, report } = applySceneOps({
    scene: saved?.[SCENE_PATH],
    ops: result.ops,
  });
  if (!scene) return { files: trimmed, report };
  const hasFiles = Object.keys(proposed).length > 0;
  return { files: { ...proposed, [SCENE_PATH]: scene }, report, hasFiles };
}

/** Validates ops coming straight from a model reply, before they are applied. */
export function validateResultOps(value) {
  if (value === undefined) return undefined;
  const { value: ops, issues } = parseOps(value);
  if (issues.length)
    throw new HttpError(
      502,
      "Struktur operasi scene dari AI tidak valid: " + issues[0],
    );
  return ops;
}
