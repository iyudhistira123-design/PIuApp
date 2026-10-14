import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  emptyDataset,
  validateDataset,
  serializeDataset,
  importDataset,
} from "../src/lib/data/schema.ts";
import { datasetInput, datasetResult } from "../server/routes/data.mjs";

test("Dataset validation, typed values, reserved keys and export/import boundaries", () => {
  const d = emptyDataset("Produk");
  d.columns.push({ key: "harga", label: "Harga", type: "number" });
  d.rows = [
    { id: crypto.randomUUID(), values: { nama: "Kopi", harga: 25000 } },
  ];
  assert.equal(validateDataset(d).rows[0].values.harga, 25000);
  const imported = importDataset(serializeDataset(d));
  assert.notEqual(imported.id, d.id);
  assert.notEqual(imported.rows[0].id, d.rows[0].id);
  assert.equal(imported.revision, 0);
  assert.equal(imported.rows[0].values.nama, "Kopi");
  assert.throws(() =>
    validateDataset({ ...d, columns: [...d.columns, d.columns[0]] }),
  );
  assert.throws(() =>
    validateDataset({
      ...d,
      columns: [{ key: "constructor", label: "X", type: "text" }],
    }),
  );
  assert.throws(() =>
    validateDataset({
      ...d,
      rows: [{ id: crypto.randomUUID(), values: { harga: "bukan angka" } }],
    }),
  );
  assert.throws(() =>
    validateDataset({
      ...d,
      rows: [{ id: crypto.randomUUID(), values: { missing: true } }],
    }),
  );
  assert.throws(() => importDataset('{"format":"wrong"}'));
  const { id, ...body } = d;
  assert.ok(datasetInput.safeParse(body).success);
  assert.equal(
    datasetInput.safeParse({ ...body, owner_id: crypto.randomUUID() }).success,
    false,
  );
  assert.throws(
    () => datasetResult({ error: { message: "PIWU_DATA_CONFLICT" } }),
    (e) => (e as any).status === 409 && (e as any).code === "DATA_CONFLICT",
  );
});

