import test from "node:test";
import assert from "node:assert/strict";
import {
  initialFrames,
  decodeLayout,
  arrangeFrames,
  fitCamera,
  zoomAt,
  layoutKey,
  MAX_FRAMES,
} from "../src/lib/canvas/layout.ts";
test("Canvas layouts: isolated keys, validated dimensions, bounded count and serialized round-trip", () => {
  const frames = initialFrames();
  assert.equal(frames.length, 3);
  assert.equal(new Set(frames.map((f) => f.id)).size, 3);
  assert.deepEqual(
    decodeLayout(JSON.stringify({ version: 1, frames })),
    frames,
  );
  assert.notEqual(
    layoutKey("account:a", "project"),
    layoutKey("account:b", "project"),
  );
  assert.notEqual(layoutKey("demo", "a:b"), layoutKey("demo:a", "b"));
  const encode = (frames: any, version = 1) =>
    JSON.stringify({ version, frames });
  for (const value of [
    encode(frames, 2),
    encode([...frames, ...frames]),
    encode(Array(MAX_FRAMES + 1).fill(frames[0])),
    encode([{ ...frames[0], width: 1 }]),
    encode([{ ...frames[0], height: 20000 }]),
    encode([{ ...frames[0], x: null }]),
    encode([{ ...frames[0], name: "" }]),
    encode([{ ...frames[0], kind: "constructor" }]),
    "{bad",
  ])
    assert.throws(() => decodeLayout(value));
  assert.deepEqual(decodeLayout(encode([])), []);
});
test("Canvas camera: fit bounds, cursor-anchored zoom, scale limits, no mutation while arranging", () => {
  const frames = initialFrames();
  const before = structuredClone(frames);
  const arranged = arrangeFrames(frames);
  assert.deepEqual(frames, before);
  assert.equal(arranged[1].x, arranged[0].width + 80);
  const camera = fitCamera(frames, 1200, 800);
  assert.ok(camera.scale >= 0.12 && camera.scale <= 0.9);
  for (const f of frames) {
    assert.ok(f.x * camera.scale + camera.x >= 0);
    assert.ok((f.x + f.width) * camera.scale + camera.x <= 1200);
  }
  const zoomed = zoomAt(camera, 0.6, 450, 300);
  assert.ok(
    Math.abs(
      (450 - camera.x) / camera.scale - (450 - zoomed.x) / zoomed.scale,
    ) < 0.0001,
  );
  assert.equal(zoomAt(camera, 100, 0, 0).scale, 1.5);
  assert.equal(zoomAt(camera, 0, 0, 0).scale, 0.12);
  assert.ok(Number.isFinite(fitCamera([], 0, 0).scale));
});
