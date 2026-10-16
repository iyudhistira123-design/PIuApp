import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useStore } from "../../lib/store";
import { scopeFor } from "../../lib/cloud/types";
import { exportAllProjectPhotos } from "../../services/project-photos";
import { BACKUP_VERSION, buildBackup } from "../../lib/dashboard/backup";

/** `piwuapp-cadangan-2026-10-16.json` */
export function backupFileName(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  return `piwuapp-cadangan-${date}.json`;
}

/**
 * The safety net for work that starts in this browser: one file with every
 * project, its history, and the photos stored for them.
 *
 * The download side is here; the restore side belongs to the dashboard because
 * it has to ask before writing anything (see the "restore" dialog).
 */
export default function BackupPanel({
  onRestore,
}: {
  onRestore: (text: string, bytes: number) => void;
}) {
  const store = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const demo = scopeFor(store.user) === "demo";

  async function download() {
    setBusy(true);
    setNote("");
    try {
      const account = scopeFor(store.user);
      let photos: Record<
        string,
        ReturnType<typeof buildBackup>["photos"][string]
      > = {};
      try {
        // Photos are a bonus: a browser that refuses IndexedDB still gets a
        // backup of the projects, and the note says what was left out.
        photos = await exportAllProjectPhotos(account);
      } catch {
        photos = {};
        setNote("Foto tidak bisa dibaca dari penyimpanan browser ini. ");
      }
      const backup = buildBackup(store.projects, photos);
      const text = JSON.stringify(backup);
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = backupFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      // The object URL is released on the next tick: Safari needs it alive when
      // the navigation starts.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const photosCount = Object.values(photos).reduce(
        (total, list) => total + list.length,
        0,
      );
      store.notify(
        `Cadangan diunduh: ${backup.projects.length} project · ${photosCount} foto · ${Math.round(text.length / 1024)} KB.`,
      );
    } catch (error) {
      store.notify(
        error instanceof Error
          ? `Cadangan gagal dibuat: ${error.message}`
          : "Cadangan gagal dibuat.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-backup">
      <span>CADANGAN v{BACKUP_VERSION}</span>
      <button
        className="button button-outline"
        disabled={busy || demo || !store.projects.length}
        onClick={() => void download()}
      >
        <Download size={12} /> {busy ? "Menyiapkan…" : "Unduh semua project"}
      </button>
      <button
        className="button button-outline"
        disabled={demo}
        onClick={() => input.current?.click()}
      >
        <Upload size={12} /> Pulihkan dari berkas
      </button>
      <small>
        Projects, riwayat, dan foto di browser ini. Pemuihan selalu menambah —
        tidak menimpa project yang ada.
      </small>
      {note && <small className="dashboard-backup-note">{note}</small>}
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        aria-label="Berkas cadangan PiwuApp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Let the same file be picked again after a failure.
          event.target.value = "";
          if (!file) return;
          void file.text().then((text) => onRestore(text, file.size));
        }}
      />
    </div>
  );
}
