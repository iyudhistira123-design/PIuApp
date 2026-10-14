import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { starterFiles } from "../src/lib/templates.ts";
test("PostgreSQL migrations, transactional RPC, RLS and optimistic concurrency", async (t) => {
  const db = new PGlite();
  const [owner, editor, viewer, outsider] = Array.from({ length: 4 }, () =>
    crypto.randomUUID(),
  );
  const id = crypto.randomUUID();
  const p = {
    id,
    name: "Private studio",
    description: "A cloud project",
    template: "studio",
    files: starterFiles(),
    messages: [],
    versions: [],
    comments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(n text) returns text[] language sql immutable as $$select string_to_array(n,'/')$$;grant usage on schema public,auth,storage to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`,
  );
  // gen_random_uuid() is built into PostgreSQL. PGlite does not ship pgcrypto;
  // remove only the extension declaration, execute both migrations unchanged otherwise.
  await db.exec(
    readFileSync("supabase/001_schema.sql", "utf8").replace(
      "create extension if not exists pgcrypto;",
      "",
    ),
  );
  await db.exec(readFileSync("supabase/002_workspace_sync.sql", "utf8"));
  for (const uid of [owner, editor, viewer, outsider])
    await db.query("insert into auth.users(id) values ($1)", [uid]);
  async function as<T>(uid: string, fn: () => Promise<T>) {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    try {
      return await fn();
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub','',false)");
    }
  }
  const save = (payload: any, rev: number) =>
    db.query<any>("select * from public.piwu_save_workspace($1,$2::jsonb,$3)", [
      payload.id,
      JSON.stringify(payload),
      rev,
    ]);
  try {
    await t.test(
      "owner creates snapshot, mirrored files and memory atomically",
      async () => {
        const result = await as(owner, () => save(p, 0));
        assert.equal(result.rows[0].revision, 1);
        assert.equal(result.rows[0].owner_id, owner);
        assert.equal(result.rows[0].access_role, "Owner");
        assert.equal(
          (
            await db.query<any>(
              "select count(*)::int as count from public.project_files where project_id=$1",
              [id],
            )
          ).rows[0].count,
          Object.keys(p.files).length,
        );
        assert.equal(
          (
            await db.query<any>(
              "select content from public.project_memory where project_id=$1",
              [id],
            )
          ).rows[0].content,
          p.files["PIWU.md"],
        );
      },
    );
    await db.query(
      "insert into public.collaborators(project_id,user_id,role) values($1,$2,'Editor'),($1,$3,'Viewer')",
      [id, editor, viewer],
    );
    await t.test(
      "outsider sees no private projects through RPC or direct RLS query and cannot write",
      async () => {
        await as(outsider, async () => {
          assert.equal(
            (await db.query("select * from public.piwu_list_workspaces()")).rows
              .length,
            0,
          );
          assert.equal(
            (await db.query("select * from public.project_workspaces")).rows
              .length,
            0,
          );
          assert.equal(
            (await db.query("select * from public.project_files")).rows.length,
            0,
          );
          await assert.rejects(
            save({ ...p, name: "Stolen" }, 1),
            /PIWU_PERMISSION/,
          );
        });
      },
    );
    await t.test(
      "Viewer can read but cannot save, delete or escalate role",
      async () => {
        await as(viewer, async () => {
          const rows = await db.query<any>(
            "select * from public.piwu_list_workspaces()",
          );
          assert.equal(rows.rows[0].access_role, "Viewer");
          assert.equal(rows.rows[0].payload.name, p.name);
          await assert.rejects(save(p, 1), /PIWU_PERMISSION/);
          await assert.rejects(
            db.query("select public.piwu_delete_workspace($1,1)", [id]),
            /PIWU_PERMISSION/,
          );
          const changed = await db.query(
            "update public.collaborators set role='Editor' where project_id=$1 and user_id=$2",
            [id, viewer],
          );
          assert.equal(changed.affectedRows, 0);
        });
      },
    );
    await t.test(
      "Editor can save revision 2, but cannot delete or bypass revision via direct write",
      async () => {
        await as(editor, async () => {
          const saved = await save({ ...p, name: "Edited title" }, 1);
          assert.equal(saved.rows[0].revision, 2);
          assert.equal(saved.rows[0].owner_id, owner);
          await assert.rejects(
            db.query("select public.piwu_delete_workspace($1,2)", [id]),
            /PIWU_PERMISSION/,
          );
          await assert.rejects(
            db.query(
              "update public.project_files set content='bypass' where project_id=$1",
              [id],
            ),
            /permission denied/,
          );
        });
      },
    );
    await t.test(
      "stale save/delete fails without partial writes, current revision can save",
      async () => {
        await as(owner, async () => {
          await assert.rejects(
            save({ ...p, name: "stale" }, 1),
            /PIWU_CONFLICT/,
          );
          await assert.rejects(
            db.query("select public.piwu_delete_workspace($1,1)", [id]),
            /PIWU_CONFLICT/,
          );
          const before = await db.query<any>(
            "select * from public.piwu_list_workspaces()",
          );
          assert.equal(before.rows[0].payload.name, "Edited title");
          assert.equal(before.rows[0].revision, 2);
          const saved = await save({ ...p, name: "Latest title" }, 2);
          assert.equal(saved.rows[0].revision, 3);
        });
      },
    );
    await t.test(
      "tampered payload IDs, traversal, .env, keys and non-string files are rejected transactionally",
      async () => {
        await as(owner, async () => {
          for (const path of [
            "../escape",
            ".env",
            "src/.env.local",
            "/absolute",
            "src\\escape",
          ])
            await assert.rejects(
              save({ ...p, files: { [path]: "secret" } }, 3),
              /PIWU_INVALID/,
            );
          await assert.rejects(
            save({ ...p, files: { "src/a.ts": "sk-" + "x".repeat(24) } }, 3),
            /PIWU_INVALID/,
          );
          await assert.rejects(
            save({ ...p, files: { "src/a.ts": { nested: true } } }, 3),
            /PIWU_INVALID/,
          );
          await assert.rejects(
            db.query(
              "select * from public.piwu_save_workspace($1,$2::jsonb,3)",
              [id, JSON.stringify({ ...p, id: crypto.randomUUID() })],
            ),
            /PIWU_INVALID/,
          );
        });
        assert.equal(
          (
            await db.query<any>(
              "select revision from public.project_workspaces where project_id=$1",
              [id],
            )
          ).rows[0].revision,
          3,
        );
      },
    );
    await t.test(
      "credentials, billing and anonymous RPC access are denied",
      async () => {
        await as(owner, async () => {
          await assert.rejects(
            db.query("select * from public.env_vars"),
            /permission denied/,
          );
          await assert.rejects(
            db.query(
              "insert into public.usage(user_id,credits_used) values($1,0)",
              [owner],
            ),
            /row-level security/,
          );
        });
        await db.exec("set role anon");
        await assert.rejects(
          db.query("select * from public.piwu_list_workspaces()"),
          /permission denied/,
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "revoking membership immediately removes read access",
      async () => {
        await db.query("delete from public.collaborators where user_id=$1", [
          viewer,
        ]);
        await as(viewer, async () => {
          assert.equal(
            (await db.query("select * from public.piwu_list_workspaces()")).rows
              .length,
            0,
          );
          assert.equal(
            (await db.query("select * from public.project_workspaces")).rows
              .length,
            0,
          );
        });
      },
    );
    await t.test(
      "owner deletion cascades snapshot/files and is idempotent",
      async () => {
        await as(owner, async () => {
          await db.query("select public.piwu_delete_workspace($1,3)", [id]);
          await db.query("select public.piwu_delete_workspace($1,3)", [id]);
        });
        assert.equal(
          (await db.query("select * from public.project_workspaces")).rows
            .length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.project_files")).rows.length,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
