import test from "node:test";
import assert from "node:assert/strict";
import { useStore } from "../src/lib/store.ts";
import {
  emptyCache,
  scopeFor,
  RepositoryError,
} from "../src/lib/cloud/types.ts";
import type {
  CloudProject,
  ProjectRepository,
} from "../src/lib/cloud/types.ts";
import { reconcile, acknowledge } from "../src/lib/cloud/reconcile.ts";
import {
  persistedWorkspace,
  normalizePersisted,
} from "../src/lib/cloud/persistence.ts";
import { startWorkspaceSync } from "../src/lib/cloud/sync.ts";
import { projectSchema } from "../src/lib/cloud/schema.ts";
import type { Project, User } from "../src/lib/types.ts";
const a: User = {
  id: crypto.randomUUID(),
  name: "Akun A",
  email: "a@example.test",
  demo: false,
};
const b: User = {
  id: crypto.randomUUID(),
  name: "Akun B",
  email: "b@example.test",
  demo: false,
};
function reset() {
  useStore.setState({
    user: null,
    ...emptyCache(),
    workspaces: {},
    connection: { phase: "local" },
  });
}
function project(): Project {
  reset();
  const id = useStore.getState().createProject("Project pengujian");
  return structuredClone(
    useStore.getState().projects.find((p) => p.id === id)!,
  );
}
const row = (p: Project, revision = 1): CloudProject => ({
  project: structuredClone(p),
  revision,
  role: "Owner",
  ownerId: a.id,
  updatedAt: new Date().toISOString(),
});
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("demo, two accounts, logout, and persisted reload cannot mix active project lists", () => {
  reset();
  const s = useStore.getState();
  const demo = s.createProject("Project demo");
  s.savePrompt({ title: "Prompt demo", content: "demo", tags: "" });
  s.setUser(a);
  assert.equal(useStore.getState().projects.length, 0);
  assert.equal(useStore.getState().prompts.length, 0);
  const pa = s.createProject("Project A");
  s.savePrompt({ title: "Prompt A", content: "private", tags: "" });
  s.setUser(b);
  assert.equal(useStore.getState().projects.length, 0);
  const pb = s.createProject("Project B");
  const saved = persistedWorkspace(useStore.getState());
  assert.equal(saved.user, null);
  assert.deepEqual(
    saved.projects.map((p) => p.id),
    [demo],
  );
  assert.deepEqual(
    normalizePersisted(saved).projects?.map((p) => p.id),
    [demo],
  );
  s.setUser(a);
  assert.deepEqual(
    useStore.getState().projects.map((p) => p.id),
    [pa],
  );
  assert.equal(useStore.getState().prompts[0].title, "Prompt A");
  s.setUser(null);
  assert.deepEqual(
    useStore.getState().projects.map((p) => p.id),
    [demo],
  );
  s.setUser(b);
  assert.deepEqual(
    useStore.getState().projects.map((p) => p.id),
    [pb],
  );
});
test("legacy projects are preserved in demo and imports are explicit independent copies", () => {
  const p = project();
  const legacy = normalizePersisted({ projects: [p], prompts: [], user: null });
  assert.equal(legacy.workspaces?.demo.projects[0].id, p.id);
  useStore.getState().setUser(a);
  assert.equal(useStore.getState().projects.length, 0);
  assert.equal(useStore.getState().importDemoProjects([p.id]), 1);
  const imported = useStore.getState().projects[0];
  assert.notEqual(imported.id, p.id);
  assert.equal(useStore.getState().sync[imported.id].phase, "pending");
  useStore.getState().writeFile(imported.id, "src/App.tsx", "edited copy");
  assert.notEqual(
    useStore.getState().workspaces.demo.projects[0].files["src/App.tsx"],
    "edited copy",
  );
});
test("remote revisions cause conflicts, unchanged files reload cleanly, revoked synced entries disappear", () => {
  const p = project(),
    remote = row({ ...p, name: "From another device" }, 2);
  const cache = {
    ...emptyCache(),
    projects: [p],
    sync: {
      [p.id]: {
        revision: 1,
        role: "Owner" as const,
        phase: "pending" as const,
      },
    },
  };
  const result = reconcile(cache, [remote]);
  assert.equal(result.projects[0].name, p.name);
  assert.equal(result.sync[p.id].phase, "conflict");
  assert.equal(result.sync[p.id].remote?.project.name, remote.project.name);
  const clean = reconcile(
    { ...cache, sync: { [p.id]: { ...cache.sync[p.id], phase: "synced" } } },
    [remote],
  );
  assert.equal(clean.projects[0].name, remote.project.name);
  const revoked = reconcile(
    { ...cache, sync: { [p.id]: { ...cache.sync[p.id], phase: "synced" } } },
    [],
  );
  assert.equal(revoked.projects.length, 0);
  const dirtyRevoked = reconcile(cache, []);
  assert.equal(dirtyRevoked.sync[p.id].phase, "conflict");
  assert.equal(dirtyRevoked.sync[p.id].remote, null);
});
test("lost acknowledgement, key reordering, and edits in flight never lose changes", () => {
  const p = project();
  const sent = structuredClone(p);
  const newer = { ...p, name: "Edited while saving" };
  const cache = {
    ...emptyCache(),
    projects: [newer],
    sync: {
      [p.id]: { revision: 0, role: "Owner" as const, phase: "saving" as const },
    },
  };
  const ack = acknowledge(cache, sent, row(sent, 1));
  assert.equal(ack.projects[0].name, newer.name);
  assert.equal(ack.sync[p.id].phase, "pending");
  assert.equal(ack.sync[p.id].revision, 1);
  const reordered = {
    ...p,
    files: Object.fromEntries(Object.entries(p.files).reverse()),
  };
  const lostAck = reconcile({ ...cache, projects: [p] }, [row(reordered, 1)]);
  assert.equal(lostAck.sync[p.id].phase, "synced");
  const deleting = {
    ...emptyCache(),
    deleted: { [p.id]: { project: p, revision: 0 } },
  };
  assert.equal(acknowledge(deleting, p, row(p, 1)).deleted[p.id].revision, 1);
});
test("save-both conflict resolution preserves remote, creates local copy and never overwrites remote revision", () => {
  const p = project();
  useStore.getState().setUser(a);
  useStore.setState({
    projects: [p],
    sync: {
      [p.id]: {
        revision: 1,
        role: "Owner",
        phase: "conflict",
        remote: row({ ...p, name: "Cloud name" }, 2),
      },
    },
  });
  useStore.getState().resolveConflict(p.id, "fork");
  const s = useStore.getState();
  assert.equal(s.projects.length, 2);
  assert.equal(s.projects.find((x) => x.id === p.id)?.name, "Cloud name");
  assert.equal(s.sync[p.id].phase, "synced");
  const copy = s.projects.find((x) => x.id !== p.id)!;
  assert.equal(copy.files["src/App.tsx"], p.files["src/App.tsx"]);
  assert.equal(s.sync[copy.id].revision, 0);
});
test("Viewer cannot edit, add messages, or delete; duplicating creates an owned project", () => {
  const p = project();
  useStore.getState().setUser(a);
  useStore.setState({
    projects: [p],
    sync: { [p.id]: { revision: 1, role: "Viewer", phase: "synced" } },
  });
  const s = useStore.getState();
  s.writeFile(p.id, "src/App.tsx", "attack");
  assert.equal(
    useStore.getState().projects[0].files["src/App.tsx"],
    p.files["src/App.tsx"],
  );
  s.deleteProject(p.id);
  assert.equal(useStore.getState().projects.length, 1);
  s.addMessage(p.id, {
    id: "fake",
    role: "user",
    content: "edit",
    mode: "Builder",
    at: Date.now(),
  });
  assert.equal(useStore.getState().projects[0].messages.length, 0);
  const copy = s.duplicateProject(p.id);
  assert.equal(useStore.getState().sync[copy].role, "Owner");
});
test("session switch discards stale async pull responses and does not save to the new account", async () => {
  reset();
  useStore.getState().setUser(a);
  let release!: (r: CloudProject[]) => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  let saves = 0;
  const repository: ProjectRepository = {
    list: () => {
      entered();
      return new Promise((r) => (release = r));
    },
    save: async (p) => {
      saves++;
      return row(p);
    },
    delete: async () => {},
  };
  const sync = startWorkspaceSync(repository, {
    debounce: 0,
    interval: 600000,
  });
  try {
    const pending = sync.syncNow();
    await started;
    useStore.getState().setUser(b);
    const secret: Project = {
      id: crypto.randomUUID(),
      name: "Account A secret",
      description: "",
      template: "studio",
      files: {},
      messages: [],
      versions: [],
      comments: [],
      createdAt: 1,
      updatedAt: 1,
    };
    release([row(secret)]);
    await pending;
    assert.equal(useStore.getState().user?.id, b.id);
    assert.equal(useStore.getState().projects.length, 0);
    assert.equal(saves, 0);
  } finally {
    sync.stop();
  }
});
test("serial autosave acknowledges only sent data and retry restores offline edits", async () => {
  reset();
  useStore.getState().setUser(a);
  const id = useStore.getState().createProject("Cloud project");
  let cloud: CloudProject[] = [];
  let saving!: (r: CloudProject) => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  let fail = false;
  const repo: ProjectRepository = {
    list: async () => {
      if (fail) throw new RepositoryError("Offline");
      return cloud;
    },
    save: async (p) => {
      entered();
      return new Promise((r) => (saving = r));
    },
    delete: async () => {},
  };
  const sync = startWorkspaceSync(repo, { debounce: 1000, interval: 600000 });
  try {
    const run = sync.syncNow();
    await started;
    const sent = structuredClone(useStore.getState().projects[0]);
    useStore.getState().writeFile(id, "src/App.tsx", "new local edit");
    cloud = [row(sent, 1)];
    saving(cloud[0]);
    await run;
    assert.equal(
      useStore.getState().projects[0].files["src/App.tsx"],
      "new local edit",
    );
    assert.equal(useStore.getState().sync[id].phase, "pending");
    fail = true;
    await sync.syncNow();
    assert.equal(useStore.getState().connection.phase, "error");
    assert.equal(
      useStore.getState().projects[0].files["src/App.tsx"],
      "new local edit",
    );
  } finally {
    sync.stop();
  }
});
test("project schema rejects invalid file paths and malformed nested remote data", () => {
  const p = project();
  assert.ok(projectSchema.safeParse(p).success);
  assert.equal(
    projectSchema.safeParse({ ...p, files: { "../../escape": "bad" } }).success,
    false,
  );
  assert.equal(
    projectSchema.safeParse({ ...p, messages: [{ content: { bad: "shape" } }] })
      .success,
    false,
  );
  assert.equal(
    projectSchema.safeParse({ ...p, files: { ".env": "SECRET=value" } })
      .success,
    false,
  );
});

