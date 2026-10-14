import { openDB } from "idb";
import { validateDataset } from "./schema";
import type { Dataset } from "./schema";
const database = () =>
  (dbPromise ??= openDB("piwu-project-data", 1, {
    upgrade(db) {
      db.createObjectStore("drafts", { keyPath: "key" });
    },
  }));
let dbPromise: ReturnType<typeof openDB> | undefined;
const key = (account: string, project: string, id: string) =>
  `${account}:${project}:${id}`;
export async function saveDraft(
  account: string,
  project: string,
  table: Dataset,
) {
  const d = validateDataset(table);
  await (
    await database()
  ).put("drafts", {
    key: key(account, project, d.id),
    account,
    project,
    table: d,
    at: Date.now(),
  });
}
export async function dropDraft(account: string, project: string, id: string) {
  await (await database()).delete("drafts", key(account, project, id));
}
export async function listDrafts(
  account: string,
  project: string,
): Promise<Dataset[]> {
  const records = await (await database()).getAll("drafts");
  return records
    .filter((r) => r.account === account && r.project === project)
    .sort((a, b) => b.at - a.at)
    .flatMap((r) => {
      try {
        return [validateDataset(r.table)];
      } catch {
        return [];
      }
    });
}
