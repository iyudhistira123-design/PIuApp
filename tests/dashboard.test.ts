import test from "node:test";
import assert from "node:assert/strict";
import {
  attentionItems,
  bridgeWaiting,
  continueLine,
  creditSpend,
  domainWaiting,
  failedDeploy,
  formatBytes,
  pendingInvites,
  projectFootprint,
  sceneFootprint,
  syncNotice,
  type ProjectSignals,
} from "../src/lib/dashboard/attention";
import { SCENE_PATH } from "../src/lib/roblox/scene";
import type { Project } from "../src/lib/types";

// The dashboard insights are pure data-to-wording functions, so they are tested
// here without a browser: what waits for the user, what was spent, what a
// project holds. The browser spec then only has to prove the widgets render
// what these functions returned.

const NOW = Date.parse("2026-10-16T10:00:00.000Z");
const days = (count: number) => new Date(NOW + count * 86400000).toISOString();

const project = (over: Partial<Project> = {}) =>
  ({
    id: "p-1",
    name: "Pulau obby",
    description: "",
    template: "blank",
    files: {},
    messages: [],
    versions: [],
    comments: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }) as unknown as Project;

const signals = (over: Partial<ProjectSignals> = {}): ProjectSignals => ({
  project: { id: "p-1", name: "Pulau obby" },
  ...over,
});

test("every waiting signal that is real shows up, in the order a person would act on it", () => {
  const items = attentionItems(
    signals({
      comments: [
        { status: "open" },
        { status: "resolved" },
        { status: "open" },
      ],
      invites: [
        {
          id: "i1",
          email: "tim@example.test",
          role: "Editor",
          expires_at: days(3),
        },
        { id: "i2", email: "lama@example.test", expires_at: days(-1) },
        { id: "i3", email: "sudah@example.test", accepted_at: days(-2) },
        { id: "i4", email: "batal@example.test", revoked_at: days(-2) },
      ],
      deployments: {
        site: {
          url: "https://piwu.test",
          custom_domain: "contoh.test",
          domain_status: "pending_dns",
        },
        deployments: [{ status: "failed", error: "Build gagal: file hilang" }],
      },
      studio: { state: "queued", queuedChanges: 2 },
    }),
    NOW,
  );
  assert.deepEqual(
    items.map((item) => item.kind),
    ["comments", "invites", "domain", "deploy", "studio"],
  );
  assert.equal(items[0].title, "2 komentar belum diselesaikan");
  assert.match(items[1].title, /1 undangan kolaborator belum dijawab/);
  assert.equal(items[1].detail, "tim@example.test");
  assert.match(items[2].detail || "", /contoh.test/);
  assert.equal(items[3].detail, "Build gagal: file hilang");
  assert.match(items[4].title, /2 perubahan menunggu diterapkan di Studio/);
  // Each item links straight to the panel that resolves it.
  assert.equal(items[0].link, "/project/p-1?dialog=services&services=comments");
  assert.equal(items[1].link, "/project/p-1?dialog=services&services=invite");
  assert.equal(items[2].link, "/project/p-1?dialog=services&services=publish");
  assert.equal(items[4].link, "/project/p-1");
});

test("nothing is invented: absent or finished signals produce no items", () => {
  assert.deepEqual(attentionItems(signals(), NOW), []);
  assert.deepEqual(
    attentionItems(
      signals({
        comments: [{ status: "resolved" }],
        invites: [],
        deployments: {
          site: { custom_domain: "contoh.test", domain_status: "active" },
          deployments: [{ status: "success" }, { status: "failed" }],
        },
        studio: { state: "applied", queuedChanges: 0 },
      }),
      NOW,
    ),
    [],
  );
  // A failed deploy that is no longer the newest is history, not a task.
  assert.equal(
    failedDeploy([{ status: "success" }, { status: "failed" }]),
    undefined,
  );
  assert.equal(domainWaiting({ custom_domain: "" }), "");
  assert.equal(bridgeWaiting(null), "");
  assert.equal(bridgeWaiting({ state: "idle", queuedChanges: 0 }), "");
  // Expired invites are not waiting for anyone.
  assert.deepEqual(pendingInvites([{ expires_at: days(-1) }], NOW), []);
  assert.equal(pendingInvites([{ expires_at: days(1) }], NOW).length, 1);
  // An invite without an expiry still waits, because nothing says it ended.
  assert.equal(pendingInvites([{ email: "a@b.test" }], NOW).length, 1);
});

