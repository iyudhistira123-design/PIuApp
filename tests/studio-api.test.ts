import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerStudio } from "../server/routes/studio.mjs";
import { hash, HttpError } from "../server/lib/core.mjs";
import { buildBundle } from "../shared/studio.mjs";
// Contract fixture for authenticated routes and server-side CAS. PostgreSQL
// privileges are tested separately. No real Studio/HTTP provider is implied.
function fixture() {
  const project = crypto.randomUUID(),
    user = crypto.randomUUID();
  let row: any = null,
    allowed = true,
    locked = false;
  const admin = {
    from: (name: string) => {
      let action = "select",
        value: any,
        filters: Record<string, any> = {};
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => {
          filters[k] = v;
          return q;
        },
        insert: (v: any) => {
          action = "insert";
          value = v;
          return q;
        },
        update: (v: any) => {
          action = "update";
          value = v;
          return q;
        },
        delete: () => {
          action = "delete";
          return q;
        },
        maybeSingle: () => q,
        single: () => q,
      };
      q.then = (resolve: any, reject: any) =>
        Promise.resolve()
          .then(() => {
            if (name === "projects")
              return {
                data: { owner_id: allowed ? user : crypto.randomUUID() },
                error: null,
              };
            if (name === "collaborators") return { data: null, error: null };
            if (name === "platform_user_controls")
              return { data: null, error: null };
            if (name === "platform_project_controls")
              return { data: { locked }, error: null };
            if (name === "site_configuration")
              return {
                data: { revision: 1, value: { maintenance: false } },
                error: null,
              };
            if (name !== "studio_bridges") throw Error(name);
            if (action === "insert") {
              row = structuredClone(value);
              return { data: structuredClone(row), error: null };
            }
            if (
              !row ||
              !Object.entries(filters).every(([k, v]) => row[k] === v)
            )
              return { data: null, error: null };
            if (action === "delete") row = null;
            if (action === "update")
              row = { ...row, ...structuredClone(value) };
            return { data: row ? structuredClone(row) : null, error: null };
          })
          .then(resolve, reject);
      return q;
    },
  };
  const ctx: any = {
    admin,
    needAdmin: () => admin,
    auth: (req: any, res: any, next: any) => {
      if (req.get("Authorization") !== "Bearer browser-test")
        return res.status(401).json({ error: "auth" });
      req.user = { id: user };
      next();
    },
    project: () => (req: any, res: any, next: any) => {
      if (!allowed) return res.status(403).json({ error: "role" });
      req.project = { id: project };
      next();
    },
    snapshot: async () => ({ payload: { kind: "roblox" } }),
  };
  return {
    ctx,
    project,
    user,
    get row() {
      return row;
    },
    deny: () => (allowed = false),
    lock: () => (locked = true),
    expire: () => (row.expires_at = new Date(0).toISOString()),
  };
}
test("Studio bridge: scoped hash token, no implicit apply, stale claim rejected, one claim/receipt, expiry and role/lock revocation", async () => {
  const f = fixture(),
    app = express();
  app.use(express.json());
  registerStudio(app, f.ctx);
  app.use((e: any, _req: any, res: any, _next: any) =>
    res
      .status(e instanceof HttpError ? e.status : 400)
      .json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  const browser = "/api/projects/" + f.project + "/studio";
  const request = (
    url: string,
    key: string,
    body?: any,
    method = body === undefined ? "GET" : "POST",
  ) =>
    fetch(base + url, {
      method,
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    assert.equal((await request(browser + "/connect", "bad", {})).status, 401);
    const connect = await request(browser + "/connect", "browser-test", {});
    assert.equal(connect.status, 200);
    const { token } = await connect.json();
    assert.equal(f.row.token_hash, hash(token));
    assert.ok(!JSON.stringify(f.row).includes(token));
    const snapshot = {
      version: 1,
      snapshotId: crypto.randomUUID(),
      placeId: "123",
      nodes: [
        {
          id: "root",
          parentId: "",
          name: "Workspace",
          className: "Workspace",
          properties: {},
        },
        {
          id: "part",
          parentId: "root",
          name: "Floor",
          className: "Part",
          properties: {},
        },
      ],
    };
    assert.equal(
      (await request("/api/studio/snapshot", token, snapshot)).status,
      200,
    );
    const desired = structuredClone(snapshot);
    desired.nodes[1].name = "Stage";
    const bundle = buildBundle(snapshot, desired, {});
    assert.equal(
      (await request(browser + "/send", "browser-test", bundle)).status,
      200,
    );
    assert.equal(f.row.state, "queued");
    const pending = await (await request("/api/studio/pending", token)).json();
    assert.equal(pending.bundle.id, bundle.id);
    const stale = structuredClone(snapshot);
    stale.nodes[1].name = "Changed in Studio";
    assert.equal(
      (
        await request("/api/studio/claim", token, {
          id: bundle.id,
          snapshot: stale,
        })
      ).status,
      409,
    );
    assert.equal(f.row.state, "queued");
    const claims = await Promise.all([
      request("/api/studio/claim", token, { id: bundle.id, snapshot }),
      request("/api/studio/claim", token, { id: bundle.id, snapshot }),
    ]);
    assert.deepEqual(claims.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (await request(browser + "/connect", "browser-test", {})).status,
      409,
    );
    assert.equal(
      (await request("/api/studio/ack", token, { id: bundle.id, ok: true }))
        .status,
      200,
    );
    assert.equal(f.row.state, "applied");
    assert.equal(
      (await request("/api/studio/ack", token, { id: bundle.id, ok: true }))
        .status,
      409,
    );
    const status = await (await request(browser, "browser-test")).json();
    assert.equal(status.receipt.ok, true);
    assert.equal(status.token_hash, undefined);
    f.lock();
    assert.equal((await request("/api/studio/pending", token)).status, 423);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test("Studio plugin token rejected after role revoked or expiry; anonymous cannot obtain project snapshots", async () => {
  const f = fixture(),
    app = express();
  app.use(express.json());
  registerStudio(app, f.ctx);
  app.use((e: any, _q: any, r: any, _n: any) =>
    r.status(e.status || 400).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const prefix = base + "/api/projects/" + f.project + "/studio";
    assert.equal((await fetch(prefix)).status, 401);
    const r = await fetch(prefix + "/connect", {
      method: "POST",
      headers: {
        Authorization: "Bearer browser-test",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const { token } = await r.json();
    f.deny();
    assert.equal(
      (
        await fetch(base + "/api/studio/pending", {
          headers: { Authorization: "Bearer " + token },
        })
      ).status,
      403,
    );
    f.expire();
    assert.equal(
      (
        await fetch(base + "/api/studio/pending", {
          headers: { Authorization: "Bearer " + token },
        })
      ).status,
      401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
