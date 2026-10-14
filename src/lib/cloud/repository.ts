import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "../types";
import { cloudRowSchema, projectSchema } from "./schema";
import { RepositoryError } from "./types";
import type { CloudProject, ProjectRepository } from "./types";
export function repositoryError(error: {
  code?: string;
  message?: string;
}): RepositoryError {
  const message = error.message || "";
  if (message.includes("PIWU_CONFLICT") || error.code === "23505")
    return new RepositoryError(
      "Versi cloud berbeda. Tidak ada data yang ditimpa.",
      "conflict",
    );
  if (error.code === "42501" || message.includes("PIWU_PERMISSION"))
    return new RepositoryError(
      "Akses project tidak tersedia atau peran Anda tidak mengizinkan perubahan.",
      "permission",
    );
  if (
    error.code === "PGRST301" ||
    error.code === "28000" ||
    message.includes("PIWU_AUTH")
  )
    return new RepositoryError(
      "Sesi berakhir. Masuk kembali untuk menyinkronkan.",
      "auth",
    );
  if (
    ["PGRST202", "PGRST205", "42P01", "42703", "42883"].includes(
      error.code || "",
    )
  )
    return new RepositoryError(
      "Database cloud belum siap. Terapkan migration 001 dan 002 di project Supabase Anda.",
      "setup",
    );
  if (message.includes("PIWU_INVALID"))
    return new RepositoryError(
      "Project ditolak: periksa nama, struktur file, ukuran (maks. 8 MB), dan konten sensitif.",
      "invalid",
    );
  return new RepositoryError(
    "Sinkronisasi belum berhasil. Perubahan tetap ada di perangkat ini; periksa koneksi lalu coba lagi.",
    "network",
  );
}
function decode(row: unknown): CloudProject {
  const parsed = cloudRowSchema.safeParse(row);
  if (!parsed.success)
    throw new RepositoryError(
      "Format project cloud tidak valid. Unduh cadangan sebelum memperbaiki data atau migration.",
      "invalid",
    );
  const r = parsed.data;
  return {
    project: r.payload,
    revision: r.revision,
    role: r.access_role,
    ownerId: r.owner_id,
    updatedAt: r.updated_at,
  };
}
export class SupabaseProjectRepository implements ProjectRepository {
  constructor(private client: SupabaseClient) {}
  async list(signal?: AbortSignal) {
    const { data, error } = await this.client
      .rpc("piwu_list_workspaces")
      .abortSignal(signal || AbortSignal.timeout(20000));
    if (error) throw repositoryError(error);
    return (data || []).map(decode);
  }
  async save(project: Project, expectedRevision: number, signal?: AbortSignal) {
    if (!projectSchema.safeParse(project).success)
      throw new RepositoryError(
        "Struktur project tidak valid untuk sinkronisasi. Periksa file, panjang nama, atau ukuran riwayat.",
        "invalid",
      );
    const { data, error } = await this.client
      .rpc("piwu_save_workspace", {
        p_id: project.id,
        p_payload: project,
        p_expected_revision: expectedRevision,
      })
      .abortSignal(signal || AbortSignal.timeout(30000));
    if (error) throw repositoryError(error);
    if (!data?.[0])
      throw new RepositoryError("Server tidak mengonfirmasi penyimpanan.");
    return decode(data[0]);
  }
  async delete(id: string, expectedRevision: number, signal?: AbortSignal) {
    const { error } = await this.client
      .rpc("piwu_delete_workspace", {
        p_id: id,
        p_expected_revision: expectedRevision,
      })
      .abortSignal(signal || AbortSignal.timeout(20000));
    if (error) throw repositoryError(error);
  }
}