test("sync wording tells the four states apart, and only real trouble counts as trouble", () => {
  assert.equal(syncNotice(undefined), null);
  assert.deepEqual(syncNotice("conflict"), {
    tone: "warn",
    label: "Konflik sinkronisasi",
  });
  assert.equal(syncNotice("error")?.tone, "warn");
  assert.equal(syncNotice("pending")?.tone, "wait");
  assert.equal(syncNotice("saving")?.tone, "wait");
  assert.equal(syncNotice("synced")?.tone, "ok");
  // A conflict is the one sync state that also becomes a "menunggu Anda" item.
  const items = attentionItems(signals({ syncPhase: "conflict" }), NOW);
  assert.deepEqual(
    items.map((item) => item.kind),
    ["sync"],
  );
  assert.equal(
    attentionItems(signals({ syncPhase: "pending" }), NOW).length,
    0,
    "menunggu sinkronisasi bukan keputusan pengguna",
  );
});

test("credit spend counts only what was actually spent inside the window", () => {
  const ledger = [
    { delta: -12, created_at: days(-1) },
    { delta: -30, created_at: days(-6) },
    { delta: -99, created_at: days(-9) },
    { delta: 500, created_at: days(-2) },
    { delta: -3, created_at: undefined },
    { delta: -1, created_at: "bukan tanggal" },
  ];
  assert.equal(creditSpend(ledger, 7, NOW), 42);
  assert.equal(creditSpend([], 7, NOW), 0);
  assert.equal(creditSpend(undefined, 7, NOW), 0);
});

test("a project's footprint is its real contents, not a rounded guess", () => {
  const files = { "src/App.tsx": "x".repeat(100), "README.md": "y".repeat(50) };
  const footprint = projectFootprint(
    project({ files, versions: [{}, {}] as any }),
  );
  assert.equal(footprint.files, 2);
  assert.equal(footprint.versions, 2);
  assert.equal(footprint.bytes, 150);
  assert.equal(footprint.scene, undefined, "bukan project Roblox");
  const withPhotos = projectFootprint(project({ files }), {
    count: 3,
    bytes: 2048,
  });
  assert.deepEqual(withPhotos.photos, {
    count: 3,
    limit: 12,
    bytes: 2048,
    bytesLimit: 16 * 1024 * 1024,
  });
});

test("the Roblox scene is read cheaply, and a broken file is not guessed at", () => {
  const scene = {
    version: 1,
    objects: [
      { id: "a", kind: "block" },
      { id: "b", kind: "mesh" },
      { id: "c", kind: "mesh" },
      { id: "d", kind: "model" },
    ],
  };
  assert.deepEqual(sceneFootprint({ [SCENE_PATH]: JSON.stringify(scene) }), {
    objects: 4,
    meshes: 2,
    meshesWithAsset: 0,
  });
  assert.deepEqual(
    sceneFootprint({
      [SCENE_PATH]: JSON.stringify(scene),
      "studio.assets.json": JSON.stringify({
        version: 1,
        assets: { b: { assetId: "12345678" }, c: { assetId: "" } },
      }),
    }),
    { objects: 4, meshes: 2, meshesWithAsset: 1 },
  );
  assert.equal(sceneFootprint({}), undefined);
  assert.equal(sceneFootprint({ [SCENE_PATH]: "{bukan json" }), undefined);
  assert.equal(
    sceneFootprint({
      [SCENE_PATH]: JSON.stringify({ version: 2, objects: [] }),
    }),
    undefined,
  );
  // A roblox project without a scene yet must not claim one.
  assert.equal(
    projectFootprint(project({ kind: "roblox", files: {} })).scene,
    undefined,
  );
});

test("the continue line is the newest real message, trimmed and bounded", () => {
  assert.equal(continueLine(project()), "");
  assert.equal(
    continueLine(
      project({
        messages: [
          { id: "1", role: "user", content: "  ", mode: "Ask" } as any,
          {
            id: "2",
            role: "assistant",
            content: "Sudah selesai.\n\nBerikutnya: preview.",
          } as any,
        ],
      }),
    ),
    "Sudah selesai. Berikutnya: preview.",
  );
  const long = continueLine(
    project({
      messages: [
        { id: "1", role: "user", content: "a".repeat(200), mode: "Ask" } as any,
      ],
    }),
  );
  assert.equal(long.length, 69);
  assert.ok(long.endsWith("…"));
});

test("sizes are written the way a person reads them", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
});
