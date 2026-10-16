/**
 * Browser storage for project photos. Kept beside the draft store, in its own
 * database so clearing drafts can never take a photo with it — and separate
 * from the synced project payload, because photos are not text and the payload
 * has a size ceiling shared by every account.
 */
import { openDB } from "idb";
import { fitPhotos, isStoredPhoto, photoKey } from "../lib/photo-assets";
import type { ProjectPhoto, ProjectPhotoMeta } from "../lib/photo-assets";

let dbPromise: ReturnType<typeof openDB> | undefined;
const database = () =>
  (dbPromise ??= openDB("piwu-project-photos", 1, {
    upgrade(db) {
      db.createObjectStore("photos", { keyPath: "key" });
    },
  }));

/** Strips the heavy `data` field: lists carry thumbnails, not full photos. */
const meta = (photo: ProjectPhoto): ProjectPhotoMeta => {
  const { data, key, ...rest } = photo;
  return rest;
};

export async function saveProjectPhotos(
  account: string,
  project: string,
  photos: Omit<ProjectPhoto, "key">[],
) {
  if (!photos.length) return { saved: 0, dropped: [] as ProjectPhotoMeta[] };
  const db = await database();
  const stored = (await db.getAll("photos"))
    .filter((record: any) => isStoredPhoto(record))
    .filter(
      (record: ProjectPhoto) =>
        record.key.startsWith(`${account}:${project}:`) &&
        !photos.some((photo) => photo.id === record.id),
    ) as ProjectPhoto[];
  const existing = stored.map(meta);
  const incoming = photos.map((photo) => ({
    ...meta({ ...photo, key: photoKey(account, project, photo.id) }),
  }));
  const { keep, dropped } = fitPhotos(existing, incoming);
  const keepIds = new Set(keep.map((photo) => photo.id));
  await Promise.all(
    dropped.map((photo) =>
      db.delete("photos", photoKey(account, project, photo.id)),
    ),
  );
  for (const photo of photos)
    if (keepIds.has(photo.id))
      await db.put("photos", {
        ...photo,
        key: photoKey(account, project, photo.id),
      });
  return {
    saved: photos.filter((photo) => keepIds.has(photo.id)).length,
    dropped,
  };
}

export async function listProjectPhotos(
  account: string,
  project: string,
): Promise<ProjectPhotoMeta[]> {
  const prefix = `${account}:${project}:`;
  const records = await (await database()).getAll("photos");
  return records
    .filter(
      (record: any) => isStoredPhoto(record) && record.key.startsWith(prefix),
    )
    .map((record: any) => meta(record as ProjectPhoto))
    .sort((a, b) => b.at - a.at);
}

/** The full photo, read only when it is really going to be used or shown. */
export async function readProjectPhoto(
  account: string,
  project: string,
  id: string,
): Promise<ProjectPhoto | null> {
  const record = await (
    await database()
  ).get("photos", photoKey(account, project, id));
  return isStoredPhoto(record) ? record : null;
}

export async function removeProjectPhoto(
  account: string,
  project: string,
  id: string,
) {
  await (await database()).delete("photos", photoKey(account, project, id));
}
