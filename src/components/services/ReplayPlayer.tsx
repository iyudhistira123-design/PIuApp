import { sceneSchema, SCENE_PATH } from "../../lib/roblox/scene";
import "../../workspace/roblox/roblox.css";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { compilePreview } from "../../lib/preview";
import type { ReplayEvent } from "../../services/recordings";
import "./services.css";
const SceneViewport = lazy(
  () => import("../../workspace/roblox/SceneViewport"),
);
export default function ReplayPlayer({ events }: { events: ReplayEvent[] }) {
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [events]);
  useEffect(() => {
    if (!playing || index >= events.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setIndex((i) => i + 1),
      Math.max(
        200,
        Math.min(5000, (events[index + 1].time - events[index].time) / speed),
      ),
    );
    return () => clearTimeout(timer);
  }, [playing, index, speed, events]);
  const frame = useMemo(() => {
    try {
      const files = events[index]?.files || {};
      if (SCENE_PATH in files)
        return {
          scene: sceneSchema.parse(JSON.parse(files[SCENE_PATH])),
          html: "",
          error: "",
        };
      const pkg = JSON.parse(files["package.json"] || "{}");
      if (pkg.dependencies?.expo || pkg.dependencies?.["react-native"])
        return { native: true, html: "", error: "" };
      return { html: compilePreview(files), error: "" };
    } catch (e) {
      return {
        html: "",
        error:
          e instanceof Error ? e.message : "Snapshot tidak dapat dirender.",
      };
    }
  }, [events, index]);
  if (!events.length) return <p>Belum ada snapshot yang direkam.</p>;
  return (
    <section className="service-panel">
      <div className="service-actions">
        <button
          onClick={() => {
            if (index === events.length - 1) setIndex(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "Jeda" : "Putar"}
        </button>
        <label>
          Kecepatan
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            <option value="1">1×</option>
            <option value="2">2×</option>
            <option value="4">4×</option>
          </select>
        </label>
      </div>
      <label>
        Timeline · {index + 1}/{events.length}
        <input
          aria-label="Timeline rekaman"
          type="range"
          min="0"
          max={events.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
        />
      </label>
      <p>
        {events[index]?.label} ·{" "}
        {new Date(events[index]?.time).toLocaleTimeString("id-ID")}
      </p>
      {frame.error ? (
        <div className="service-error">{frame.error}</div>
      ) : frame.scene ? (
        <div style={{ height: 400, position: "relative" }}>
          <Suspense fallback={<p>Memuat snapshot 3D…</p>}>
            <SceneViewport
              scene={frame.scene}
              selected=""
              onSelect={() => {}}
              readOnly
            />
          </Suspense>
        </div>
      ) : frame.native ? (
        <p role="status">
          Snapshot Expo menyimpan source native. Preview perangkat tidak
          dijalankan di browser; jalankan project melalui Expo Go atau
          development build.
        </p>
      ) : (
        <iframe
          title="Pemutar snapshot rekaman"
          className="replay-frame"
          sandbox="allow-scripts"
          srcDoc={frame.html}
        />
      )}
      <p>
        Replay snapshot kode, bukan video. Jeda antaraksi dibatasi 5 detik.
        Preview read-only tanpa akses jaringan atau akun pembuat.
      </p>
    </section>
  );
}
