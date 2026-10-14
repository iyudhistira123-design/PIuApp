import { api } from "../../services/api";
import { validateDataset } from "./schema";
import type { Dataset, DatasetMeta } from "./schema";
export interface DataRepository {
  list(): Promise<DatasetMeta[]>;
  get(id: string): Promise<Dataset>;
  save(table: Dataset): Promise<Dataset>;
  remove(id: string, revision: number): Promise<void>;
}
export function dataRepository(projectId: string): DataRepository {
  const base = "/projects/" + projectId + "/data";
  return {
    async list() {
      const d = await api<{ tables: DatasetMeta[] }>(
        base,
        undefined,
        "GET",
        AbortSignal.timeout(20000),
      );
      return d.tables;
    },
    async get(id) {
      const d = await api<{ table: unknown }>(
        base + "/" + id,
        undefined,
        "GET",
        AbortSignal.timeout(20000),
      );
      return validateDataset(d.table);
    },
    async save(input) {
      const { id, ...body } = validateDataset(input);
      const d = await api<{ table: unknown }>(
        base + "/" + id,
        body,
        "PUT",
        AbortSignal.timeout(30000),
      );
      return validateDataset(d.table);
    },
    async remove(id, revision) {
      await api(
        base + "/" + id,
        { revision },
        "DELETE",
        AbortSignal.timeout(20000),
      );
    },
  };
}
