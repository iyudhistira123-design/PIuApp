import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { api } from "../../services/api";
import { useStore } from "../../lib/store";
import "./platform.css";
type Message = { id: string; title: string; body: string; read: boolean };
const PlatformContext = createContext<{
  settings: Record<string, any>;
  broadcasts: Message[];
  error: string;
  refresh: () => void;
  read: (id: string) => Promise<void>;
}>({
  settings: {},
  broadcasts: [],
  error: "",
  refresh: () => {},
  read: async () => {},
});
export const usePlatform = () => useContext(PlatformContext);
export function PlatformProvider({ children }: { children: ReactNode }) {
  const user = useStore((s) => s.user);
  const [state, setState] = useState({
    scope: user?.id,
    settings: {} as Record<string, any>,
    broadcasts: [] as Message[],
    error: "",
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let dead = false;
    const controller = new AbortController();
    setState({ scope: user?.id, settings: {}, broadcasts: [], error: "" });
    let inFlight = false;
    async function load() {
      if (inFlight || dead) return;
      inFlight = true;
      let publicData: {
        settings: Record<string, any>;
        broadcasts: Message[];
      } | null = null;
      let broadcasts: Message[] = [];
      let error = "";
      try {
        try {
          const data = await api<any>(
            "/public/site",
            undefined,
            "GET",
            AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]),
          );
          if (
            data &&
            typeof data.settings === "object" &&
            data.settings !== null &&
            !Array.isArray(data.settings) &&
            Array.isArray(data.broadcasts)
          ) {
            publicData = data;
            broadcasts = data.broadcasts;
          }
        } catch {
          // Landing content is optional. Preserve the last known public copy,
          // or use Landing's defaults, without a global failure/retry banner.
        }
        if (user && !user.demo && !dead) {
          try {
            const data = await api<{ broadcasts: Message[] }>(
              "/announcements",
              undefined,
              "GET",
              AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]),
            );
            if (!Array.isArray(data.broadcasts))
              throw new Error("Pengumuman member belum dapat dimuat.");
            broadcasts = data.broadcasts;
          } catch (e) {
            broadcasts = [];
            error =
              e instanceof Error
                ? e.message
                : "Pengumuman member belum dapat dimuat.";
          }
        }
        if (!dead)
          setState((previous) => ({
            scope: user?.id,
            settings: publicData?.settings ?? previous.settings,
            broadcasts,
            error,
          }));
      } finally {
        inFlight = false;
      }
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => {
      dead = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [user?.id, user?.demo, revision]);
  return (
    <PlatformContext.Provider
      value={{
        ...(state.scope === user?.id
          ? state
          : { settings: {}, broadcasts: [], error: "" }),
        refresh: () => setRevision((n) => n + 1),
        read: async (id) => {
          const account = useStore.getState().user?.id;
          await api("/announcements/" + id + "/read", {});
          if (account === useStore.getState().user?.id)
            setState((s) => ({
              ...s,
              broadcasts: s.broadcasts.map((b) =>
                b.id === id ? { ...b, read: true } : b,
              ),
            }));
        },
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}
export function PlatformNotices({
  showErrors = false,
}: {
  showErrors?: boolean;
}) {
  const { settings, broadcasts, error, refresh, read } = usePlatform();
  const user = useStore((s) => s.user);
  const [readError, setReadError] = useState(""),
    [busy, setBusy] = useState("");
  useEffect(() => {
    setReadError("");
    setBusy("");
  }, [user?.id]);
  return (
    <>
      {settings.maintenance && (
        <div className="platform-maintenance" role="status">
          {settings.maintenance_message}
        </div>
      )}
      {showErrors && error && (
        <div className="platform-announcements" role="status">
          {error} <button onClick={refresh}>Muat ulang informasi</button>
        </div>
      )}
      {broadcasts.length > 0 && (
        <details className="platform-announcements">
          <summary>
            Pengumuman PiwuApp · {broadcasts.length} pesan
            {user && !user.demo
              ? " · " +
                broadcasts.filter((b) => !b.read).length +
                " belum dibaca"
              : ""}
          </summary>
          {broadcasts.map((b) => (
            <article key={b.id}>
              <h3>{b.title}</h3>
              <p>{b.body}</p>
              {user && !user.demo && (
                <button
                  disabled={b.read || !!busy}
                  onClick={async () => {
                    setReadError("");
                    setBusy(b.id);
                    try {
                      await read(b.id);
                    } catch (e) {
                      setReadError(
                        e instanceof Error
                          ? e.message
                          : "Gagal menandai dibaca.",
                      );
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {b.read
                    ? "Sudah dibaca"
                    : busy === b.id
                      ? "Menyimpan…"
                      : "Tandai dibaca"}
                </button>
              )}
            </article>
          ))}
          {readError && <p role="alert">{readError}</p>}
        </details>
      )}
    </>
  );
}
export function AdminLink() {
  const user = useStore((s) => s.user);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let dead = false;
    setAllowed(false);
    if (user && !user.demo)
      api("/admin/session")
        .then(() => {
          if (!dead) setAllowed(true);
        })
        .catch(() => {});
    return () => {
      dead = true;
    };
  }, [user?.id, user?.demo]);
  return allowed ? (
    <Link className="sidebar-settings" to="/admin">
      <ShieldCheck size={16} />
      Administrasi
    </Link>
  ) : null;
}
