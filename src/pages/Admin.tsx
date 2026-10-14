import { downloadText } from "../lib/download";
import { adminCSV } from "../lib/admin-csv";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  CreditCard,
  Store,
  Megaphone,
  Server,
  Settings,
  ShieldCheck,
  ScrollText,
  ArrowUpRight,
  RefreshCw,
  Plus,
  Search,
  ArrowLeft,
  CheckCircle2,
  LockKeyhole,
  Radio,
} from "lucide-react";
import { Logo, Modal } from "../components/ui";
import { useStore } from "../lib/store";
import { api } from "../services/api";
import "./admin.css";
const sections = [
  ["overview", "Ringkasan", LayoutDashboard],
  ["users", "Pengguna", Users],
  ["projects", "Project", FolderKanban],
  ["payments", "Transaksi & kredit", CreditCard],
  ["marketplace", "Marketplace", Store],
  ["broadcasts", "Broadcast", Megaphone],
  ["operations", "Operasional", Server],
  ["diagnostics", "Diagnostik", ShieldCheck],
  ["settings", "Pengaturan situs", Settings],
  ["roles", "Administrator", ShieldCheck],
  ["audit", "Audit log", ScrollText],
] as const;
type Section = (typeof sections)[number][0];
type Row = Record<string, any>;
const names: Record<string, string> = {
  superadmin: "Superadmin",
  operator: "Operator",
  auditor: "Auditor",
  published: "Tayang",
  draft: "Draf",
  archived: "Diarsipkan",
  public: "Publik",
  members: "Semua member",
  pro: "Member Pro",
  team: "Member Team",
  paid: "Lunas",
  pending: "Menunggu",
  created: "Dibuat",
  review: "Perlu ditinjau",
  refunded: "Dikembalikan",
  failed: "Gagal",
  ready: "Selesai",
  expired: "Kedaluwarsa",
  checkout_error: "Checkout gagal",
  queued: "Antrean",
  building: "Memproses",
  active: "Aktif",
  admin_role: "Perubahan peran",
  bootstrap_superadmin: "Aktivasi superadmin pertama",
  user_suspend: "Status akun",
  credits: "Penyesuaian kredit",
  project_lock: "Kunci project",
  project_delete: "Hapus project",
  template_status: "Moderasi template",
  recording_revoke: "Cabut tautan rekaman",
  publish_cancel: "Batalkan publish",
  hosting_retry: "Ulangi cleanup",
  unpublish: "Turunkan website",
  payment_reconcile: "Rekonsiliasi pembayaran",
  broadcast_save: "Simpan broadcast",
  settings: "Pengaturan situs",
};
const label = (v: string) => names[v] || v || "—";
const date = (v: string) =>
  v
    ? new Date(v).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const money = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);
