import { useEffect, useState } from "react";
import { useStore } from "../../lib/store";
import { listRecordings, deleteRecording } from "../../services/recordings";
import type { Recording, ReplayEvent } from "../../services/recordings";
import { projectApi } from "../../services/api";
import ReplayPlayer from "./ReplayPlayer";
export default function RecordingPanel({
  projectId,
  events,
}: {
  projectId: string;
  events: ReplayEvent[];
}) {
  const user = useStore((s) => s.user),
    [rows, setRows] = useState<Recording[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [shareError, setShareError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [shares, setShares] = useState<any[]>([]);
  const refresh = () =>
    listRecordings(user?.id || "demo-user", projectId)
      .then(setRows)
      .catch(() => setError("IndexedDB tidak tersedia di browser ini."));
  useEffect(() => {
    setShares([]);
    setShareError("");
    let alive = true;
    void refresh();
    if (user && !user.demo)
      void projectApi(projectId, "recordings")
        .then((d) => {
          if (alive) setShares(d.recordings);
        })
        .catch(() => {
          if (alive)
            setShareError(
              "Daftar tautan cloud belum dapat dimuat. Rekaman lokal tetap dapat diputar; status berbagi belum terverifikasi.",
            );
        });
    return () => {
      alive = false;
    };
  }, [projectId, user?.id]);
  const active = rows.find((r) => r.id === selected),
    frames = active?.events || events;
  return (
    <section className="service-panel">
      {shareError && (
        <p className="service-notice" role="status">
          {shareError}
        </p>
      )}
      {error && (
        <div role="alert" className="service-error">
          {error}
        </div>
      )}
      {notice && <div className="service-notice">{notice}</div>}
      <label>
        Rekaman tersimpan
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Sesi saat ini</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} · {new Date(r.createdAt).toLocaleString("id-ID")}
            </option>
          ))}
        </select>
      </label>
      <ReplayPlayer events={frames} />
      <div className="service-actions">
        <button
          disabled={!frames.length}
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(
              new Blob([JSON.stringify(frames)], { type: "application/json" }),
            );
            a.download = "piwu-replay.json";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Ekspor JSON
        </button>
        {active && (
          <button
            onClick={() => {
              void deleteRecording(active.id)
                .then(() => {
                  setSelected("");
                  void refresh();
                })
                .catch(() =>
                  setError(
                    "Salinan lokal belum berhasil dihapus. Periksa izin penyimpanan browser.",
                  ),
                );
            }}
          >
            Hapus salinan lokal
          </button>
        )}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Saya sudah meninjau seluruh snapshot. Kode akan terlihat oleh siapa pun
        yang memiliki tautan selama 7 hari.
      </label>
      <button
        className="primary"
        disabled={busy || !confirmed || !frames.length || !user || user.demo}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const d = await projectApi(projectId, "recordings", {
              title: active?.title || "Sesi PiwuApp",
              events: frames,
              confirmPublic: true,
            });
            setNotice(d.url);
            setShares((await projectApi(projectId, "recordings")).recordings);
            setSelected("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal membagikan.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Buat tautan read-only
      </button>
      {shares.map((r) => (
        <div className="service-row" key={r.id}>
          <span>
            {r.title}
            <small>{new Date(r.created_at).toLocaleString("id-ID")}</small>
          </span>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await projectApi(
                  projectId,
                  "recordings/" + r.id + "/share",
                  undefined,
                  "DELETE",
                );
                setNotice("Tautan berbagi dicabut.");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Gagal mencabut.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Cabut tautan
          </button>
        </div>
      ))}
    </section>
  );
}