test("quota errors are visible without crashing or claiming a device save", async () => {
  const { workspaceStorage, useStorageHealth } =
    await import("../src/lib/local-storage.ts");
  const original = localStorage.setItem;
  localStorage.setItem = () => {
    throw new DOMException("Quota full", "QuotaExceededError");
  };
  try {
    assert.doesNotThrow(() => workspaceStorage.setItem("test", "payload"));
    assert.match(useStorageHealth.getState().error || "", /belum tersimpan/);
  } finally {
    localStorage.setItem = original;
  }
  workspaceStorage.setItem("test", "ok");
  assert.equal(useStorageHealth.getState().error, null);
  assert.equal(localStorage.getItem("test"), "ok");
  localStorage.removeItem("test");
});

test("pending cloud idea is bound to its project and cleared when switching accounts", () => {
  reset();
  const s = useStore.getState();
  s.setPending("Ide dari landing", "Plan");
  s.setUser(a);
  assert.equal(useStore.getState().pendingPrompt, "Ide dari landing");
  const id = s.createProject("Ide dari landing");
  assert.equal(useStore.getState().pendingProjectId, id);
  const saved = persistedWorkspace(useStore.getState());
  assert.equal(normalizePersisted(saved).pendingProjectId, id);
  s.setUser(b);
  assert.equal(useStore.getState().pendingPrompt, "");
  assert.equal(useStore.getState().pendingProjectId, "");
});
