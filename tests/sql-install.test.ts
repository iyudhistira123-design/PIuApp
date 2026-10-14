import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
const sql = (name: string) => readFileSync("supabase/install/" + name, "utf8");
const bundle = () =>
  sql("INSTALL_NEW_DATABASE.sql").replace(
    "create extension if not exists pgcrypto;",
    "",
  );
const setup = async (db: PGlite) =>
  db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(n text) returns text[] language sql immutable as $$select string_to_array(n,'/')$$;
 grant usage on schema public,auth,storage to authenticated,anon,service_role;
 grant execute on function auth.uid() to authenticated,anon;
 alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
`);
// A failed explicit SQL transaction needs rollback before inspecting/retrying the same connection.
async function rejected(db: PGlite, text: string, pattern: RegExp) {
  await assert.rejects(db.exec(text), pattern);
  await db.exec("rollback");
}

test("SQL installer stays identical to the canonical migrations", () => {
  assert.match(
    execFileSync(
      process.execPath,
      ["scripts/build-sql-install.mjs", "--check"],
      { encoding: "utf8" },
    ),
    /sesuai/,
  );
  assert.equal(
    (sql("INSTALL_NEW_DATABASE.sql").match(/^begin;$/gm) || []).length,
    1,
  );
  assert.equal(
    (sql("INSTALL_NEW_DATABASE.sql").match(/^commit;$/gm) || []).length,
    1,
  );
});

test("fresh SQL bundle, read-only diagnostics and verified-only audited first-admin bootstrap", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    const before = await db.exec(sql("CHECK_INSTALLATION.sql"));
    assert.ok(
      before
        .flatMap((r) => r.rows as any[])
        .some((r) => r.status === "BELUM_LENGKAP"),
    );
    await db.exec(bundle());
    const after = await db.exec(sql("CHECK_INSTALLATION.sql"));
    const rows = after.flatMap((r) => r.rows as any[]).filter((r) => r.status);
    assert.ok(rows.length >= 68);
    assert.deepEqual(
      rows.filter((r) => !["OK", "MARKER_TERDETEKSI"].includes(r.status)),
      [],
    );
    await rejected(db, bundle(), /PIWU_EXISTING_DATABASE/);
    await rejected(db, sql("BOOTSTRAP_FIRST_ADMIN.sql"), /PIWU_EMAIL_REQUIRED/);
    const bootstrap = sql("BOOTSTRAP_FIRST_ADMIN.sql").replace(
      "GANTI_EMAIL_ADMIN_DI_SINI",
      "owner@example.test",
    );
    await rejected(db, bootstrap, /PIWU_VERIFIED_ACCOUNT_REQUIRED/);
    const id = crypto.randomUUID();
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      "owner@example.test",
    ]);
    await rejected(db, bootstrap, /PIWU_VERIFIED_ACCOUNT_REQUIRED/);
    await db.query(
      "update auth.users set email_confirmed_at=now(),is_anonymous=true where id=$1",
      [id],
    );
    await rejected(db, bootstrap, /PIWU_VERIFIED_ACCOUNT_REQUIRED/);
    await db.query("update auth.users set is_anonymous=false where id=$1", [
      id,
    ]);
    await db.query(
      "insert into platform_user_controls(user_id,suspended,reason) values($1,true,'test suspension')",
      [id],
    );
    await rejected(db, bootstrap, /PIWU_ACCOUNT_SUSPENDED/);
    await db.query("delete from platform_user_controls where user_id=$1", [id]);
    await db.exec(bootstrap);
    assert.deepEqual(
      (await db.query("select user_id,role from platform_admins")).rows,
      [{ user_id: id, role: "superadmin" }],
    );
    assert.equal(
      (
        await db.query(
          "select * from platform_audit where action='bootstrap_superadmin'",
        )
      ).rows.length,
      1,
    );
    await rejected(db, bootstrap, /PIWU_ADMIN_EXISTS/);
    assert.equal(
      (await db.query("select * from platform_admins")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from platform_audit")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});

test("fresh installer refuses namespace collisions and is atomic on late migration failure", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(
      "insert into storage.buckets(id,name,public) values('project-assets','Existing assets',true)",
    );
    await rejected(db, bundle(), /PIWU_EXISTING_BUCKET/);
    assert.equal(
      (await db.query("select to_regclass('public.projects') as id")).rows[0]
        .id,
      null,
    );
    await db.exec("delete from storage.buckets where id='project-assets'");
    // Deliberate syntax error late in this test copy, not in the delivered SQL.
    await rejected(
      db,
      bundle().replace(
        "notify pgrst, 'reload schema';",
        "select missing_test_function();",
      ),
      /missing_test_function/,
    );
    assert.equal(
      (await db.query("select to_regclass('public.projects') as id")).rows[0]
        .id,
      null,
    );
    assert.equal(
      (await db.query("select * from storage.buckets")).rows.length,
      0,
    );
    await db.exec(bundle());
    await db.exec(sql("CHECK_INSTALLATION.sql"));
  } finally {
    await db.close();
  }
});
