import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Monitor,
  Tablet,
  Smartphone,
  Plus,
  Minus,
  Scan,
  Hand,
  MousePointer2,
  Undo2,
  Redo2,
  Columns3,
  Settings2,
  Copy,
  Trash2,
  Code2,
  Palette,
  RotateCw,
  AlertTriangle,
  Layers,
  ChevronDown,
  Move,
  Play,
  Pause,
} from "lucide-react";
import {
  arrangeFrames,
  clamp,
  decodeLayout,
  fitCamera,
  frameOf,
  initialFrames,
  layoutKey,
  MAX_FRAMES,
  presets,
  zoomAt,
} from "../lib/canvas/layout";
import type { Camera, CanvasFrame, FrameKind } from "../lib/canvas/layout";
import "./canvas.css";
const deviceIcons = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };
type History = {
  past: CanvasFrame[][];
  present: CanvasFrame[];
  future: CanvasFrame[][];
};
function readLayout(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return { frames: raw ? decodeLayout(raw) : initialFrames(), error: "" };
  } catch {
    return {
      frames: initialFrames(),
      error:
        "Layout lokal tidak dapat dibaca. Layout awal digunakan; simpan ulang untuk menggantinya.",
    };
  }
}
export default function CanvasPanel({
  html,
  error,
  scope,
  projectId,
  onCode,
  onDesign,
}: {
  html: string;
  error: string;
  scope: string;
  projectId: string;
  onCode: () => void;
  onDesign: (kind: FrameKind) => void;
}) {
  const key = layoutKey(scope, projectId);
  const [initial] = useState(() => readLayout(key));
  const [history, setHistory] = useState<History>({
    past: [],
    present: initial.frames,
    future: [],
  });
  const frames = history.present;
  const [selected, setSelected] = useState(frames[0]?.id || "");
  const [camera, setCamera] = useState<Camera>({ x: 50, y: 80, scale: 0.3 });
  const [mode, setMode] = useState<"select" | "pan">("select"),
    [space, setSpace] = useState(false),
    [properties, setProperties] = useState(false),
    [interactive, setInteractive] = useState(false),
    [saveError, setSaveError] = useState(initial.error),
    [saved, setSaved] = useState(false),
    [preset, setPreset] = useState<FrameKind>("mobile"),
    [dragFrame, setDragFrame] = useState<{
      id: string;
      x: number;
      y: number;
    } | null>(null);
  const stage = useRef<HTMLDivElement>(null),
    framesRef = useRef(frames),
    cameraRef = useRef(camera),
    autoFit = useRef(true),
    didChange = useRef(false),
    drag = useRef<{
      type: "pan" | "frame";
      pointer: number;
      startX: number;
      startY: number;
      camera: Camera;
      frame?: CanvasFrame;
    } | null>(null);
  framesRef.current = frames;
  cameraRef.current = camera;
  const frame = frames.find((f) => f.id === selected);
  const persist = useCallback(
    (value: CanvasFrame[]) => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, frames: value }),
        );
        setSaveError("");
        setSaved(true);
      } catch {
        setSaved(false);
        setSaveError(
          "Layout belum tersimpan: penyimpanan browser tidak tersedia atau penuh.",
        );
      }
    },
    [key],
  );
  const commit = useCallback(
    (next: CanvasFrame[] | ((old: CanvasFrame[]) => CanvasFrame[])) => {
      const value = typeof next === "function" ? next(framesRef.current) : next;
      if (JSON.stringify(value) === JSON.stringify(framesRef.current)) return;
      didChange.current = true;
      framesRef.current = value;
      setHistory((h) => {
        return {
          past: [...h.past, h.present].slice(-30),
          present: value,
          future: [],
        };
      });
      persist(value);
    },
    [persist],
  );
  const undo = () => {
    if (!history.past.length) return;
    persist(history.past[history.past.length - 1]);
    didChange.current = true;
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [h.present, ...h.future],
          }
        : h,
    );
  };
  const redo = () => {
    if (!history.future.length) return;
    persist(history.future[0]);
    didChange.current = true;
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.present],
            present: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );
  };
  const fit = useCallback(() => {
    const box = stage.current?.getBoundingClientRect();
    if (box) {
      setCamera(fitCamera(framesRef.current, box.width, box.height));
      autoFit.current = true;
    }
  }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (autoFit.current) fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);
  useEffect(() => {
    if (!initial.error) persist(initial.frames);
  }, [initial, persist]);
  useEffect(() => {
    if (!frames.some((f) => f.id === selected)) {
      setSelected(frames[0]?.id || "");
      setInteractive(false);
    }
  }, [frames, selected]);
  useEffect(() => {
    const clear = () => {
      setSpace(false);
      drag.current = null;
      setDragFrame(null);
    };
    window.addEventListener("blur", clear);
    return () => window.removeEventListener("blur", clear);
  }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (
        (e.target as HTMLElement).closest(
          ".cv-floating,.cv-properties,.cv-navigator",
        )
      )
        return;
      e.preventDefault();
      autoFit.current = false;
      const rect = el.getBoundingClientRect();
      setCamera((c) =>
        e.ctrlKey || e.metaKey
          ? zoomAt(
              c,
              c.scale * Math.exp(-e.deltaY * 0.006),
              e.clientX - rect.left,
              e.clientY - rect.top,
            )
          : { ...c, x: c.x - e.deltaX, y: c.y - e.deltaY },
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const pan = mode === "pan" || space;
  function zoom(factor: number) {
    autoFit.current = false;
    const rect = stage.current?.getBoundingClientRect();
    if (rect)
      setCamera((c) =>
        zoomAt(c, c.scale * factor, rect.width / 2, rect.height / 2),
      );
  }
  function center(id: string) {
    const f = frames.find((v) => v.id === id),
      box = stage.current?.getBoundingClientRect();
    if (f && box) {
      setSelected(id);
      setCamera(fitCamera([f], box.width, box.height));
      autoFit.current = false;
      setInteractive(false);
    }
  }
  function add(kind: FrameKind) {
    if (frames.length >= MAX_FRAMES) return;
    const right = Math.max(0, ...frames.map((f) => f.x + f.width + 80));
    const f = frameOf(
      kind,
      frames.filter((v) => v.kind === kind).length + 1,
      right,
    );
    commit([...frames, f]);
    setSelected(f.id);
    autoFit.current = true;
    requestAnimationFrame(fit);
  }
  function begin(e: ReactPointerEvent, f?: CanvasFrame) {
    if (e.button !== 0 && e.button !== 1) return;
    if (
      !f &&
      e.target !== e.currentTarget &&
      !(e.target as HTMLElement).classList.contains("cv-world")
    )
      return;
    e.preventDefault();
    if (!f) stage.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    autoFit.current = false;
    setInteractive(false);
    if (f) setSelected(f.id);
    drag.current = {
      type: !f || pan || e.button === 1 ? "pan" : "frame",
      pointer: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      camera: cameraRef.current,
      frame: f,
    };
  }
  function move(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    const dx = e.clientX - d.startX,
      dy = e.clientY - d.startY;
    if (d.type === "pan")
      setCamera({ ...d.camera, x: d.camera.x + dx, y: d.camera.y + dy });
    else if (d.frame)
      setDragFrame({
        id: d.frame.id,
        x: clamp(
          Math.round((d.frame.x + dx / d.camera.scale) / 8) * 8,
          -20000,
          20000,
        ),
        y: clamp(
          Math.round((d.frame.y + dy / d.camera.scale) / 8) * 8,
          -20000,
          20000,
        ),
      });
  }
  function finish(e: ReactPointerEvent, cancel = false) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    if (!cancel && d.type === "frame" && d.frame) {
      const dx = (e.clientX - d.startX) / d.camera.scale,
        dy = (e.clientY - d.startY) / d.camera.scale;
      const x = clamp(Math.round((d.frame.x + dx) / 8) * 8, -20000, 20000),
        y = clamp(Math.round((d.frame.y + dy) / 8) * 8, -20000, 20000);
      if (Math.abs(dx) + Math.abs(dy) > 1)
        commit((old) =>
          old.map((f) => (f.id === d.frame!.id ? { ...f, x, y } : f)),
        );
    }
    drag.current = null;
    setDragFrame(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function patch(id: string, changes: Partial<CanvasFrame>) {
    commit((old) => old.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  }
  return (
    <section className="cv-panel" aria-label="Canvas responsif">
      <div className="cv-toolbar">
        <div className="cv-title">
          <Layers size={15} />
          <strong>Canvas</strong>
          <span>{frames.length} frame</span>
        </div>
        <div className="cv-actions">
          <label className="cv-preset">
            <span className="sr-only">Jenis frame baru</span>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as FrameKind)}
            >
              {Object.entries(presets).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="cv-add"
            aria-label="Tambah frame"
            disabled={frames.length >= MAX_FRAMES}
            onClick={() => add(preset)}
          >
            <Plus size={14} />
            <span>Tambah frame</span>
          </button>
          <span className="cv-divider" />
          <button
            aria-label="Urungkan layout canvas"
            title="Urungkan layout"
            disabled={!history.past.length}
            onClick={undo}
          >
            <Undo2 size={15} />
          </button>
          <button
            aria-label="Ulangi layout canvas"
            title="Ulangi layout"
            disabled={!history.future.length}
            onClick={redo}
          >
            <Redo2 size={15} />
          </button>
          <button
            aria-label="Susun ulang frame"
            title="Susun ulang frame"
            disabled={!frames.length}
            onClick={() => {
              commit(arrangeFrames(frames));
              requestAnimationFrame(fit);
            }}
          >
            <Columns3 size={15} />
          </button>
          <button
            aria-label="Properti frame"
            title="Properti frame"
            aria-pressed={properties}
            disabled={!frame}
            onClick={() => setProperties(!properties)}
          >
            <Settings2 size={15} />
          </button>
        </div>
      </div>
      {saveError && (
        <div className="cv-save-error" role="alert">
          {saveError}{" "}
          <button
            onClick={() => {
              didChange.current = true;
              try {
                localStorage.setItem(
                  key,
                  JSON.stringify({ version: 1, frames }),
                );
                setSaveError("");
                setSaved(true);
              } catch {
                setSaveError(
                  "Layout belum tersimpan: penyimpanan browser tidak tersedia atau penuh.",
                );
              }
            }}
          >
            Simpan ulang
          </button>
        </div>
      )}
      <div
        ref={stage}
        className={"cv-stage " + (pan ? "is-panning" : "")}
        role="region"
        aria-label="Area canvas, geser untuk menjelajah"
        tabIndex={0}
        style={{
          backgroundPosition: `${camera.x}px ${camera.y}px`,
          backgroundSize: `${Math.max(16, 32 * camera.scale)}px ${Math.max(16, 32 * camera.scale)}px`,
        }}
        onPointerDown={(e) => begin(e)}
        onPointerMove={move}
        onPointerUp={(e) => finish(e)}
        onPointerCancel={(e) => finish(e, true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setSpace(false);
        }}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("input,select,textarea,button"))
            return;
          if (e.code === "Space") {
            e.preventDefault();
            setSpace(true);
          }
          if (e.key === "Escape") {
            setInteractive(false);
            setProperties(false);
          }
          if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) fit();
          if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            zoom(1.2);
          }
          if (e.key === "-") {
            e.preventDefault();
            zoom(1 / 1.2);
          }
        }}
        onKeyUp={(e) => {
          if (e.code === "Space") setSpace(false);
        }}
      >
        <div
          className="cv-world"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          }}
        >
          {frames.map((f) => {
            const Icon = deviceIcons[f.kind];
            const position = dragFrame?.id === f.id ? dragFrame : f;
            return (
              <section
                key={f.id}
                className={"cv-frame " + (selected === f.id ? "selected" : "")}
                aria-label={"Frame " + f.name}
                data-frame-id={f.id}
                style={{
                  left: position.x,
                  top: position.y,
                  width: f.width,
                  height: f.height,
                }}
              >
                <header
                  className={
                    "cv-frame-heading " +
                    (f.width * camera.scale < 200 ? "compact" : "")
                  }
                  style={{
                    width: f.width * camera.scale,
                    height: 28,
                    top: -32 / camera.scale,
                    transform: `scale(${1 / camera.scale})`,
                    transformOrigin: "0 0",
                  }}
                >
                  <button
                    className="cv-frame-handle"
                    aria-label={"Pindahkan frame " + f.name}
                    title="Geser untuk memindahkan. Gunakan tombol panah saat fokus."
                    onPointerDown={(e) => begin(e, f)}
                    onPointerMove={move}
                    onPointerUp={(e) => finish(e)}
                    onPointerCancel={(e) => finish(e, true)}
                    onFocus={() => setSelected(f.id)}
                    onKeyDown={(e) => {
                      const deltas: Record<string, [number, number]> = {
                        ArrowLeft: [-1, 0],
                        ArrowRight: [1, 0],
                        ArrowUp: [0, -1],
                        ArrowDown: [0, 1],
                      };
                      if (deltas[e.key]) {
                        e.preventDefault();
                        const [x, y] = deltas[e.key],
                          step = e.shiftKey ? 40 : 8;
                        patch(f.id, {
                          x: clamp(f.x + x * step, -20000, 20000),
                          y: clamp(f.y + y * step, -20000, 20000),
                        });
                      }
                    }}
                  >
                    <Icon size={18} />
                    <strong>{f.name}</strong>
                    <span>
                      {f.width} × {f.height}
                    </span>
                    <Move size={15} />
                  </button>
                </header>
                <FramePreview
                  frame={f}
                  html={html}
                  error={error}
                  interactive={interactive && selected === f.id && !pan}
                  onSelect={() => {
                    setSelected(f.id);
                    setInteractive(false);
                  }}
                />
                <div
                  className="cv-frame-size"
                  aria-hidden="true"
                  style={{
                    bottom: -26 / camera.scale,
                    transform: `translateX(-50%) scale(${1 / camera.scale})`,
                    transformOrigin: "top center",
                  }}
                >
                  {f.width} × {f.height}
                </div>
              </section>
            );
          })}
        </div>
        {!frames.length && (
          <div className="cv-empty">
            <Layers size={34} />
            <h2>Ruang untuk melihat ide secara utuh.</h2>
            <p>
              Tambahkan frame untuk membandingkan aplikasi pada ukuran layar
              berbeda.
            </p>
            <button className="cv-add" onClick={() => add("desktop")}>
              <Plus size={15} />
              Tambah frame desktop
            </button>
          </div>
        )}
        {frames.length > 0 && (
          <div className="cv-navigator">
            <Layers size={13} />
            <label>
              <span className="sr-only">Pusatkan frame</span>
              <select value={selected} onChange={(e) => center(e.target.value)}>
                {frames.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · {f.width} px
                  </option>
                ))}
              </select>
            </label>
            <ChevronDown size={12} />
          </div>
        )}
        {properties && frame && (
          <aside className="cv-properties" aria-label="Properti frame canvas">
            <header>
              <strong>PROPERTI FRAME</strong>
              <span>Layout lokal</span>
            </header>
            <label>
              Nama frame
              <input
                key={frame.id + ":name"}
                defaultValue={frame.name}
                maxLength={60}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name) patch(frame.id, { name });
                  else e.target.value = frame.name;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </label>
            <div className="cv-fields">
              {(["width", "height"] as const).map((k) => (
                <label key={frame.id + k}>
                  {k === "width" ? "Lebar" : "Tinggi"}
                  <div>
                    <input
                      key={frame[k]}
                      aria-label={
                        k === "width" ? "Lebar frame" : "Tinggi frame"
                      }
                      type="number"
                      min={320}
                      max={k === "width" ? 1920 : 1600}
                      defaultValue={frame[k]}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (
                          Number.isInteger(v) &&
                          v >= 320 &&
                          v <= (k === "width" ? 1920 : 1600)
                        )
                          patch(frame.id, { [k]: v });
                        else e.target.value = String(frame[k]);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                    <span>px</span>
                  </div>
                </label>
              ))}
            </div>
            <small>Ukuran viewport, bukan perubahan CSS aplikasi.</small>
            <div className="cv-properties-actions">
              <button
                disabled={frames.length >= MAX_FRAMES}
                onClick={() => {
                  const copy = {
                    ...frame,
                    id: crypto.randomUUID(),
                    name: (frame.name + " salinan").slice(0, 60),
                    x: clamp(frame.x + frame.width + 80, -20000, 20000),
                  };
                  commit([...frames, copy]);
                  setSelected(copy.id);
                  requestAnimationFrame(fit);
                }}
              >
                <Copy size={13} />
                Duplikasi
              </button>
              <button
                onClick={() => {
                  commit(frames.filter((f) => f.id !== frame.id));
                }}
              >
                <Trash2 size={13} />
                Hapus
              </button>
            </div>
            <button
              className="cv-design-link"
              onClick={() => onDesign(frame.kind)}
            >
              <Palette size={14} />
              Sunting di Design
            </button>
            <button className="cv-design-link" onClick={onCode}>
              <Code2 size={14} />
              Buka kode aplikasi
            </button>
          </aside>
        )}
        <div
          className="cv-floating"
          role="toolbar"
          aria-label="Navigasi canvas"
        >
          <button
            title="Pilih & pindahkan frame"
            aria-label="Mode pilih canvas"
            aria-pressed={mode === "select"}
            onClick={() => setMode("select")}
          >
            <MousePointer2 size={17} />
          </button>
          <button
            title="Geser canvas · tahan Space"
            aria-label="Mode geser canvas"
            aria-pressed={mode === "pan"}
            onClick={() => {
              setMode("pan");
              setInteractive(false);
            }}
          >
            <Hand size={17} />
          </button>
          <span className="cv-divider" />
          <button
            aria-label="Perkecil canvas"
            onClick={() => zoom(1 / 1.2)}
            disabled={camera.scale <= 0.12}
          >
            <Minus size={16} />
          </button>
          <output aria-label="Zoom canvas">
            {Math.round(camera.scale * 100)}%
          </output>
          <button
            aria-label="Perbesar canvas"
            onClick={() => zoom(1.2)}
            disabled={camera.scale >= 1.5}
          >
            <Plus size={16} />
          </button>
          <button
            aria-label="Sesuaikan semua frame"
            title="Sesuaikan semua · F"
            onClick={fit}
          >
            <Scan size={17} />
          </button>
          <span className="cv-divider" />
          <button
            className="cv-interact"
            aria-label={interactive ? "Hentikan interaksi" : "Interaksi"}
            disabled={!frame || !!error}
            aria-pressed={interactive}
            onClick={() => {
              setInteractive(!interactive);
              setMode("select");
            }}
          >
            {interactive ? <Pause size={14} /> : <Play size={14} />}
            <span>{interactive ? "Hentikan interaksi" : "Interaksi"}</span>
          </button>
        </div>
      </div>
      <footer className="cv-footer">
        <span>
          <span className={"cv-save-dot " + (saveError ? "error" : "")} />
          <span role="status" aria-label="Status layout canvas">
            {saved ? "Layout tersimpan lokal" : "Layout lokal"}
          </span>
          <span className="cv-footer-detail">
            {" "}
            · {frames.length}/{MAX_FRAMES} frame
          </span>
        </span>
        <span>
          {interactive
            ? "Aplikasi interaktif pada frame terpilih"
            : "Geser latar · Ctrl + gulir untuk zoom"}
          <span className="cv-footer-detail">
            {" "}
            · Semua frame memakai kode yang sama
          </span>
        </span>
      </footer>
    </section>
  );
}
function FramePreview({
  frame,
  html,
  error,
  interactive,
  onSelect,
}: {
  frame: CanvasFrame;
  html: string;
  error: string;
  interactive: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [runtimeError, setRuntimeError] = useState(""),
    [reload, setReload] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setRuntimeError("");
    setLoading(true);
  }, [html, reload]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.source === ref.current?.contentWindow &&
        event.data?.type === "piwu-error"
      )
        setRuntimeError(String(event.data.message).slice(0, 500));
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);
  return (
    <div className="cv-frame-content">
      {error || runtimeError ? (
        <div className="cv-preview-error">
          <AlertTriangle size={26} />
          <h3>Preview perlu diperbaiki</h3>
          <pre>{error || runtimeError}</pre>
          <button
            onClick={() => {
              setRuntimeError("");
              setReload((n) => n + 1);
            }}
          >
            <RotateCw size={15} />
            Coba lagi
          </button>
        </div>
      ) : (
        <>
          <div
            className="cv-frame-document"
            inert={!interactive}
            aria-hidden={!interactive}
          >
            <iframe
              ref={ref}
              key={reload}
              title={"Canvas " + frame.name}
              srcDoc={html}
              sandbox="allow-scripts"
              tabIndex={0}
              style={{ pointerEvents: interactive ? "auto" : "none" }}
              onLoad={() => setLoading(false)}
            />
          </div>
          {loading && (
            <div className="cv-frame-loading" role="status">
              Menyiapkan preview…
            </div>
          )}
          {!interactive && (
            <button
              className="cv-frame-cover"
              aria-label={"Pilih frame " + frame.name}
              onClick={onSelect}
            />
          )}
        </>
      )}
    </div>
  );
}
