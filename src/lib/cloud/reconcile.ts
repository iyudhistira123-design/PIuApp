import type { Project } from "../types";
import type { CloudProject, SyncEntry, WorkspaceCache } from "./types";
// Stable comparison, independent of Postgres JSONB key order. Acknowledgements
// must never overwrite edits that happened while a request was in flight.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const sameProject = (a: Project, b: Project) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export const synced = (remote: CloudProject): SyncEntry => ({
  revision: remote.revision,
  role: remote.role,
  phase: "synced",
  lastSyncedAt: Date.now(),
});
export function reconcile(
  cache: WorkspaceCache,
  remote: CloudProject[],
): WorkspaceCache {
  const projects: Project[] = [];
  const sync: Record<string, SyncEntry> = {};
  const cloud = new Map(remote.map((p) => [p.project.id, p]));
  for (const local of cache.projects) {
    const entry = cache.sync[local.id];
    const next = cloud.get(local.id);
    cloud.delete(local.id);
    if (next) {
      if (
        !entry ||
        entry.phase === "synced" ||
        sameProject(local, next.project)
      ) {
        projects.push(next.project);
        sync[local.id] = synced(next);
      } else if (
        entry.revision === next.revision &&
        entry.phase !== "conflict" &&
        next.role !== "Viewer"
      ) {
        projects.push(local);
        sync[local.id] = { ...entry, role: next.role };
      } else {
        projects.push(local);
        sync[local.id] = {
          ...entry,
          role: next.role,
          phase: "conflict",
          remote: next,
          error: "Versi cloud telah berubah. Pilih versi sebelum melanjutkan.",
        };
      }
    } else if (!entry || entry.revision === 0) {
      projects.push(local);
      sync[local.id] = entry || {
        phase: "pending",
        role: "Owner",
        revision: 0,
      };
    } else if (entry.phase !== "synced") {
      projects.push(local);
      sync[local.id] = {
        ...entry,
        phase: "conflict",
        remote: null,
        error:
          "Project dihapus atau akses cloud telah dicabut. Simpan salinan pribadi untuk mempertahankan edit lokal.",
      };
    }
    // Previously synced projects that disappeared from an authenticated list are
    // removed from this account's active cache. No silent resurrection.
  }
  for (const next of cloud.values()) {
    if (!cache.deleted[next.project.id]) {
      projects.push(next.project);
      sync[next.project.id] = synced(next);
    }
  }
  return {
    ...cache,
    projects: projects.sort((a, b) => b.updatedAt - a.updatedAt),
    sync,
  };
}
export function acknowledge(
  cache: WorkspaceCache,
  sent: Project,
  remote: CloudProject,
): WorkspaceCache {
  const current = cache.projects.find((p) => p.id === sent.id);
  if (!current) {
    const deletion = cache.deleted[sent.id];
    return deletion
      ? {
          ...cache,
          deleted: {
            ...cache.deleted,
            [sent.id]: { ...deletion, revision: remote.revision },
          },
        }
      : cache;
  }
  return {
    ...cache,
    sync: {
      ...cache.sync,
      [sent.id]: sameProject(current, sent)
        ? synced(remote)
        : { ...synced(remote), phase: "pending" },
    },
  };
}
