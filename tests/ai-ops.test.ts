import test from "node:test";
import assert from "node:assert/strict";
import {
  OPS_MAX,
  SCENE_LIMITS,
  applyResultOps,
  applySceneOps,
  parseOps,
  validateResultOps,
} from "../server/lib/ai-ops.mjs";
import { validateAIResult } from "../server/routes/ai.mjs";

const scene = (objects: any[]) =>
  JSON.stringify({ version: 1, objects }, null, 2);
const block = (over: Record<string, any> = {}) => ({
  id: "obj-atap",
  name: "Atap",
  kind: "block",
  parent: null,
  position: [0, 5, 0],
  rotation: [0, 0, 0],
  size: [10, 1, 10],
  color: "#aa0000",
  anchored: true,
  ...over,
});
const model = (over: Record<string, any> = {}) => ({
  id: "obj-rumah",
  name: "Rumah",
  kind: "model",
  parent: null,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  size: [1, 1, 1],
  color: "#ffffff",
  anchored: true,
  ...over,
});
const transform = (ops: any[]) => [{ kind: "scene.transform", ops }];
const read = (result: any) => JSON.parse(result.scene);
const byId = (result: any, id: string) =>
  read(result).objects.find((o: any) => o.id === id);

test("scene ops move, rotate, scale and recolour by id without touching others", () => {
  const result = applySceneOps({
    scene: scene([block(), block({ id: "obj-pagar", name: "Pagar" })]),
    ops: transform([
      {
        target: "obj-atap",
        move: [2, 0, -1],
        rotate: [0, 90, 0],
        color: "#2857AA",
      },
    ]),
  });
  assert.equal(result.report.sceneChanged, true);
  assert.equal(result.report.rejected.length, 0);
  assert.deepEqual(byId(result, "obj-atap").position, [2, 5, -1]);
  assert.deepEqual(byId(result, "obj-atap").rotation, [0, 90, 0]);
  assert.equal(byId(result, "obj-atap").color, "#2857aa");
  // Untouched neighbour keeps its own transform.
  assert.deepEqual(byId(result, "obj-pagar").position, [0, 5, 0]);
  assert.equal(byId(result, "obj-pagar").color, "#aa0000");
  assert.deepEqual(result.report.applied[0].changes, [
    "geser [2,0,-1]",
    "putar [0,90,0] derajat",
    "warna #2857aa",
  ]);
});

test("scene ops resolve an object by name, but refuse an ambiguous name", () => {
  const named = applySceneOps({
    scene: scene([block({ id: "a", name: "Batu" })]),
    ops: transform([{ target: "batu", scale: 2 }]),
  });
  assert.equal(named.report.sceneChanged, true);
  assert.deepEqual(byId(named, "a").size, [20, 2, 20]);

  const ambiguous = applySceneOps({
    scene: scene([
      block({ id: "a", name: "Batu" }),
      block({ id: "b", name: "Batu" }),
    ]),
    ops: transform([{ target: "Batu", scale: 2 }]),
  });
  assert.equal(ambiguous.scene, null);
  assert.equal(ambiguous.report.sceneChanged, false);
  assert.match(ambiguous.report.rejected[0].reason, /pakai ID/);
});

test("scaling a model scales its descendants because a model size is ignored", () => {
  const result = applySceneOps({
    scene: scene([
      model(),
      model({
        id: "obj-anak",
        name: "Anak",
        parent: "obj-rumah",
        position: [3, 0, 0],
      }),
      block({
        id: "obj-cucu",
        name: "Cucu",
        parent: "obj-anak",
        position: [1, 1, 0],
        size: [1, 1, 1],
      }),
    ]),
    ops: transform([{ target: "obj-rumah", scale: 2 }]),
  });
  assert.equal(result.report.sceneChanged, true);
  // The model itself keeps the ignored placeholder size.
  assert.deepEqual(byId(result, "obj-rumah").size, [1, 1, 1]);
  assert.deepEqual(byId(result, "obj-anak").position, [6, 0, 0]);
  // A nested model keeps the ignored placeholder; its own child grows twice.
  assert.deepEqual(byId(result, "obj-anak").size, [1, 1, 1]);
  assert.deepEqual(byId(result, "obj-cucu").position, [2, 2, 0]);
  assert.deepEqual(byId(result, "obj-cucu").size, [2, 2, 2]);
  assert.match(result.report.applied[0].changes.join(" "), /2 turunan/);
});