test("PostgreSQL dataset RPC: all migrations, RLS, types, revisions, cross-project and delete", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(n text) returns text[] language sql immutable as $$select string_to_array(n,'/')$$;grant usage on schema public,auth,storage to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`,
    );
    for (const name of [
      "001_schema",
      "002_workspace_sync",
      "003_services",
      "004_project_data",
    ])
      await db.exec(
        readFileSync("supabase/" + name + ".sql", "utf8").replace(
          "create extension if not exists pgcrypto;",
          "",
        ),
      );
    const [owner, editor, viewer, outsider, p, q] = Array.from(
      { length: 6 },
      () => crypto.randomUUID(),
    );
    for (const id of [owner, editor, viewer, outsider])
      await db.query("insert into auth.users values($1)", [id]);
    await db.query(
      "insert into projects(id,owner_id,name) values($1,$3,'Satu'),($2,$3,'Dua')",
      [p, q, owner],
    );
    await db.query(
      "insert into collaborators(project_id,user_id,role) values($1,$2,'Editor'),($1,$3,'Viewer')",
      [p, editor, viewer],
    );
    async function as<T>(user: string, fn: () => Promise<T>) {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user,
      ]);
      try {
        return await fn();
      } finally {
        await db.exec("reset role");
        await db.query("select set_config('request.jwt.claim.sub','',false)");
      }
    }
    const d = emptyDataset("Produk");
    d.columns.push(
      { key: "harga", label: "Harga", type: "number" },
      { key: "aktif", label: "Aktif", type: "boolean" },
    );
    d.rows = [
      {
        id: crypto.randomUUID(),
        values: { nama: "Kopi", harga: 25000, aktif: true },
      },
    ];
    const save = (project = p, data = d) =>
      db.query<any>(
        "select * from piwu_save_dataset($1,$2,$3,$4::jsonb,$5::jsonb,$6)",
        [
          project,
          data.id,
          data.name,
          JSON.stringify(data.columns),
          JSON.stringify(data.rows),
          data.revision,
        ],
      );
    await t.test(
      "owner creates and editor updates with authenticated authorship",
      async () => {
        const first = await as(owner, () => save());
        assert.equal(first.rows[0].revision, 1);
        assert.equal(first.rows[0].created_by, owner);
        d.revision = 1;
        d.rows[0].values.harga = 26000;
        const next = await as(editor, () => save());
        assert.equal(next.rows[0].revision, 2);
        assert.equal(next.rows[0].updated_by, editor);
      },
    );
    await t.test(
      "stale writers/deletes rejected without data loss",
      async () => {
        await assert.rejects(
          as(owner, () => save()),
          /PIWU_DATA_CONFLICT/,
        );
        await assert.rejects(
          as(owner, () =>
            db.query("select piwu_delete_dataset($1,$2,1)", [p, d.id]),
          ),
          /PIWU_DATA_CONFLICT/,
        );
        const current = await db.query<any>(
          "select revision,rows from project_datasets where id=$1",
          [d.id],
        );
        assert.equal(current.rows[0].revision, 2);
        assert.equal(current.rows[0].rows[0].values.harga, 26000);
        d.revision = 2;
      },
    );
    await t.test(
      "Viewer is read-only, outsider cannot read, direct writes denied",
      async () => {
        await as(viewer, async () => {
          assert.equal(
            (await db.query("select * from project_datasets")).rows.length,
            1,
          );
          await assert.rejects(save(), /PIWU_DATA_FORBIDDEN/);
          await assert.rejects(
            db.query("delete from project_datasets"),
            /permission denied/,
          );
        });
        await as(outsider, async () => {
          assert.equal(
            (await db.query("select * from project_datasets")).rows.length,
            0,
          );
          await assert.rejects(save(), /PIWU_DATA_FORBIDDEN/);
        });
        await assert.rejects(
          as(owner, () =>
            db.query("update project_datasets set name='bypass'"),
          ),
          /permission denied/,
        );
        await assert.rejects(
          as(editor, () =>
            db.query("select piwu_delete_dataset($1,$2,2)", [p, d.id]),
          ),
          /PIWU_DATA_FORBIDDEN/,
        );
      },
    );
    await t.test(
      "database validates types/schema and prevents cross-project adoption",
      async () => {
        await assert.rejects(
          as(owner, () => save(q)),
          /PIWU_DATA_FORBIDDEN/,
        );
        const bad = {
          ...d,
          rows: [{ id: crypto.randomUUID(), values: { harga: "invalid" } }],
        } as any;
        await assert.rejects(
          as(editor, () => save(p, bad)),
          /PIWU_DATA_INVALID/,
        );
        await assert.rejects(
          as(editor, () =>
            save(p, { ...d, columns: [...d.columns, d.columns[0]] }),
          ),
          /PIWU_DATA_INVALID/,
        );
        await assert.rejects(
          as(editor, () => save(p, { ...d, rows: [d.rows[0], d.rows[0]] })),
          /PIWU_DATA_INVALID/,
        );
        await assert.rejects(
          as(editor, () =>
            save(p, {
              ...d,
              rows: [{ id: crypto.randomUUID(), values: { unlisted: "x" } }],
            }),
          ),
          /PIWU_DATA_INVALID/,
        );
        await assert.rejects(
          as(editor, () =>
            save(p, {
              ...d,
              rows: [
                { id: crypto.randomUUID(), values: { nama: "a".repeat(4001) } },
              ],
            }),
          ),
          /PIWU_DATA_INVALID/,
        );
        await assert.rejects(
          as(editor, () =>
            save(p, {
              ...d,
              rows: Array.from({ length: 1001 }, () => ({
                id: crypto.randomUUID(),
                values: {},
              })),
            }),
          ),
          /PIWU_DATA_LIMIT/,
        );
      },
    );
    await t.test(
      "revocation removes access; delete cannot be resurrected by a stale save",
      async () => {
        await db.query(
          "delete from collaborators where project_id=$1 and user_id=$2",
          [p, editor],
        );
        await assert.rejects(
          as(editor, () => save()),
          /PIWU_DATA_FORBIDDEN/,
        );
        await as(owner, () =>
          db.query("select piwu_delete_dataset($1,$2,2)", [p, d.id]),
        );
        await assert.rejects(
          as(owner, () => save()),
          /PIWU_DATA_CONFLICT/,
        );
        assert.equal(
          (await db.query("select * from project_datasets")).rows.length,
          0,
        );
      },
    );
    await t.test("project deletion cascades managed datasets", async () => {
      d.id = crypto.randomUUID();
      d.revision = 0;
      await as(owner, () => save());
      await db.query("delete from projects where id=$1", [p]);
      assert.equal(
        (await db.query("select * from project_datasets")).rows.length,
        0,
      );
    });
  } finally {
    await db.close();
  }
});

test("Data API routes use the caller JWT client and enforce Owner-only deletion", async () => {
  const { createApp } = await import("../server/app.mjs");
  const { HttpError } = await import("../server/lib/core.mjs");
  const id = crypto.randomUUID(),
    project = crypto.randomUUID();
  let single = false,
    operation = "";
  const row = { ...emptyDataset("Tes API"), id, revision: 1 };
  const context = {
    env: {},
    auth(req: any, res: any, next: any) {
      req.user = { id: crypto.randomUUID() };
      req.db = {
        rpc(name: string, params: any) {
          operation = name;
          assert.equal(params.p_project, project);
          assert.equal(params.p_id, id);
          assert.equal(Object.hasOwn(params, "p_user"), false);
          return {
            single: async () => {
              single = true;
              return { data: row, error: null };
            },
          };
        },
      };
      next();
    },
    project(minimum = "Viewer") {
      return (req: any, res: any, next: any) => {
        if (minimum === "Owner")
          return next(new HttpError(403, "Pemilik diperlukan."));
        req.project = { id: project };
        next();
      };
    },
  };
  const { app } = createApp({ env: {}, context });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const url =
    "http://127.0.0.1:" +
    (server.address() as any).port +
    "/api/projects/" +
    project +
    "/data/" +
    id;
  try {
    let response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: row.name,
        columns: row.columns,
        rows: row.rows,
        revision: 0,
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).table.id, id);
    assert.equal(operation, "piwu_save_dataset");
    assert.equal(single, true);
    response = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: '{"revision":1}',
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
