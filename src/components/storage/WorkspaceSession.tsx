import { useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useStore } from "../../lib/store";
import { SupabaseProjectRepository } from "../../lib/cloud/repository";
import { startWorkspaceSync } from "../../lib/cloud/sync";
import { scopeFor } from "../../lib/cloud/types";
/** Auth bootstrap lives outside routes so direct project URLs and OAuth
 * callbacks share the same verified session and account-specific data. */
export default function WorkspaceSession() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const scope = useStore((s) => scopeFor(s.user));
  const ready = useStore((s) => s.authReady);
  useEffect(() => {
    if (!supabase) {
      useStore.getState().setUser(null);
      useStore.getState().setAuthReady(true);
      return;
    }
    let alive = true;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (session?.user) {
        const u = session.user;
        useStore.getState().setUser({
          id: u.id,
          email: u.email || "",
          name: u.user_metadata?.name || u.email?.split("@")[0] || "Pembuat",
          demo: false,
        });
      } else useStore.getState().setUser(null);
      useStore.getState().setAuthReady(true);
      if (event === "PASSWORD_RECOVERY" && session)
        navigateRef.current("/reset-password", { replace: true });
    });
    // getSession is not used as authorization; every cloud RPC is protected by JWT/RLS.
    supabase.auth.getSession().catch(() => {
      if (alive) {
        useStore.getState().setUser(null);
        useStore.getState().setAuthReady(true);
        useStore
          .getState()
          .notify(
            "Sesi tidak dapat dimuat. Periksa koneksi autentikasi lalu masuk kembali.",
          );
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!ready || scope === "demo") return;
    if (!supabase) {
      useStore.getState().setConnection({
        phase: "error",
        error:
          "Supabase belum dikonfigurasi. Project akun ini belum tersinkron.",
      });
      return;
    }
    const sync = startWorkspaceSync(new SupabaseProjectRepository(supabase));
    const refresh = () => void sync.syncNow();
    // Authenticated Realtime invalidation triggers the existing serial,
    // revision-checked sync queue. RLS decides which changes are visible.
    const changes = supabase
      .channel("piwu:account-workspaces:" + scope)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_workspaces" },
        refresh,
      )
      .subscribe();
    const visibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const offline = () =>
      useStore.getState().setConnection({
        phase: "offline",
        error: "Koneksi terputus. Salinan lokal tetap tersedia.",
      });
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    window.addEventListener("piwu:sync-now", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      sync.stop();
      void supabase!.removeChannel(changes);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
      window.removeEventListener("piwu:sync-now", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [scope, ready]);
  return null;
}