test("a batch is atomic: one bad op leaves the saved scene untouched", () => {
  const original = scene([block()]);
  for (const ops of [
    transform([
      { target: "obj-atap", move: [1, 0, 0] },
      { target: "Tidak Ada", move: [1, 0, 0] },
    ]),
    transform([{ target: "obj-atap", scale: 500 }]),
    transform([{ target: "obj-atap", move: [99999, 0, 0] }]),
  ]) {
    const result = applySceneOps({ scene: original, ops });
    assert.equal(result.scene, null, JSON.stringify(ops));
    assert.equal(result.report.sceneChanged, false);
    assert.ok(result.report.rejected.length >= 1);
    assert.equal(result.report.applied.length, 0);
    assert.match(result.report.note, /tidak ada perubahan diterapkan/i);
  }
});

test("scene ops never exceed the scene limits, including the object cap", () => {
  const filler = Array.from({ length: SCENE_LIMITS.objects }, (_, i) =>
    block({ id: "f" + i, name: "F" + i, parent: null }),
  );
  // Scaling a part past the size limit is refused instead of clamped.
  const tooBig = applySceneOps({
    scene: scene([block({ size: [900, 1, 1] })]),
    ops: transform([{ target: "obj-atap", scale: 2 }]),
  });
  assert.equal(tooBig.report.sceneChanged, false);
  assert.match(tooBig.report.rejected[0].reason, /0,05–1000/);
  // The cap itself is pinned so the server and the browser schema stay equal.
  assert.equal(SCENE_LIMITS.objects, 250);
  assert.equal(SCENE_LIMITS.meshVertices, 512);
  assert.equal(SCENE_LIMITS.meshFaces, 1024);
  assert.equal(SCENE_LIMITS.characters, 240000);
  const full = applySceneOps({
    scene: scene(filler),
    ops: transform([{ target: "f0", move: [1, 0, 0] }]),
  });
  assert.equal(full.report.sceneChanged, true);
});

test("ops validation rejects unknown kinds, empty batches, stray fields and oversized batches", () => {
  const unknown = parseOps([{ kind: "scene.delete", ops: [{ target: "a" }] }]);
  assert.equal(unknown.value.length, 0);
  assert.match(unknown.issues[0], /jenis operasi tidak didukung/);
  assert.equal(parseOps(transform([])).issues.length > 0, true);
  assert.equal(parseOps(transform([{ target: "a" }])).issues.length > 0, true);
  assert.equal(
    parseOps(transform([{ target: "a", move: [0, 0, 0], shell: "x" }])).issues
      .length > 0,
    true,
  );
  assert.equal(
    parseOps(transform([{ target: "a", move: [0, 0, 0, 0] }])).issues.length >
      0,
    true,
  );
  const one = { target: "a", move: [1, 0, 0] };
  const many = Array.from({ length: OPS_MAX + 1 }, () => one);
  assert.equal(parseOps(transform(many)).issues.length > 0, true);
  assert.equal(parseOps(transform(many.slice(0, OPS_MAX))).issues.length, 0);
  assert.throws(
    () =>
      validateResultOps([{ kind: "scene.transform", ops: [{ target: "a" }] }]),
    /tidak valid/,
  );
  assert.equal(validateResultOps(undefined), undefined);
});

test("ops refuse to run when the saved scene is missing or invalid", () => {
  const missing = applySceneOps({
    scene: undefined,
    ops: transform([{ target: "a", scale: 2 }]),
  });
  assert.equal(missing.scene, null);
  assert.match(missing.report.note, /belum ada di project ini/);
  const broken = applySceneOps({
    scene: JSON.stringify({
      version: 1,
      objects: [{ ...block(), size: [0, 0, 0] }],
    }),
    ops: transform([{ target: "obj-atap", scale: 2 }]),
  });
  assert.equal(broken.scene, null);
  assert.match(broken.report.note, /tidak lolos validasi skema/);
});

