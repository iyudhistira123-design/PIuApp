import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { Logo } from "../components/ui";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
export default function PasswordRecovery({
  reset = false,
}: {
  reset?: boolean;
}) {
  const user = useStore((s) => s.user),
    ready = useStore((s) => s.authReady);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setError("");
    setNotice("");
    setPassword("");
    setConfirm("");
  }, [reset]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (!supabase) {
      setError(
        "Autentikasi belum dikonfigurasi. Tidak ada email atau perubahan password yang disimulasikan.",
      );
      return;
    }
    if (reset && (!user || user.demo)) {
      setError(
        "Tautan pemulihan tidak valid atau sesi sudah berakhir. Minta tautan baru.",
      );
      return;
    }
    if (reset && password !== confirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    const account = user?.id;
    setBusy(true);
    try {
      if (reset) {
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw result.error;
        if (useStore.getState().user?.id !== account)
          throw new Error(
            "Sesi berubah. Periksa akun yang aktif sebelum melanjutkan.",
          );
        setPassword("");
        setConfirm("");
        setNotice("Kata sandi berhasil diperbarui oleh layanan autentikasi.");
      } else {
        const result = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: location.origin + "/reset-password",
        });
        if (result.error) throw result.error;
        setNotice(
          "Permintaan diterima layanan autentikasi. Jika email terdaftar, periksa kotak masuk dan spam untuk tautan pemulihan. Pengiriman email belum dapat diverifikasi dari aplikasi.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Layanan autentikasi tidak dapat menyelesaikan permintaan.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page" style={{ display: "block" }}>
      <section
        className="auth-main"
        style={{ maxWidth: 540, margin: "auto", minHeight: "100dvh" }}
      >
        <Logo />
        <div className="auth-form-wrap">
          <Link className="back-link" to="/login">
            Kembali ke login
          </Link>
          <h1>{reset ? "Atur kata sandi baru." : "Pulihkan akses akun."}</h1>
          <p>
            {reset
              ? "Gunakan tautan pemulihan dari email Anda. Kata sandi dikirim langsung ke layanan autentikasi."
              : "Masukkan email akun Anda. Kami tidak mengubah kata sandi sebelum tautan pemulihan diverifikasi."}
          </p>
          {reset && !ready && <p role="status">Memulihkan sesi autentikasi…</p>}
          {reset && ready && (!user || user.demo) && (
            <p role="alert">
              Sesi pemulihan tidak tersedia.{" "}
              <Link to="/forgot-password">Minta tautan baru</Link>.
            </p>
          )}
          <form onSubmit={submit}>
            {!reset ? (
              <label>
                Alamat email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="anda@email.com"
                />
              </label>
            ) : (
              <>
                <label>
                  Kata sandi baru
                  <input
                    required
                    type="password"
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  Konfirmasi kata sandi
                  <input
                    required
                    type="password"
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="form-success" role="status">
                {notice}
              </p>
            )}
            <button
              className="button button-dark full-width"
              disabled={busy || (reset && (!ready || !user || user.demo))}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : reset ? (
                "Simpan kata sandi baru"
              ) : (
                "Kirim tautan pemulihan"
              )}
            </button>
          </form>
          {reset && notice && (
            <Link className="back-link" to="/projects">
              Buka workspace
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
