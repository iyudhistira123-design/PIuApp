import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LuauState } from "luau-web";
import { PGlite } from "@electric-sql/pglite";
import { projectFiles } from "../src/lib/project-kinds.ts";
import {
  sceneSchema,
  initialScene,
  newObject,
  deleteObject,
  meshOBJ,
  parseOBJ,
} from "../src/lib/roblox/scene.ts";
import {
  buildBundle,
  validateBundle,
  snapshotSchema,
} from "../shared/studio.mjs";
const base = () => ({
  version: 1 as const,
  snapshotId: crypto.randomUUID(),
  placeId: "123",
  nodes: [
    {
      id: "root",
      name: "ServerScriptService",
      className: "ServerScriptService",
      parentId: "",
      properties: {},
    },
    {
      id: "script",
      name: "Main",
      className: "Script",
      parentId: "root",
      properties: {},
      scriptPath: "ServerScriptService/Main.server.luau",
      source: "print('hello')",
      readable: true,
    },
  ],
});
test("three project targets have distinct executable source and no web/native impersonation", () => {
  const web = projectFiles("webapp", "studio", "Web"),
    mobile = projectFiles("mobile", "studio", "Mobile"),
    roblox = projectFiles("roblox", "studio", "Game");
  assert.ok(web["src/App.tsx"]);
  assert.ok(mobile["App.tsx"].includes("react-native"));
  assert.equal(JSON.parse(mobile["package.json"]).scripts.start, "expo start");
  assert.equal(mobile["src/App.tsx"], undefined);
  assert.ok(roblox["ServerScriptService/Main.server.luau"]);
  assert.equal(roblox["package.json"], undefined);
  assert.equal(
    sceneSchema.parse(JSON.parse(roblox["scene.roblox.json"])).objects.length,
    1,
  );
});
test("scene supports hierarchy and real mesh indices/export; cycles, invalid faces and nonfinite coordinates are rejected", () => {
  const scene = initialScene(),
    group = newObject("model"),
    child = { ...newObject("block"), parent: group.id };
  scene.objects.push(group, child);
  assert.equal(sceneSchema.parse(scene).objects.length, 3);
  assert.equal(deleteObject(scene, group.id).objects.length, 1);
  assert.throws(() =>
    sceneSchema.parse({ ...scene, objects: [{ ...group, parent: group.id }] }),
  );
  const mesh = parseOBJ("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3");
  assert.match(meshOBJ(mesh), /f 1 2 3/);
  assert.throws(() => parseOBJ("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9"));
  assert.throws(() =>
    sceneSchema.parse({
      version: 1,
      objects: [{ ...child, parent: null, position: [Infinity, 0, 0] }],
    }),
  );
});
test("Studio bundle supports explicit create/update/delete, rejects stale base, roots, protected classes, cycles and duplicate IDs", () => {
  const snapshot = base(),
    desired = structuredClone(snapshot);
  delete (desired.nodes[1] as any).source;
  let bundle = buildBundle(snapshot, desired, {
    "ServerScriptService/Main.server.luau": "print('updated')",
  });
  assert.equal(bundle.changes[0].op, "update");
  assert.doesNotThrow(() => validateBundle(snapshot, bundle));
  const created = {
    id: "folder",
    name: "Shared",
    className: "Folder",
    parentId: "root",
    properties: {},
  };
  desired.nodes.push(created as any);
  bundle = buildBundle(snapshot, desired, {
    "ServerScriptService/Main.server.luau": "print('hello')",
  });
  assert.equal(bundle.changes[0].op, "create");
  const removed = { ...snapshot, nodes: [snapshot.nodes[0]] };
  assert.equal(buildBundle(snapshot, removed, {}).changes[0].op, "delete");
  assert.throws(() =>
    buildBundle(snapshot, { ...removed, snapshotId: crypto.randomUUID() }, {}),
  );
  assert.throws(() => buildBundle(snapshot, { ...snapshot, nodes: [] }, {}));
  assert.throws(() =>
    snapshotSchema.parse({
      ...snapshot,
      nodes: [snapshot.nodes[0], snapshot.nodes[0]],
    }),
  );
  assert.throws(() =>
    validateBundle(snapshot, {
      ...bundle,
      changes: [
        { op: "update", node: { ...snapshot.nodes[0], name: "Hacked root" } },
      ],
    }),
  );
  assert.throws(() =>
    validateBundle(snapshot, {
      ...bundle,
      changes: [{ op: "create", node: { ...created, parentId: "folder" } }],
    }),
  );
  assert.throws(() =>
    snapshotSchema.parse({
      ...snapshot,
      nodes: [
        snapshot.nodes[0],
        { ...snapshot.nodes[1], scriptPath: "../secret.luau" },
      ],
    }),
  );
});
test("plugin and scaffold compile as Luau, not executed as Roblox; plugin never evaluates remote code", async () => {
  const state = await LuauState.createAsync();
  try {
    const plugin = fs.readFileSync("public/plugins/PiwuStudio.luau", "utf8");
    assert.equal(
      typeof state.loadstring(plugin, "PiwuStudio", true),
      "function",
    );
    assert.ok(!/loadstring\s*\(|require\s*\(/.test(plugin));
    assert.ok(plugin.includes("UpdateSourceAsync"));
    assert.ok(plugin.includes("FinishRecording"));
    assert.ok(!plugin.includes("SetSetting"));
    for (const [path, source] of Object.entries(
      projectFiles("roblox", "studio", "Test"),
    ))
      if (path.endsWith(".luau"))
        assert.equal(typeof state.loadstring(source, path, true), "function");
  } finally {
    state.destroy();
  }
});
test("bridge migration is server-only, tokens cannot be read or written by authenticated browser roles", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.projects(id uuid primary key);grant usage on schema public to anon,authenticated,service_role;",
    );
    await db.exec(fs.readFileSync("supabase/006_studio_bridge.sql", "utf8"));
    const id = crypto.randomUUID(),
      user = crypto.randomUUID();
    await db.query("insert into auth.users values($1)", [user]);
    await db.query("insert into public.projects values($1)", [id]);
    await db.exec("set role service_role");
    await db.query(
      "insert into studio_bridges(project_id,user_id,token_hash,expires_at) values($1,$2,'hashed-only',now()+interval '30 minutes')",
      [id, user],
    );
    await db.exec("reset role;set role authenticated");
    await assert.rejects(
      db.query("select * from studio_bridges"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from studio_bridges"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
