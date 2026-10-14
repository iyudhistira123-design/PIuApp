import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useStore } from "../../lib/store";
import { requestCloudSync } from "../../lib/cloud/sync";
export default function Presence({
  projectId,
  file,
}: {
  projectId: string;
  file: string;
}) {
  const user = useStore((s) => s.user);
  const [state, setState] = useState("");
  useEffect(() => {
    if (!supabase || !user || user.demo) return;
    let alive = true;
    const channel = supabase.channel("piwu:project:" + projectId, {
      config: { private: true, presence: { key: user.id } },
    });
    const changes = supabase
      .channel("piwu:workspace:" + projectId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_workspaces",
          filter: "project_id=eq." + projectId,
        },
        requestCloudSync,
      )
      .subscribe();
    channel
      .on("presence", { event: "sync" }, () => {
        if (alive)
          setState(
            Object.keys(channel.presenceState()).length + " hadir · realtime",
          );
      })
      .subscribe(async (status) => {
        if (!alive) return;
        if (status === "SUBSCRIBED")
          await channel.track({ file, at: Date.now() });
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setState("Realtime terputus · polling aktif");
      });
    return () => {
      alive = false;
      void supabase!.removeChannel(channel);
      void supabase!.removeChannel(changes);
    };
  }, [projectId, user?.id, file]);
  return state ? (
    <span
      className="presence-status"
      title="Presence bersifat indikatif, bukan identitas terverifikasi. Perubahan file menggunakan revisi dan deteksi konflik, bukan CRDT."
    >
      {state}
    </span>
  ) : null;
}