const short = (v: string) => (v ? v.slice(0, 8) + "…" : "—");
const getAdmin = (path: string) => api<Row>("/admin/" + path);
function Badge({
  children,
  warn = false,
}: {
  children: ReactNode;
  warn?: boolean;
}) {
  return (
    <span className={"ad-badge " + (warn ? "ad-warning" : "")}>{children}</span>
  );
}
export default function Admin() {
  const user = useStore((s) => s.user);
  const [session, setSession] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let dead = false;
    setChecking(true);
    setError("");
    setSession(null);
    if (!user || user.demo) {
      setChecking(false);
      return;
    }
    getAdmin("session")
      .then((d) => {
        if (!dead) setSession(d);
      })
      .catch((e) => {
        if (!dead) setError(e.message);
      })
      .finally(() => {
        if (!dead) setChecking(false);
      });
    return () => {
      dead = true;
    };
  }, [user?.id, user?.demo, attempt]);
  if (checking || (session && session.userId !== user?.id))
    return (
      <div className="ad-gate" role="status">
        <ShieldCheck size={32} />
        <h1>Memverifikasi akses admin…</h1>
        <p>Peran diperiksa oleh server, bukan profil browser.</p>
      </div>
    );
  if (!session)
    return (
      <div className="ad-gate">
        <Logo />
        <div className="ad-gate-icon">
          <LockKeyhole size={32} />
        </div>
        <span className="ad-eyebrow">PUSAT KENDALI PIWUAPP</span>
        <h1>
          Ruang untuk mengelola
          <br />
          seluruh platform.
        </h1>
        <p>
          Pengguna, project, transaksi, dan komunikasi—dengan akses terbatas
          serta jejak audit yang jelas.
        </p>
        {error && (
          <p className="ad-error" role="alert">
            {error}
          </p>
        )}
        <div className="ad-gate-actions">
          {user && !user.demo ? (
            <button
              className="ad-primary"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Periksa akses kembali
            </button>
          ) : (
            <Link className="ad-primary" to="/login">
              Masuk dengan akun admin <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
        <small>
          Akses admin harus disetujui oleh server. Tidak ada panel simulasi.
        </small>
        <Link to="/projects" className="ad-back">
          <ArrowLeft size={14} /> Kembali ke workspace
        </Link>
      </div>
    );
  return <AdminPanel key={user?.id || "visitor"} session={session} />;
}
type AdminClient = (path: string, body?: unknown) => Promise<any>;
export function AdminPanel({
  session,
  client = api,
}: {
  session: Row | null;
  client?: AdminClient;
}) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Section = sections.some((s) => s[0] === raw)
    ? (raw as Section)
    : "overview";
  const [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [data, setData] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [actorFilter, setActorFilter] = useState(""),
    [since, setSince] = useState(""),
    [until, setUntil] = useState(""),
    [appliedQuery, setAppliedQuery] = useState(""),
    [command, setCommand] = useState<Row | null>(null),
    [editBroadcast, setEditBroadcast] = useState<Row | null>(null),
    [roleUser, setRoleUser] = useState(""),
    [newRole, setNewRole] = useState("auditor");
  const role = session?.role || "auditor",
    canWrite = ["superadmin", "operator"].includes(role),
    superadmin = role === "superadmin";
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setData(null);
    setError("");
    client("/admin/" + tab + "?page=" + page + appliedQuery)
      .then((d) => {
        if (!dead)
          setData({ ...d, _section: tab, _page: page, _query: appliedQuery });
      })
      .catch((e) => {
        if (!dead) setError(e.message);
      })
      .finally(() => {
        if (!dead) setLoading(false);
      });
    return () => {
      dead = true;
    };
  }, [tab, page, reload, appliedQuery, client]);
  const changeTab = (next: Section) => {
    setPage(1);
    setSearch("");
    setAppliedQuery("");
    setStatusFilter("");
    setActorFilter("");
    setSince("");
    setUntil("");
    setNotice("");
    setParams({ tab: next });
  };
  const ask = (
    action: string,
    target: string | null,
    payload: Row,
    detail: string,
  ) => setCommand({ action, target, payload, detail });
  const items: Row[] = data?.items || [];
  const title = sections.find((s) => s[0] === tab)![1];
  const act = (
    text: string,
    onClick: () => void,
    disabled = !canWrite,
    danger = false,
  ) => (
    <button
      className={"ad-action " + (danger ? "ad-danger" : "")}
      disabled={disabled}
      onClick={onClick}
    >
      {text}
    </button>
  );
  const table = (
    headers: string[],
    rows: Row[],
    render: (r: Row) => ReactNode,
  ) => (
    <div
      className="ad-table-wrap"
      role="region"
      aria-label={"Tabel " + headers.join(", ")}
      tabIndex={0}
    >
      <table className="ad-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || r.user_id || i}>{render(r)}</tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="ad-empty">
          <FolderKanban size={25} />
          <h3>{search ? "Tidak ada hasil pencarian" : "Belum ada data"}</h3>
          <p>
            {appliedQuery
              ? "Ubah kata kunci atau filter pencarian."
              : "Data akan muncul ketika tersedia di platform."}
          </p>
        </div>
      )}
    </div>
  );
  const broadcastStatus = (r: Row) =>
    r.status !== "published"
      ? label(r.status)
      : r.ends_at && Date.parse(r.ends_at) <= Date.now()
        ? "Berakhir"
        : Date.parse(r.starts_at) > Date.now()
          ? "Terjadwal"
          : "Sedang tayang";
  return (
    <div className="ad-shell">
      <a className="ad-skip" href="#admin-content">
        Lewati ke konten
      </a>
      <aside className="ad-sidebar">
        <Logo />
        <div className="ad-workspace">
          <span className="ad-workspace-icon">
            <ShieldCheck size={19} />
          </span>
          <div>
            <strong>Administrasi</strong>
            <small>Platform workspace</small>
          </div>
          <Badge>Internal</Badge>
        </div>
        <div className="ad-nav-label">KELOLA PLATFORM</div>
        <nav aria-label="Navigasi admin">
          {sections.map(([id, text, Icon], i) => (
            <button
              key={id}
              className={
                (tab === id ? "selected " : "") +
                (i === 7 ? "ad-nav-divider" : "")
              }
              aria-current={tab === id ? "page" : undefined}
              onClick={() => changeTab(id)}
            >
              <Icon size={18} />
              <span>{text}</span>
              {id === "broadcasts" && <span className="ad-nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="ad-sidebar-bottom">
          <Link to="/projects">
            <ArrowLeft size={15} /> Kembali ke workspace
          </Link>
          <div className="ad-profile">
            <div>{(session?.email?.[0] || "A").toUpperCase()}</div>
            <span>
              <strong>{label(role)}</strong>
              <small>{session?.email}</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="ad-main">
        <header className="ad-topbar">
          <span>
            Administrasi <span className="ad-slash">/</span> {title}
          </span>
          <div>
            <span className="ad-dot" />
            Akses terverifikasi
            <Link to="/" aria-label="Lihat website">
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </header>
        <main id="admin-content" className="ad-content">
          <div className="ad-heading">
            <div>
              <span className="ad-eyebrow">PUSAT KENDALI</span>
              <h1>{title}</h1>
              <p>
                {tab === "broadcasts"
                  ? "Sampaikan informasi yang tepat, kepada audiens yang tepat."
                  : tab === "overview"
                    ? "Satu tempat untuk memahami dan mengelola PiwuApp."
                    : "Kelola platform dengan kontrol akses dan perubahan yang tercatat."}
              </p>
            </div>
            <div className="ad-heading-actions">
              <button
                className="ad-secondary"
                disabled={loading}
                onClick={() => setReload((n) => n + 1)}
              >
                <RefreshCw size={15} className={loading ? "ad-spinning" : ""} />{" "}
                Muat ulang
              </button>
              {tab === "broadcasts" && (
                <button
                  className="ad-primary"
                  disabled={!canWrite}
                  onClick={() =>
                    setEditBroadcast({
                      id: crypto.randomUUID(),
                      title: "",
                      body: "",
                      audience: "public",
                      status: "draft",
                      starts_at: new Date().toISOString(),
                      ends_at: null,
                      revision: 0,
                    })
                  }
                >
                  <Plus size={16} /> Buat broadcast
                </button>
              )}
            </div>
          </div>
          {role === "auditor" && (
            <div className="ad-banner">
              Akses auditor: seluruh halaman hanya baca.
            </div>
          )}
          {notice && (
            <div className="ad-success" role="status">
              <CheckCircle2 size={18} />
              {notice}
            </div>
          )}
          {error && (
            <div className="ad-error" role="alert">
              {error}{" "}
              <button onClick={() => setReload((n) => n + 1)}>Coba lagi</button>
            </div>
          )}
          {[
            "users",
            "projects",
            "payments",
            "marketplace",
            "broadcasts",
            "roles",
            "audit",
          ].includes(tab) && (
            <form
              className="ad-filters"
              onSubmit={(e) => {
                e.preventDefault();
                const query = new URLSearchParams();
                for (const [k, v] of Object.entries({
                  q: search,
                  status: statusFilter,
                  actor: actorFilter,
                  since,
                  until,
                }))
                  if (v.trim()) query.set(k, v.trim());
                setPage(1);
                setAppliedQuery(query.size ? "&" + query.toString() : "");
              }}
            >
              <label>
                Cari di seluruh daftar
                <input
                  aria-label="Cari di seluruh daftar"
                  maxLength={100}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    tab === "users"
                      ? "Nama, email, atau ID akun"
                      : tab === "audit"
                        ? "Alasan atau ID audit"
                        : "Nama, judul, SKU, atau ID"
                  }
                />
              </label>
              {["payments", "marketplace", "broadcasts"].includes(tab) && (
                <label>
                  Filter status
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">Semua status</option>
                    {(tab === "payments"
                      ? [
                          "created",
                          "pending",
                          "checkout_error",
                          "review",
                          "paid",
                          "failed",
                          "expired",
                          "refunded",
                        ]
                      : tab === "marketplace"
                        ? ["draft", "published", "archived"]
                        : ["draft", "published", "archived"]
                    ).map((v) => (
                      <option key={v} value={v}>
                        {label(v)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {[
                "projects",
                "payments",
                "marketplace",
                "audit",
                "roles",
              ].includes(tab) && (
                <label>
                  ID pemilik / pelaku
                  <input
                    aria-label="ID pemilik atau pelaku"
                    value={actorFilter}
                    onChange={(e) => setActorFilter(e.target.value)}
                    placeholder="UUID (opsional)"
                  />
                </label>
              )}
              {tab !== "users" && (
                <>
                  <label>
                    Dari (UTC)
                    <input
                      type="date"
                      value={since}
                      onChange={(e) => setSince(e.target.value)}
                    />
                  </label>
                  <label>
                    Sampai (UTC)
                    <input
                      type="date"
                      min={since}
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                    />
                  </label>
                </>
              )}
              <button className="ad-primary" type="submit">
                Terapkan filter
              </button>
              <button
                className="ad-secondary"
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  setActorFilter("");
                  setSince("");
                  setUntil("");
                  setAppliedQuery("");
                  setPage(1);
                }}
              >
                Reset filter
              </button>
            </form>
          )}
          {loading ||
          (data &&
            (data._section !== tab ||
              data._page !== page ||
              data._query !== appliedQuery)) ? (
            <div className="ad-loading" role="status">
              <RefreshCw size={22} className="ad-spinning" /> Memuat{" "}
              {title.toLowerCase()}…
            </div>
          ) : (
            data && (
              <>
                {tab === "overview" ? (
                  <>
                    <div className="ad-metrics">
                      {[
                        ["projects", "Total project", FolderKanban],
                        ["pending", "Transaksi perlu perhatian", CreditCard],
                        ["templates", "Template tayang", Store],
                        ["broadcasts", "Broadcast dipublikasikan", Megaphone],
                      ].map(([key, text, Icon]: any) => (
                        <div className="ad-metric" key={key}>
                          <div>
                            <span>{text}</span>
                            <Icon size={18} />
                          </div>
                          <strong>{data.metrics[key] ?? "—"}</strong>
                          <small>Data platform saat ini</small>
                        </div>
                      ))}
                    </div>
                    <div className="ad-overview-grid">
                      <section className="ad-card">
                        <div className="ad-card-heading">
                          <div>
                            <h2>Aktivitas administrasi</h2>
                            <p>Perubahan terbaru, dengan jejak yang jelas.</p>
                          </div>
                          <button
                            className="ad-action"
                            onClick={() => changeTab("audit")}
                          >
                            Lihat audit log <ArrowUpRight size={14} />
                          </button>
                        </div>
                        {data.recent.length ? (
                          data.recent.map((r: Row) => (
                            <div className="ad-activity" key={r.id}>
                              <ScrollText size={18} />
                              <div>
                                <strong>{label(r.action)}</strong>
                                <p>{r.reason}</p>
                                <small>
                                  {date(r.created_at)} · {short(r.actor_id)}
                                </small>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="ad-empty">
                            <ScrollText size={28} />
                            <h3>Jejak perubahan dimulai di sini</h3>
                            <p>
                              Belum ada tindakan administrator yang dicatat.
                            </p>
                          </div>
                        )}
                      </section>
                      <section className="ad-card ad-communication">
                        <div className="ad-icon-tile">
                          <Megaphone size={24} />
                        </div>
                        <span className="ad-eyebrow">KOMUNIKASI PLATFORM</span>
                        <h2>
                          Kabar penting.
                          <br />
                          Tersampaikan dengan jelas.
                        </h2>
                        <p>
                          Buat pengumuman in-app, pilih segmen member, lalu atur
                          kapan pesan mulai dan selesai tayang.
                        </p>
                        <button
                          className="ad-primary"
                          onClick={() => changeTab("broadcasts")}
                        >
                          Kelola broadcast <ArrowUpRight size={16} />
                        </button>
                        <div className="ad-note">
                          <Radio size={15} /> Kanal in-app · tanpa pengiriman
                          email/WhatsApp
                        </div>
                      </section>
                    </div>
                    <section className="ad-card ad-safety">
                      <ShieldCheck size={24} />
                      <div>
                        <h2>Kontrol yang dapat dipertanggungjawabkan</h2>
                        <p>
                          Peran diperiksa server. Setiap tindakan membutuhkan
                          alasan. Transaksi diverifikasi ke provider, bukan
                          ditandai lunas secara manual.
                        </p>
                      </div>
                      <Badge>{label(role)}</Badge>
                    </section>
                  </>
                ) : null}
                {[
                  "users",
                  "projects",
                  "payments",
                  "marketplace",
                  "broadcasts",
                  "roles",
                  "audit",
                ].includes(tab) && (
                  <div className="ad-list-bar">
                    <div>
                      <h2>
                        {tab === "broadcasts" ? "Daftar broadcast" : title}
                      </h2>
                      <small>Halaman {page} · maksimal 25 data</small>
                    </div>
                    <button
                      className="ad-secondary"
                      disabled={!items.length}
                      onClick={() =>
                        downloadText(
                          `piwu-${tab}-halaman-${page}.csv`,
                          adminCSV(items),
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      Ekspor halaman CSV
                    </button>
                  </div>
                )}

                {tab === "diagnostics" && (
                  <section className="ad-card">
                    <h2>Kesehatan layanan dan koordinasi server</h2>
                    <p>{data.notice}</p>
                    <p>Terakhir diperiksa: {date(data.readiness?.checkedAt)}</p>
                    <div className="ad-service-grid">
                      {Object.entries(data.readiness || {})
                        .filter(
                          ([k]) =>
                            !["checkedAt", "mode", "paymentMode"].includes(k),
                        )
                        .map(([k, v]) => (
                          <div key={k}>
                            <strong>
                              {(
                                {
                                  auth: "Autentikasi",
                                  database: "Database",
                                  datasets: "Dataset",
                                  administration: "Administrasi",
                                  studio: "Studio",
                                  ai: "AI",
                                  sandbox: "Sandbox",
                                  publish: "Publish",
                                  payments: "Pembayaran",
                                  whatsapp: "WhatsApp",
                                  secrets: "Enkripsi secrets",
                                } as Row
                              )[k] || k}
                            </strong>
                            <Badge warn={v !== "reachable"}>
                              {(
                                {
                                  reachable: "Terjangkau",
                                  not_configured: "Belum dikonfigurasi",
                                  configured_unverified:
                                    "Dikonfigurasi, belum diuji",
                                  schema_missing: "Skema belum tersedia",
                                  unreachable: "Tidak terjangkau",
                                  rejected: "Ditolak",
                                } as Row
                              )[String(v)] || String(v)}
                            </Badge>
                          </div>
                        ))}
                    </div>
                    <dl>
                      <dt>Pembatas permintaan</dt>
                      <dd>
                        {data.runtime?.rateLimitMode === "database"
                          ? "PostgreSQL bersama"
                          : "Memori satu proses — bukan mode produksi"}
                      </dd>
                      <dt>Skema koordinasi</dt>
                      <dd>
                        {data.runtime?.coordinationSchema === "reachable"
                          ? "Terjangkau (marker, bukan uji seluruh RPC)"
                          : "Belum terverifikasi — periksa migration 007"}
                      </dd>
                      <dt>Routing sandbox</dt>
                      <dd>
                        {data.runtime?.sandboxRouting === "sticky-owner-lease"
                          ? "Sesi tetap ke server pemilik; lease dan kuota bersama"
                          : "Lokal satu proses"}
                      </dd>
                    </dl>
                    <button
                      className="ad-secondary"
                      onClick={() => {
                        const { _section, _page, _query, ...report } = data;
                        downloadText(
                          "piwu-diagnostik.json",
                          JSON.stringify(report, null, 2),
                        );
                      }}
                    >
                      Unduh laporan diagnostik
                    </button>
                  </section>
                )}
                {tab === "users" &&
                  table(
                    ["Pengguna", "Kredit", "Status", "Peran", "Tindakan"],
                    items,
                    (r) => (
                      <>
                        <td>
                          <strong>{r.name || r.email || short(r.id)}</strong>
                          <small>{r.email}</small>
                          <code title={r.id}>{r.id}</code>
                        </td>
                        <td>{r.balance ?? "Belum dibuat"}</td>
                        <td>
                          <Badge warn={r.suspended}>
                            {r.suspended ? "Ditangguhkan" : "Aktif"}
                          </Badge>
                          <small>
                            {r.verified
                              ? "Terverifikasi"
                              : "Belum terverifikasi"}
                          </small>
                        </td>
                        <td>{label(r.admin_role)}</td>
                        <td>
                          <div className="ad-actions">
                            {act(
                              "Sesuaikan kredit",
                              () => ask("credits", r.id, { delta: 0 }, r.email),
                              !superadmin,
                            )}
                            {act(
                              r.suspended ? "Aktifkan akun" : "Tangguhkan",
                              () =>
                                ask(
                                  "user_suspend",
                                  r.id,
                                  { suspended: !r.suspended },
                                  r.email,
                                ),
                              !superadmin || !!r.admin_role,
                              true,
                            )}
                            {act(
                              "Kelola peran",
                              () => {
                                setRoleUser(r.id);
                                changeTab("roles");
                              },
                              !superadmin,
                            )}
                          </div>
                        </td>
                      </>
                    ),
                  )}
                {tab === "projects" &&
                  table(
                    ["Project", "Pemilik", "Status", "Diperbarui", "Tindakan"],
                    items,
                    (r) => (
                      <>
                        <td>
                          <strong>{r.name}</strong>
                          <code>{r.id}</code>
                        </td>
                        <td>
                          <code title={r.owner_id}>{short(r.owner_id)}</code>
                        </td>
                        <td>
                          <Badge warn={r.locked}>
                            {r.locked ? "Dikunci" : "Aktif"}
                          </Badge>
                        </td>
                        <td>{date(r.updated_at)}</td>
                        <td>
                          <div className="ad-actions">
                            {act(r.locked ? "Buka kunci" : "Kunci", () =>
                              ask(
                                "project_lock",
                                r.id,
                                { locked: !r.locked },
                                r.name,
                              ),
                            )}
                            {act(
                              "Turunkan website",
                              () => ask("unpublish", r.id, {}, r.name),
                              !canWrite,
                              true,
                            )}
                            {act(
                              "Hapus project",
                              () =>
                                ask(
                                  "project_delete",
                                  r.id,
                                  { confirmation: "" },
                                  r.name,
                                ),
                              !superadmin,
                              true,
                            )}
                          </div>
                        </td>
                      </>
                    ),
                  )}
                {tab === "payments" && (
                  <>
                    <div className="ad-info">
                      Rekonsiliasi membaca status pembayaran langsung dari
                      provider. Panel ini tidak membuat pengembalian dana atau
                      pencairan dana penjual.
                    </div>
                    {table(
                      [
                        "Transaksi",
                        "Pengguna",
                        "Nominal",
                        "Status",
                        "Tindakan",
                      ],
                      items,
                      (r) => (
                        <>
                          <td>
                            <strong>{r.sku}</strong>
                            <code>{r.id}</code>
                            <small>
                              {r.provider} · {date(r.created_at)}
                            </small>
                          </td>
                          <td>
                            <code title={r.user_id}>{short(r.user_id)}</code>
                          </td>
                          <td>{money(r.amount)}</td>
                          <td>
                            <Badge
                              warn={!["paid", "refunded"].includes(r.status)}
                            >
                              {label(r.status)}
                            </Badge>
                          </td>
                          <td>
                            {act("Rekonsiliasi", () =>
                              ask(
                                "payment_reconcile",
                                r.id,
                                {},
                                r.sku + " · " + money(r.amount),
                              ),
                            )}
                          </td>
                        </>
                      ),
                    )}
                  </>
                )}
                {tab === "marketplace" &&
                  table(
                    ["Template", "Penjual", "Harga", "Status", "Tindakan"],
                    items,
                    (r) => (
                      <>
                        <td>
                          <strong>{r.title}</strong>
                          <small>{r.category}</small>
                          <code>{r.id}</code>
                        </td>
                        <td>
                          <code title={r.owner_id}>{short(r.owner_id)}</code>
                        </td>
                        <td>{money(r.price)}</td>
                        <td>
                          <Badge>{label(r.status)}</Badge>
                        </td>
                        <td>
                          {act(
                            r.status === "published" ? "Arsipkan" : "Tayangkan",
                            () =>
                              ask(
                                "template_status",
                                r.id,
                                {
                                  status:
                                    r.status === "published"
                                      ? "archived"
                                      : "published",
                                },
                                r.title,
                              ),
                          )}
                        </td>
                      </>
                    ),
                  )}
                {tab === "broadcasts" && (
                  <>
                    <div className="ad-channel-bar">
                      <span>
                        <Radio size={17} /> Pengumuman in-app
                      </span>
                      <p>
                        Jadwal mengikuti waktu lokal perangkat. “Dibaca”
                        dihitung dari konfirmasi member, bukan jangkauan
                        pengiriman.
                      </p>
                    </div>
                    {table(
                      [
                        "Pengumuman",
                        "Audiens",
                        "Status",
                        "Jadwal mulai",
                        "Dibaca",
                        "Tindakan",
                      ],
                      items,
                      (r) => (
                        <>
                          <td>
                            <strong>{r.title}</strong>
                            <p className="ad-excerpt">{r.body}</p>
                          </td>
                          <td>{label(r.audience)}</td>
                          <td>
                            <Badge warn={r.status === "draft"}>
                              {broadcastStatus(r)}
                            </Badge>
                          </td>
                          <td>
                            {date(r.starts_at)}
                            <small>
                              {r.ends_at
                                ? "Sampai " + date(r.ends_at)
                                : "Tanpa batas waktu"}
                            </small>
                          </td>
                          <td>{r.read_count ?? 0} member</td>
                          <td>
                            {act(
                              canWrite ? "Sunting" : "Lihat isi",
                              () => setEditBroadcast(r),
                              false,
                            )}
                          </td>
                        </>
                      ),
                    )}
                  </>
                )}
                {tab === "roles" && (
                  <>
                    <div className="ad-info">
                      <strong>Superadmin</strong> mengelola akses, akun, kredit,
                      dan situs. <strong>Operator</strong> mengelola konten,
                      project, rekonsiliasi, dan broadcast.{" "}
                      <strong>Auditor</strong> hanya membaca. Superadmin
                      terakhir dilindungi.
                    </div>
                    <form
                      className="ad-role-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        ask(
                          "admin_role",
                          roleUser,
                          { role: newRole },
                          roleUser,
                        );
                      }}
                    >
                      <label>
                        ID pengguna terverifikasi
                        <input
                          required
                          pattern="[0-9a-fA-F-]{36}"
                          value={roleUser}
                          onChange={(e) => setRoleUser(e.target.value)}
                          placeholder="Pilih dari halaman Pengguna"
                          disabled={!superadmin}
                        />
                      </label>
                      <label>
                        Peran
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value)}
                          disabled={!superadmin}
                        >
                          <option value="auditor">Auditor</option>
                          <option value="operator">Operator</option>
                          <option value="superadmin">Superadmin</option>
                        </select>
                      </label>
                      <button className="ad-primary" disabled={!superadmin}>
                        Berikan peran
                      </button>
                    </form>
                    {table(
                      [
                        "ID pengguna",
                        "Peran",
                        "Diberikan oleh",
                        "Sejak",
                        "Tindakan",
                      ],
                      items,
                      (r) => (
                        <>
                          <td>
                            <code>{r.user_id}</code>
                          </td>
                          <td>
                            <Badge>{label(r.role)}</Badge>
                          </td>
                          <td>
                            <code title={r.granted_by}>
                              {short(r.granted_by)}
                            </code>
                          </td>
                          <td>{date(r.created_at)}</td>
                          <td>
                            {act(
                              "Cabut peran",
                              () =>
                                ask(
                                  "admin_role",
                                  r.user_id,
                                  { role: "remove" },
                                  r.user_id,
                                ),
                              !superadmin,
                              true,
                            )}
                          </td>
                        </>
                      ),
                    )}
                  </>
                )}
                {tab === "audit" &&
                  table(
                    ["Tindakan", "Administrator / target", "Alasan", "Waktu"],
                    items,
                    (r) => (
                      <>
                        <td>
                          <strong>{label(r.action)}</strong>
                          <code>{r.id}</code>
                        </td>
                        <td>
                          <small>Admin</small>
                          <code>{r.actor_id}</code>
                          <small>Target</small>
                          <code>{r.target_id || "Konfigurasi platform"}</code>
                        </td>
                        <td className="ad-reason">{r.reason}</td>
                        <td>{date(r.created_at)}</td>
                      </>
                    ),
                  )}
                {tab === "operations" && (
                  <>
                    <section className="ad-card">
                      <div className="ad-card-heading">
                        <div>
                          <h2>Kesiapan layanan</h2>
                          <p>
                            Status konfigurasi, bukan jaminan koneksi provider.
                          </p>
                        </div>
                        <Server size={20} />
                      </div>
                      <div className="ad-service-grid">
                        {[
                          "cloud",
                          "ai",
                          "sandbox",
                          "publish",
                          "payments",
                          "whatsapp",
                        ].map((k) => (
                          <div key={k}>
                            <strong>
                              {
                                (
                                  {
                                    cloud: "Database cloud",
                                    ai: "AI builder",
                                    sandbox: "Sandbox",
                                    publish: "Hosting",
                                    payments: "Pembayaran",
                                    whatsapp: "WhatsApp OTP",
                                  } as Row
                                )[k]
                              }
                            </strong>
                            <Badge warn={!data.capabilities?.[k]}>
                              {data.capabilities?.[k]
                                ? "Dikonfigurasi"
                                : "Belum dikonfigurasi"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </section>
                    <h2 className="ad-section-title">
                      Antrean publish <small>30 terbaru</small>
                    </h2>
                    {table(
                      [
                        "Project / pekerjaan",
                        "Status",
                        "Percobaan",
                        "Tindakan",
                      ],
                      data.jobs,
                      (r) => (
                        <>
                          <td>
                            <code>{r.project_id}</code>
                            <small>{r.id}</small>
                            {r.error && <p>{r.error}</p>}
                          </td>
                          <td>
                            <Badge>{label(r.status)}</Badge>
                          </td>
                          <td>{r.attempts}</td>
                          <td>
                            {act(
                              "Batalkan antrean",
                              () => ask("publish_cancel", r.id, {}, r.id),
                              !canWrite || r.status !== "queued",
                            )}
                          </td>
                        </>
                      ),
                    )}
                    <h2 className="ad-section-title">
                      Cleanup hosting <small>30 terbaru</small>
                    </h2>
                    {table(
                      ["Site provider", "Percobaan", "Keterangan", "Tindakan"],
                      data.cleanup,
                      (r) => (
                        <>
                          <td>
                            <code>{r.provider_site_id}</code>
                          </td>
                          <td>{r.attempts}</td>
                          <td>{r.error || "Menunggu worker"}</td>
                          <td>
                            {act("Coba lagi", () =>
                              ask(
                                "hosting_retry",
                                r.id,
                                {},
                                r.provider_site_id,
                              ),
                            )}
                          </td>
                        </>
                      ),
                    )}
                    <h2 className="ad-section-title">
                      Tautan rekaman{" "}
                      <small>30 terbaru · token tidak ditampilkan</small>
                    </h2>
                    {table(
                      ["Rekaman", "Berlaku sampai", "Status", "Tindakan"],
                      data.recordings,
                      (r) => (
                        <>
                          <td>
                            <code>{r.recording_id}</code>
                          </td>
                          <td>{date(r.expires_at)}</td>
                          <td>
                            {r.revoked_at
                              ? "Dicabut"
                              : Date.parse(r.expires_at) < Date.now()
                                ? "Kedaluwarsa"
                                : "Aktif"}
                          </td>
                          <td>
                            {act(
                              "Cabut semua tautan",
                              () =>
                                ask(
                                  "recording_revoke",
                                  r.recording_id,
                                  {},
                                  r.recording_id,
                                ),
                              !canWrite || !!r.revoked_at,
                              true,
                            )}
                          </td>
                        </>
                      ),
                    )}
                  </>
                )}
                {tab === "settings" && (
                  <SettingsForm
                    key={reload}
                    data={data}
                    disabled={!superadmin}
                    save={(value) =>
                      ask(
                        "settings",
                        null,
                        { revision: data.revision, value },
                        "Pengaturan situs dan layanan",
                      )
                    }
                  />
                )}
                {"items" in data && (
                  <div className="ad-pagination">
                    <span>Halaman {page} · filter diterapkan di server</span>
                    <div>
                      <button
                        className="ad-secondary"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Sebelumnya
                      </button>
                      <button
                        className="ad-secondary"
                        disabled={!data.hasMore}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Berikutnya
                      </button>
                    </div>
                  </div>
                )}
              </>
            )
          )}
          <footer className="ad-footer">
            <span>PiwuApp · Administrasi platform</span>
            <span>
              <ShieldCheck size={13} /> Akses terbatas. Perubahan tercatat.
            </span>
          </footer>
        </main>
      </div>
      {editBroadcast && !command && (
        <BroadcastForm
          initial={editBroadcast}
          disabled={!canWrite}
          onClose={() => setEditBroadcast(null)}
          save={(payload) => {
            setEditBroadcast({ ...editBroadcast, ...payload });
            ask(
              "broadcast_save",
              editBroadcast.id,
              payload,
              editBroadcast.title || payload.title,
            );
          }}
        />
      )}
      {command && (
        <ActionDialog
          client={client}
          command={command}
          onClose={() => setCommand(null)}
          onDone={(text) => {
            setCommand(null);
            setEditBroadcast(null);
            setNotice(text);
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
function ActionDialog({
  client,
  command,
  onClose,
  onDone,
}: {
  command: Row;
  client: AdminClient;
  onClose: () => void;
  onDone: (s: string) => void;
}) {
  const [reason, setReason] = useState(""),
    [delta, setDelta] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const reset = () => setRequestId(crypto.randomUUID());
  return (
    <Modal
      title={label(command.action)}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="ad-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const payload = {
              ...command.payload,
              ...(command.action === "credits" ? { delta: Number(delta) } : {}),
              ...(command.action === "project_delete" ? { confirmation } : {}),
            };
            const result = await client("/admin/actions", {
              requestId,
              action: command.action,
              target: command.target,
              payload,
              reason,
            });
            onDone(result.notice);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Perubahan gagal.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{command.detail}</p>
        {command.target && <code>{command.target}</code>}
        {command.action === "unpublish" && (
          <div className="ad-info">
            Project akan dikunci dan penghapusan hosting masuk antrean. Batalkan
            antrean publish terlebih dahulu; build berjalan harus selesai.
            Website belum dianggap offline sampai cleanup dikonfirmasi.
          </div>
        )}
        {command.action === "credits" && (
          <label>
            Perubahan kredit (−10.000 sampai +10.000)
            <input
              type="number"
              min={-10000}
              max={10000}
              step={1}
              required
              value={delta}
              disabled={busy}
              onChange={(e) => {
                setDelta(e.target.value);
                reset();
              }}
            />
            <small>
              Positif menambah, negatif mengurangi. Saldo akhir tidak boleh
              negatif.
            </small>
          </label>
        )}
        {command.action === "project_delete" && (
          <label>
            Ketik ID project lengkap untuk menghapus permanen
            <input
              value={confirmation}
              disabled={busy}
              required
              onChange={(e) => {
                setConfirmation(e.target.value);
                reset();
              }}
            />
            <small>
              Workspace dan data turunannya akan dihapus. Tindakan ini tidak
              dapat dibatalkan.
            </small>
          </label>
        )}
        <label>
          Alasan perubahan
          <textarea
            required
            minLength={8}
            maxLength={500}
            rows={3}
            placeholder="Jelaskan alasan tindakan ini (minimal 8 karakter)…"
            value={reason}
            disabled={busy}
            onChange={(e) => {
              setReason(e.target.value);
              reset();
            }}
          />
        </label>
        <p className="ad-muted">
          Identitas admin, target, alasan, dan hasil akan dicatat. Jangan
          masukkan kredensial atau informasi sensitif.
        </p>
        {error && (
          <p className="ad-error" role="alert">
            {error}
          </p>
        )}
        <div className="ad-form-actions">
          <button
            type="button"
            className="ad-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Batal
          </button>
          <button
            className="ad-primary"
            disabled={
              busy ||
              reason.trim().length < 8 ||
              (command.action === "credits" &&
                (!Number(delta) || !Number.isInteger(Number(delta)))) ||
              (command.action === "project_delete" &&
                confirmation !== command.target)
            }
          >
            {busy ? "Memproses…" : "Konfirmasi perubahan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function localInput(v: string) {
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function BroadcastForm({
  initial,
  disabled,
  onClose,
  save,
}: {
  initial: Row;
  disabled: boolean;
  onClose: () => void;
  save: (p: Row) => void;
}) {
  const [form, setForm] = useState<Row>({
    ...initial,
    starts_at: localInput(initial.starts_at),
    ends_at: initial.ends_at ? localInput(initial.ends_at) : "",
  });
  const field = (key: string, value: string) =>
    setForm({ ...form, [key]: value });
  const [error, setError] = useState("");
  return (
    <Modal
      title={initial.revision ? "Sunting broadcast" : "Buat broadcast"}
      onClose={onClose}
      wide
    >
      <form
        className="ad-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.ends_at && form.ends_at <= form.starts_at) {
            setError("Waktu berakhir harus setelah waktu mulai.");
            return;
          }
          save({
            title: form.title,
            body: form.body,
            audience: form.audience,
            status: form.status,
            starts_at: new Date(form.starts_at).toISOString(),
            ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
            revision: initial.revision,
          });
        }}
      >
        <div className="ad-info">
          Kanal in-app. Teks biasa, tanpa HTML. Publik tampil di beranda; segmen
          member hanya melalui sesi terverifikasi.
        </div>
        <label>
          Judul
          <input
            required
            maxLength={120}
            disabled={disabled}
            value={form.title}
            onChange={(e) => field("title", e.target.value)}
          />
        </label>
        <label>
          Isi pengumuman
          <textarea
            required
            maxLength={4000}
            rows={6}
            disabled={disabled}
            value={form.body}
            onChange={(e) => field("body", e.target.value)}
          />
          <small>{form.body.length}/4.000 karakter</small>
        </label>
        <div className="ad-form-grid">
          <label>
            Audiens
            <select
              disabled={disabled}
              value={form.audience}
              onChange={(e) => field("audience", e.target.value)}
            >
              {["public", "members", "pro", "team"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              disabled={disabled}
              value={form.status}
              onChange={(e) => field("status", e.target.value)}
            >
              {["draft", "published", "archived"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mulai tayang (waktu lokal)
            <input
              required
              type="datetime-local"
              disabled={disabled}
              value={form.starts_at}
              onChange={(e) => field("starts_at", e.target.value)}
            />
          </label>
          <label>
            Berakhir (opsional)
            <input
              type="datetime-local"
              disabled={disabled}
              value={form.ends_at}
              onChange={(e) => field("ends_at", e.target.value)}
            />
          </label>
        </div>
        <small className="ad-muted">
          Pilih “Tayang” dengan waktu mulai di masa depan untuk menjadwalkan.
          Draf tidak pernah ditampilkan kepada penerima.
        </small>
        {error && (
          <p className="ad-error" role="alert">
            {error}
          </p>
        )}
        <div className="ad-broadcast-preview">
          <span className="ad-eyebrow">PRATINJAU PESAN</span>
          <h3>{form.title || "Judul pengumuman"}</h3>
          <p>{form.body || "Isi pesan akan muncul di sini."}</p>
        </div>
        <div className="ad-form-actions">
          <button className="ad-secondary" type="button" onClick={onClose}>
            Tutup
          </button>
          <button className="ad-primary" disabled={disabled}>
            Tinjau & simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SettingsForm({
  data,
  disabled,
  save,
}: {
  data: Row;
  disabled: boolean;
  save: (v: Row) => void;
}) {
  const [value, setValue] = useState<Row>(structuredClone(data.value));
  const set = (k: string, v: any) => setValue({ ...value, [k]: v });
  return (
    <form
      className="ad-form ad-settings"
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
      }}
    >
      <section className="ad-card">
        <h2>Konten beranda</h2>
        <p className="ad-muted">
          Kosongkan judul atau deskripsi untuk menggunakan konten bawaan
          PiwuApp.
        </p>
        <label>
          Judul utama
          <input
            maxLength={100}
            value={value.hero_title}
            disabled={disabled}
            onChange={(e) => set("hero_title", e.target.value)}
            placeholder="Bangun sesuatu dengan PiwuApp."
          />
        </label>
        <label>
          Deskripsi utama
          <textarea
            maxLength={500}
            rows={3}
            value={value.hero_subtitle}
            disabled={disabled}
            onChange={(e) => set("hero_subtitle", e.target.value)}
          />
        </label>
        <label>
          Email dukungan
          <input
            type="email"
            value={value.support_email}
            disabled={disabled}
            onChange={(e) => set("support_email", e.target.value)}
            placeholder="dukungan@domain-anda.id"
          />
        </label>
      </section>
      <section className="ad-card">
        <h2>Mode pemeliharaan</h2>
        <p className="ad-muted">
          Menjeda penulisan workspace dan operasi layanan baru. Baca data, akses
          admin, webhook pembayaran, dan cleanup hosting tetap berjalan. Operasi
          eksternal yang sudah berjalan mungkin tetap selesai.
        </p>
        <label className="ad-toggle">
          <span>Aktifkan pemeliharaan</span>
          <input
            type="checkbox"
            checked={value.maintenance}
            disabled={disabled}
            onChange={(e) => set("maintenance", e.target.checked)}
          />
        </label>
        <label>
          Pesan pemeliharaan
          <textarea
            maxLength={300}
            minLength={1}
            required
            value={value.maintenance_message}
            disabled={disabled}
            onChange={(e) => set("maintenance_message", e.target.value)}
          />
        </label>
      </section>
      <section className="ad-card">
        <h2>Layanan platform</h2>
        <p className="ad-muted">
          Sakelar ini mengizinkan layanan, bukan memasang kredensial provider.
          Kesiapan koneksi tersedia di Operasional.
        </p>
        {Object.entries({
          ai: "AI builder",
          sandbox: "Sandbox & paket",
          publish: "Publish & domain",
          payments: "Checkout pembayaran",
          marketplace: "Marketplace",
        }).map(([key, title]) => (
          <label className="ad-toggle" key={key}>
            <span>{title}</span>
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.enabled_services[key]}
              onChange={(e) =>
                set("enabled_services", {
                  ...value.enabled_services,
                  [key]: e.target.checked,
                })
              }
            />
          </label>
        ))}
      </section>
      <div className="ad-form-actions">
        <small>Revisi {data.revision} · perubahan membutuhkan alasan.</small>
        <button className="ad-primary" disabled={disabled}>
          Tinjau & simpan pengaturan
        </button>
      </div>
    </form>
  );
}
