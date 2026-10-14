import type { Project, SavedPrompt, User } from "../types";
export type AccessRole = "Owner" | "Editor" | "Viewer";
export interface CloudProject {
  project: Project;
  revision: number;
  ownerId: string;
  role: AccessRole;
  updatedAt: string;
}
export type SyncPhase = "pending" | "saving" | "synced" | "error" | "conflict";
export interface SyncEntry {
  revision: number;
  role: AccessRole;
  phase: SyncPhase;
  lastSyncedAt?: number;
  error?: string;
  remote?: CloudProject | null;
}
export interface DeletedProject {
  project: Project;
  revision: number;
}
export interface WorkspaceCache {
  projects: Project[];
  prompts: SavedPrompt[];
  sync: Record<string, SyncEntry>;
  deleted: Record<string, DeletedProject>;
}
export type ConnectionPhase =
  "local" | "loading" | "ready" | "offline" | "error";
export interface Connection {
  phase: ConnectionPhase;
  error?: string;
  refreshedAt?: number;
}
export const scopeFor = (user: User | null) =>
  !user || user.demo ? "demo" : `account:${user.id}`;
export const emptyCache = (): WorkspaceCache => ({
  projects: [],
  prompts: [],
  sync: {},
  deleted: {},
});
export interface ProjectRepository {
  list(signal?: AbortSignal): Promise<CloudProject[]>;
  save(
    project: Project,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<CloudProject>;
  delete(
    id: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<void>;
}
export class RepositoryError extends Error {
  constructor(
    message: string,
    public code:
      | "conflict"
      | "auth"
      | "permission"
      | "setup"
      | "network"
      | "invalid" = "network",
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
