import test from "node:test";
import assert from "node:assert/strict";
import {
  initialScene,
  newObject,
  validateSceneChanges,
} from "../src/lib/roblox/scene.ts";
import { nudgeOnMap } from "../src/lib/roblox/map.ts";
import { ROBLOX_SCENE_INSTRUCTIONS } from "../shared/roblox-prompt.mjs";

test("map nudge uses world X/Z under rotated parents and retains source history", () => {
  const group = {
    ...newObject("model"),
    id: "group",
    position: [10, 0, 10] as [number, number, number],
    rotation: [0, 90, 0] as [number, number, number],
  };
  const part = {
    ...newObject("block"),
    id: "part",
    parent: "group",
    position: [0, 2, 0] as [number, number, number],
  };
  const scene = { version: 1 as const, objects: [group, part] };
  const moved = nudgeOnMap(scene, "part", 2, 0);
  assert.deepEqual(moved.objects[1].position, [0, 2, 2]);
  assert.deepEqual(scene.objects[1].position, [0, 2, 0]);
  assert.deepEqual(moved.objects[1].rotation, part.rotation);
  assert.equal(nudgeOnMap(scene, "missing", 2, 0), scene);
  assert.throws(() => nudgeOnMap(scene, "part", 20000, 0));
});
test("AI scene acceptance refuses malformed topology, duplicate IDs and oversized files", () => {
  assert.doesNotThrow(() =>
    validateSceneChanges({
      "scene.roblox.json": JSON.stringify(initialScene()),
    }),
  );
  assert.doesNotThrow(() =>
    validateSceneChanges({ "Main.server.luau": "print('hello')" }),
  );
  for (const source of [
    "{",
    " ".repeat(240001),
    JSON.stringify({
      version: 1,
      objects: [...initialScene().objects, ...initialScene().objects],
    }),
    JSON.stringify({
      version: 1,
      objects: [
        {
          ...newObject("mesh"),
          mesh: {
            vertices: [
              [0, 0, 0],
              [1, 0, 0],
              [0, 1, 0],
            ],
            faces: [[0, 1, 4]],
          },
        },
      ],
    }),
  ]) {
    assert.throws(
      () => validateSceneChanges({ "scene.roblox.json": source }),
      /belum disimpan/,
    );
  }
});
test("AI contract explicitly connects geometry to both views without executing Luau", () => {
  assert.match(ROBLOX_SCENE_INSTRUCTIONS, /COMPLETE updated scene.roblox.json/);
  assert.match(ROBLOX_SCENE_INSTRUCTIONS, /NEVER executed/);
  assert.match(ROBLOX_SCENE_INSTRUCTIONS, /orthographic X\/Z Canvas Map/);
});
