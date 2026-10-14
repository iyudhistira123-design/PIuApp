import { openDB } from "idb";
export interface ReplayEvent {
  time: number;
  label: string;
  files: Record<string, string>;
  message?: string;
}
export interface Recording {
  id: string;
  account: string;
  projectId: string;
  title: string;
  events: ReplayEvent[];
  createdAt: number;
}
async function db() {
  return openDB("piwu-recordings", 1, {
    upgrade(db) {
      db.createObjectStore("sessions", { keyPath: "id" });
    },
  });
}
export async function saveRecording(
  account: string,
  projectId: string,
  title: string,
  events: ReplayEvent[],
) {
  if (JSON.stringify(events).length > 4000000)
    throw new Error(
      "Rekaman melebihi 4 MB. Ekspor JSON atau rekam sesi lebih pendek.",
    );
  const value = {
    id: crypto.randomUUID(),
    account,
    projectId,
    title,
    events,
    createdAt: Date.now(),
  };
  await (await db()).put("sessions", value);
  return value;
}
export async function listRecordings(
  account: string,
  projectId: string,
): Promise<Recording[]> {
  return (await (await db()).getAll("sessions"))
    .filter((v) => v.account === account && v.projectId === projectId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteRecording(id: string) {
  await (await db()).delete("sessions", id);
}
