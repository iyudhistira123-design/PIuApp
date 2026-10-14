import test from "node:test";
import assert from "node:assert/strict";
import { starterFiles, templates } from "../src/lib/templates.ts";
import { transform } from "sucrase";
import { readFileSync } from "node:fs";
import { useStore } from "../src/lib/store.ts";

test("every template produces valid, self-contained React TSX with project memory", () => {
  for (const t of templates) {
    const files = starterFiles(t.id, t.name);
    assert.ok(files["PIWU.md"].includes("Bahasa Indonesia"));
    assert.ok(files["src/styles.css"].includes("@media"));
    assert.doesNotThrow(() =>
      transform(files["src/App.tsx"], {
        transforms: ["typescript", "jsx", "imports"],
      }),
    );
    assert.equal(
      JSON.parse(files["package.json"]).dependencies.react,
      "^19.0.0",
    );
  }
});
test("template names cannot inject JSX tags into App.tsx", () => {
  const files = starterFiles(
    "studio",
    "A </script><script>bad()</script> {bad}",
  );
  assert.doesNotThrow(() =>
    transform(files["src/App.tsx"], {
      transforms: ["typescript", "jsx", "imports"],
    }),
  );
  assert.ok(!files["src/App.tsx"].includes("<script>bad()"));
});
test("project creation, duplicate isolation, snapshot and restore work", () => {
  const s = useStore.getState();
  useStore.setState({ projects: [] });
  const id = s.createProject("Buat project test", "studio");
  const before = useStore.getState().projects.find((p) => p.id === id)!;
  const original = before.files["src/styles.css"];
  s.applyFiles(id, { "src/styles.css": "body { color: blue; }" }, "Ubah warna");
  let p = useStore.getState().projects.find((p) => p.id === id)!;
  assert.equal(p.files["src/styles.css"], "body { color: blue; }");
  assert.equal(p.versions.length, 2);
  s.restoreVersion(id, p.versions[1].id);
  p = useStore.getState().projects.find((p) => p.id === id)!;
  assert.equal(p.files["src/styles.css"], original);
  assert.equal(
    p.versions.at(-1)?.files["src/styles.css"],
    "body { color: blue; }",
  );
  const clone = s.duplicateProject(id);
  s.writeFile(clone, "src/styles.css", "changed clone");
  assert.equal(
    useStore.getState().projects.find((p) => p.id === id)!.files[
      "src/styles.css"
    ],
    original,
  );
  s.deleteProject(clone);
  assert.equal(useStore.getState().projects.length, 1);
});
test("every required data table has RLS enabled through explicit migration list", () => {
  const sql = readFileSync("supabase/001_schema.sql", "utf8");
  const tables = [
    "users",
    "projects",
    "project_files",
    "messages",
    "plans",
    "versions",
    "project_memory",
    "collaborators",
    "prompts",
    "model_settings",
    "comments",
    "session_recordings",
    "env_vars",
    "deployments",
    "analytics_events",
    "templates",
    "referrals",
    "subscriptions",
    "scan_reports",
    "usage",
  ];
  for (const table of tables) {
    assert.ok(sql.includes(`create table public.${table} (`));
    assert.ok(sql.includes(`'${table}'`));
  }
  assert.ok(sql.includes("enable row level security"));
  assert.ok(
    sql.includes("revoke all on public.env_vars from authenticated,anon"),
  );
});
test("preview isolation and provider auth fail-closed guards exist", () => {
  const workspace = readFileSync("src/pages/Workspace.tsx", "utf8");
  assert.ok(workspace.includes('sandbox="allow-scripts"'));
  assert.ok(!workspace.includes("allow-same-origin"));
  assert.ok(
    /e\.source\s*!==\s*previewRef\.current\?\.contentWindow/.test(workspace),
  );
  const api =
    readFileSync("server/lib/context.mjs", "utf8") +
    readFileSync("server/routes/ai.mjs", "utf8");
  assert.ok(api.includes("auth/v1/user"));
  assert.ok(/HttpError\(\s*401,/.test(api));
  assert.ok(api.includes("LLM_API_KEY"));
  const preview = readFileSync("src/lib/preview.ts", "utf8");
  assert.ok(preview.includes("connect-src 'none'"));
  assert.ok(preview.includes("form-action 'none'"));
});
