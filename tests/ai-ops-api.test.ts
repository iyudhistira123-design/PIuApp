import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.mjs";
import { SCENE_PATH } from "../server/lib/ai-ops.mjs";
import { defaultSite } from "../server/lib/platform.mjs";

// End-to-end proof that a reply carrying ops reaches the browser as an applied
// scene plus an honest report: the fake provider speaks the OpenAI-compatible
// SSE contract, everything else is the real route, auth and credit flow.
const ids = { member: "7f1c3d2e-1111-4222-8333-444455556666" };

const savedScene = (kind: string) =>
  JSON.stringify(
    {
      version: 1,
      objects: [
        {
          id: "obj-rumah",
          name: "Rumah",
          kind: "model",
          parent: null,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          size: [1, 1, 1],
          color: "#ffffff",
          anchored: true,
        },
        {
          id: "obj-atap",
          name: "Atap",
          kind: "block",
          parent: "obj-rumah",
          position: [0, 5, 0],
          rotation: [0, 0, 0],
          size: [10, 1, 10],
          color: "#aa0000",
          anchored: true,
        },
      ],
    },
    ...(kind === "text" ? [] : ([null, 2] as const)),
  );

function fixture({ kind = "roblox", reply }: { kind?: string; reply: any }) {
  const calls: string[] = [];
  const fetcher = async (input: any, init: any = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const path = url.pathname;
    if (path.endsWith("/chat/completions")) {
      calls.push("chat");
      const body = JSON.parse(init.body);
      calls.push("model:" + body.model);
      const content = JSON.stringify(reply);
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }
    calls.push(path);
    const json = (data: any, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (path === "/auth/v1/user")
      return json({
        id: ids.member,
        email: "member@example.test",
        email_confirmed_at: "2026-01-01",
        user_metadata: {},
      });
    if (path === "/rest/v1/projects")
      return json([
        {
          id: url.searchParams.get("id")?.replace("eq.", ""),
          owner_id: ids.member,
          name: "Project uji",
          kind,
        },
      ]);
    if (path === "/rest/v1/collaborators") return json([]);
    if (path === "/rest/v1/platform_project_controls") return json([]);
    if (path === "/rest/v1/platform_user_controls") return json([]);
    if (path === "/rest/v1/platform_admins") return json([]);
    if (path === "/rest/v1/site_configuration")
      return json([{ revision: 1, value: defaultSite }]);
    if (path === "/rest/v1/project_workspaces")
      return json({
        payload: {
          id: crypto.randomUUID(),
          kind,
          name: "Project uji",
          files: {},
        },
        revision: 1,
      });
    if (path.startsWith("/rest/v1/rpc/")) {
      calls.push("rpc:" + path.replace("/rest/v1/rpc/", ""));
      return json({ remaining: 27, balance: 27 });
    }
    throw new Error("Unexpected fixture query: " + path + url.search);
  };
  return { fetcher, calls };
}

async function run(options: { kind?: string; mode?: string; reply: any }) {
  const fx = fixture(options);
  const { app } = createApp({
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test",
      SUPABASE_SERVICE_ROLE_KEY: "server-test",
      LLM_BASE_URL: "https://provider.test/v1",
      LLM_API_KEY: "sk-test-placeholder-not-a-credential",
      LLM_MODEL: "deepseek-chat",
    },
    fetcher: fx.fetcher,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((ready) => server.once("listening", ready));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  const response = await fetch(
    url + "/api/projects/" + crypto.randomUUID() + "/ai",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer member",
      },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        prompt: "Geser atap dua stud ke kanan dan simpan proyek.",
        mode: options.mode || "Builder",
        model: "Otomatis",
        files: { [SCENE_PATH]: savedScene("text") },
      }),
    },
  );
  const text = await response.text();
  if (!response.ok && !text.startsWith("data:"))
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  server.close();
  const events = text
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
  return { status: response.status, events };
}

const resultOf = (events: any[]) =>
  events.find((e) => e.type === "result")?.result;

test("AI ops wiring: a transform batch reaches the browser as an applied scene and a report", async () => {
  const { status, events } = await run({
    kind: "roblox",
    reply: {
      content: "Atap digeser dua stud dan model diperbesar dua kali.",
      ops: [
        {
          kind: "scene.transform",
          ops: [
            { target: "obj-atap", move: [2, 0, 0], color: "#2857AA" },
            { target: "Rumah", scale: 2 },
          ],
        },
      ],
    },
  });
  assert.equal(status, 200);
  const result = resultOf(events);
  assert.equal(result.ops.sceneChanged, true);
  assert.equal(result.ops.applied.length, 2);
  const scene = JSON.parse(result.files[SCENE_PATH]);
  const atap = scene.objects.find((o: any) => o.id === "obj-atap");
  // Model scaling moves the child; the move/colour from the first op survives.
  assert.deepEqual(atap.position, [4, 10, 0]);
  assert.deepEqual(atap.size, [20, 2, 20]);
  assert.equal(atap.color, "#2857aa");
  assert.equal(scene.objects.find((o: any) => o.id === "obj-rumah").size[0], 1);
  // The streamed content and the report both reach the client.
  assert.match(result.content, /Atap digeser/);
  assert.equal(result.creditsUsed, 3);
  assert.match(result.ops.note, /Tinjau sebelum dipakai/);
  assert.ok(events.some((e) => e.type === "token"));
});

test("AI ops wiring: an invalid target is reported and writes no scene at all", async () => {
  const { events } = await run({
    kind: "roblox",
    reply: {
      content: "Saya perbesar pohon itu.",
      ops: [
        {
          kind: "scene.transform",
          ops: [
            { target: "obj-atap", move: [1, 0, 0] },
            { target: "Pohon", scale: 3 },
          ],
        },
      ],
    },
  });
  const result = resultOf(events);
  assert.equal(result.ops.sceneChanged, false);
  assert.deepEqual(result.ops.applied, []);
  assert.match(result.ops.rejected[0].reason, /tidak ditemukan/);
  assert.match(result.ops.note, /semua-atau-tidak/);
  // Nothing is written, so the browser keeps the scene it already had.
  assert.equal(result.files, undefined);
});

test("AI ops wiring: non-Roblox projects and non-Builder modes never touch a scene", async () => {
  const ops = [
    { kind: "scene.transform", ops: [{ target: "obj-atap", move: [1, 0, 0] }] },
  ];
  const webapp = await run({
    kind: "webapp",
    reply: { content: "Baik.", ops },
  });
  assert.match(
    resultOf(webapp.events).ops.rejected[0].reason,
    /hanya berlaku untuk project Roblox/,
  );
  assert.equal(resultOf(webapp.events).files, undefined);

  const ask = await run({
    kind: "roblox",
    mode: "Ask",
    reply: { content: "Atap ada di 0,5,0.", ops },
  });
  assert.equal(resultOf(ask.events).ops, undefined);
});

test("AI ops wiring: a broken ops payload fails the turn instead of half-applying", async () => {
  const { events } = await run({
    kind: "roblox",
    reply: {
      content: "Saya hapus semua objek.",
      ops: [{ kind: "scene.delete", ops: [{ target: "obj-atap" }] }],
    },
  });
  const error = events.find((e) => e.type === "error");
  assert.ok(error, "expected an error event");
  assert.match(error.message, /jenis operasi tidak didukung/);
  assert.equal(resultOf(events), undefined);
});
