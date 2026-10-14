import { useStore } from "../lib/store";
import CloudDataPanel from "./CloudDataPanel";
export default function DatabasePanel({ projectId }: { projectId: string }) {
  const user = useStore((s) => s.user),
    sync = useStore((s) => s.sync[projectId]);
  if (!user || user.demo)
    return (
      <div className="database-panel" role="status">
        Masuk dengan akun terverifikasi untuk membuka database cloud. Tabel
        lokal tidak digunakan sebagai pengganti koneksi server.
      </div>
    );
  if (!sync?.revision)
    return (
      <div className="database-panel">
        <h2>Tabel data cloud</h2>
        <div className="ws-notice">
          Sinkronkan project ke cloud terlebih dahulu. Akun nyata tidak memakai
          tabel demo sebagai pengganti database.
        </div>
      </div>
    );
  return (
    <CloudDataPanel
      key={user.id + ":" + projectId}
      projectId={projectId}
      account={user.id}
      role={sync.role}
    />
  );
}
