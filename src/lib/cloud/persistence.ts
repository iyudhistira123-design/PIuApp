import type { Project, SavedPrompt, User } from "../types";
import { emptyCache, scopeFor } from "./types";
import type { WorkspaceCache } from "./types";
export interface PersistedWorkspace {
  user: User | null;
  projects: Project[];
  prompts: SavedPrompt[];
  workspaces: Record<string, WorkspaceCache>;
  pendingPrompt: string;
  pendingProjectId?: string;
  pendingMode: "Builder" | "Plan";
  pendingKind?: "webapp" | "mobile" | "roblox";
}
// The root projects field is always the demo bucket, including while an account
// is active. On reload no account cache can appear before auth is verified.
export function persistedWorkspace(s: {
  user: User | null;
  projects: Project[];
  prompts: SavedPrompt[];
  sync: WorkspaceCache["sync"];
  deleted: WorkspaceCache["deleted"];
  workspaces: Record<string, WorkspaceCache>;
  pendingPrompt: string;
  pendingProjectId?: string;
  pendingMode: "Builder" | "Plan";
  pendingKind?: "webapp" | "mobile" | "roblox";
}): PersistedWorkspace {
  const current = {
    projects: s.projects,
    prompts: s.prompts,
    sync: s.sync,
    deleted: s.deleted,
  };
  const workspaces = { ...s.workspaces, [scopeFor(s.user)]: current };
  return {
    user: null,
    projects: workspaces.demo?.projects || [],
    prompts: workspaces.demo?.prompts || [],
    workspaces,
    pendingPrompt: s.pendingPrompt,
    pendingProjectId: s.pendingProjectId || "",
    pendingMode: s.pendingMode,
    pendingKind: s.pendingKind || "webapp",
  };
}
export function normalizePersisted(value: any): Partial<PersistedWorkspace> {
  if (!value || typeof value !== "object") return {};
  const demo = value.workspaces?.demo || {
    ...emptyCache(),
    projects: Array.isArray(value.projects) ? value.projects : [],
    prompts: Array.isArray(value.prompts) ? value.prompts : [],
  };
  return {
    user: null,
    projects: demo.projects,
    prompts: demo.prompts,
    workspaces: { ...value.workspaces, demo },
    pendingProjectId:
      typeof value.pendingProjectId === "string" ? value.pendingProjectId : "",
    pendingPrompt:
      typeof value.pendingPrompt === "string" ? value.pendingPrompt : "",
    pendingKind: ["mobile", "roblox"].includes(value.pendingKind)
      ? value.pendingKind
      : "webapp",
    pendingMode: value.pendingMode === "Plan" ? "Plan" : "Builder",
  };
}