test("a reply with ops may not also replace the scene file, and ops stay out of non-Roblox projects", () => {
  const saved = scene([block()]);
  const withOps = applyResultOps({
    kind: "roblox",
    mode: "Builder",
    // The reply proposes its own scene text; the batch ignores it and edits the
    // saved scene the browser sent instead.
    files: {
      [SCENE_PATH_FOR_TEST]: scene([block({ position: [99, 99, 99] })]),
      "src/App.tsx": "export default 1",
    },
    saved: { [SCENE_PATH_FOR_TEST]: saved },
    result: { ops: transform([{ target: "obj-atap", move: [1, 0, 0] }]) },
  });
  // The batch is authoritative; the model's own scene text is discarded.
  assert.deepEqual(
    JSON.parse(withOps.files![SCENE_PATH_FOR_TEST]).objects[0].position,
    [1, 5, 0],
  );
  assert.equal(withOps.files!["src/App.tsx"], "export default 1");
  assert.match(withOps.report!.note, /Tinjau sebelum dipakai/);

  const wrongKind = applyResultOps({
    kind: "webapp",
    mode: "Builder",
    files: {},
    result: { ops: transform([{ target: "obj-atap", move: [1, 0, 0] }]) },
  });
  assert.equal(wrongKind.report!.sceneChanged, false);
  assert.match(
    wrongKind.report!.rejected[0].reason,
    /hanya berlaku untuk project Roblox/,
  );

  const wrongMode = applyResultOps({
    kind: "roblox",
    mode: "Ask",
    files: {},
    result: { ops: transform([{ target: "obj-atap", move: [1, 0, 0] }]) },
  });
  assert.equal(wrongMode.report!.sceneChanged, false);
  assert.match(
    wrongMode.report!.rejected[0].reason,
    /hanya dijalankan pada mode Builder/,
  );

  // A rejected batch drops a scene the model tried to slip in beside the ops.
  const rejected = applyResultOps({
    kind: "roblox",
    mode: "Builder",
    files: { [SCENE_PATH_FOR_TEST]: saved, "index.html": "<html>" },
    saved: { [SCENE_PATH_FOR_TEST]: saved },
    result: { ops: transform([{ target: "Tidak Ada", move: [1, 0, 0] }]) },
  });
  assert.equal(rejected.files![SCENE_PATH_FOR_TEST], undefined);
  assert.equal(rejected.files!["index.html"], "<html>");
});

test("the AI reply schema carries ops only for Builder replies", () => {
  const reply = {
    content: "Atap digeser.",
    ops: transform([{ target: "obj-atap", move: [1, 0, 0] }]),
  };
  const builder = validateAIResult(structuredClone(reply), "Builder");
  assert.equal(builder.ops.length, 1);
  assert.equal(validateAIResult(structuredClone(reply), "Ask").ops, undefined);
  const planned = validateAIResult(
    {
      ...structuredClone(reply),
      plan: { goal: "Atap", tasks: [{ text: "Geser atap" }] },
    },
    "Plan",
  );
  assert.equal(planned.ops, undefined);
  assert.equal(planned.plan!.approved, false);
  assert.throws(
    () =>
      validateAIResult(
        {
          content: "x",
          ops: [{ kind: "scene.transform", ops: [{ target: "a" }] }],
        },
        "Builder",
      ),
    // Refused with the specific reason instead of a generic schema error.
    /Operasi tidak mengubah apa pun/,
  );
  // Secrets are still screened once ops are in the payload.
  assert.throws(
    () =>
      validateAIResult(
        {
          content: "x",
          ops: transform([
            { target: "sk-live-abcdefghijklmnop", move: [1, 0, 0] },
          ]),
        },
        "Builder",
      ),
    /kredensial|sensitif/i,
  );
});

const SCENE_PATH_FOR_TEST = "scene.roblox.json";
