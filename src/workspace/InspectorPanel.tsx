import { useState } from "react";
import { Search, Network, Send, AlertTriangle } from "lucide-react";
export default function InspectorPanel({ selected }: { selected: any }) {
  const [url, setUrl] = useState("/api/status");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("inspector");
  async function run() {
    if (!url.startsWith("/api/") || url.startsWith("//")) {
      setResult("Tester lokal hanya mengizinkan endpoint /api/ di origin ini.");
      return;
    }
    setBusy(true);
    try {
      const time = performance.now();
      const res = await fetch(url);
      const text = await res.text();
      setResult(
        `GET ${url}\nStatus: ${res.status}\nWaktu: ${Math.round(performance.now() - time)} ms\n\n${text}`,
      );
    } catch (e) {
      setResult("Permintaan gagal: " + String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="inspector-panel">
      <div className="inspector-tabs">
        <button
          className={tab === "inspector" ? "active" : ""}
          onClick={() => setTab("inspector")}
        >
          <Search size={12} />
          Elemen
        </button>
        <button
          className={tab === "api" ? "active" : ""}
          onClick={() => setTab("api")}
        >
          <Network size={12} />
          API tester
        </button>
      </div>
      {tab === "inspector" ? (
        selected ? (
          <pre>{JSON.stringify(selected, null, 2)}</pre>
        ) : (
          <p className="ws-empty-text">
            Aktifkan “Pilih elemen”, lalu klik elemen di canvas untuk melihat
            selector dan style.
          </p>
        )
      ) : (
        <>
          <div className="api-form">
            <span>GET</span>
            <input
              aria-label="Endpoint API"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button className="ws-button" onClick={run} disabled={busy}>
              <Send size={12} />
              {busy ? "Mengirim…" : "Kirim"}
            </button>
          </div>
          <pre>{result || "Respons endpoint akan tampil di sini."}</pre>
        </>
      )}
    </div>
  );
}
