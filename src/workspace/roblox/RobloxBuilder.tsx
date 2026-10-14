import { nudgeOnMap } from "../../lib/roblox/map";
import type { ViewTool } from "./SceneViewport";
import { downloadText } from "../../lib/download";
import { useMemo, useState, useEffect, lazy, Suspense } from "react";
import {
  Box,
  Layers,
  Plus,
  Trash2,
  Download,
  Upload,
  Link2,
  PanelLeft,
  PanelRight,
  ArrowLeft,
  MousePointer2,
  Move,
  RotateCw,
  Scaling,
} from "lucide-react";
import type { Project } from "../../lib/types";
import { useStore } from "../../lib/store";
import {
  SCENE_PATH,
  sceneSchema,
  newObject,
  deleteObject,
  meshOBJ,
  parseOBJ,
  type SceneObject,
  type RobloxScene,
} from "../../lib/roblox/scene";
import StudioBridge from "./StudioBridge";
import "./roblox.css";
const SceneViewport = lazy(() => import("./SceneViewport"));
export default function RobloxBuilder({
  project,
  readOnly,
  onOpenFile,
  mode = "3d",
  onModeChange,
  draft = false,
}: {
  mode?: "3d" | "map";
  onModeChange?: (mode: "3d" | "map") => void;
  draft?: boolean;
  project: Project;
  readOnly: boolean;
  onOpenFile: (path: string) => void;
}) {
  const [selected, setSelected] = useState("baseplate"),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"build" | "bridge">("build");
  const [tool, setTool] = useState<ViewTool>("select"),
    [snap, setSnap] = useState(1),
    [frame, setFrame] = useState(0);
  useEffect(() => setTab("build"), [mode, draft]);
  const [showExplorer, setShowExplorer] = useState(true),
    [showProperties, setShowProperties] = useState(true);
  const parsed = useMemo(() => {
    try {
      return {
        scene: sceneSchema.parse(JSON.parse(project.files[SCENE_PATH] || "")),
        error: "",
      };
    } catch (e) {
      return {
        scene: null,
        error:
          "Scene tidak valid. Perbaiki scene.roblox.json atau pulihkan versi sebelumnya. " +
          (e instanceof Error ? e.message.slice(0, 180) : ""),
      };
    }
  }, [project.files[SCENE_PATH]]);
  const commit = (scene: RobloxScene, label: string) => {
    if (readOnly) return;
    try {
      sceneSchema.parse(scene);
      const json = JSON.stringify(scene, null, 2);
      if (json.length > 240000)
        throw new Error("Scene terlalu besar untuk satu file project.");
      useStore.getState().applyFiles(project.id, { [SCENE_PATH]: json }, label);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scene gagal disimpan.");
    }
  };
  const scene = parsed.scene;
  const current = scene?.objects.find((o) => o.id === selected);
  const add = (kind: SceneObject["kind"]) => {
    if (!scene) return;
    const o = newObject(kind);
    commit({ ...scene, objects: [...scene.objects, o] }, "Tambah " + kind);
    setSelected(o.id);
  };
  const nudge = (x: number, z: number) => {
    if (!scene || readOnly) return;
    try {
      commit(
        nudgeOnMap(scene, selected, x * (snap || 1), z * (snap || 1)),
        "Geser objek di canvas map",
      );
    } catch {
      setError("Perpindahan melampaui batas scene (±10.000 stud).");
    }
  };
  function tree(parent: string | null, depth = 0): React.ReactNode {
    return scene?.objects
      .filter((o) => o.parent === parent)
      .map((o) => (
        <div key={o.id}>
          <button
            title={o.name}
            style={{ paddingLeft: 12 + depth * 14 }}
            className={o.id === selected ? "selected" : ""}
            onClick={() => setSelected(o.id)}
            aria-pressed={o.id === selected}
          >
            {o.kind === "model" ? <Layers size={14} /> : <Box size={14} />}
            <span>{o.name}</span>
            <small>{o.kind}</small>
          </button>
          {tree(o.id, depth + 1)}
        </div>
      ));
  }
  return (
    <section className="rb-workbench" aria-label="Roblox 3D Builder">
      <header className="rb-top">
        <div className="rb-heading">
          <Box size={16} />
          <div>
            <strong>
              {tab === "bridge"
                ? "Koneksi Studio"
                : mode === "map"
                  ? "Canvas Map"
                  : "Preview 3D"}
            </strong>
            <span>Roblox / Workspace</span>
          </div>
        </div>
        <div className="rb-header-actions">
          {tab === "build" && (
            <div
              className="rb-panel-switches"
              role="group"
              aria-label="Panel scene"
            >
              <button
                aria-label="Tampilkan atau sembunyikan Explorer scene"
                title="Explorer scene"
                aria-pressed={showExplorer}
                onClick={() => setShowExplorer((v) => !v)}
              >
                <PanelLeft size={15} />
              </button>
              <button
                aria-label="Tampilkan atau sembunyikan properti scene"
                title="Properti scene"
                aria-pressed={showProperties}
                onClick={() => setShowProperties((v) => !v)}
              >
                <PanelRight size={15} />
              </button>
            </div>
          )}
          <button
            disabled={draft}
            onClick={() => setTab(tab === "bridge" ? "build" : "bridge")}
          >
            {tab === "bridge" ? <ArrowLeft size={14} /> : <Link2 size={14} />}
            {tab === "bridge" ? "Kembali ke scene" : "Hubungkan Studio"}
          </button>
        </div>
      </header>
      {tab === "bridge" ? (
        <StudioBridge
          project={project}
          readOnly={readOnly}
          onOpenFile={onOpenFile}
        />
      ) : (
        <>
          <div className="rb-scene-status" role="status">
            <span className="rb-live-dot" />
            <span>
              {draft
                ? "Usulan AI · belum disimpan · preview hanya baca"
                : "Hasil scene tersimpan · perubahan masuk Riwayat"}
            </span>
            <code>scene.roblox.json</code>
          </div>
          <div className="rb-tools">
            <span>Tambah</span>
            {(["block", "sphere", "cylinder", "model", "mesh"] as const).map(
              (k, i) => (
                <button
                  disabled={readOnly || !scene}
                  key={k}
                  onClick={() => add(k)}
                >
                  <Plus size={13} />
                  {["Balok", "Bola", "Silinder", "Model", "Mesh kosong"][i]}
                </button>
              ),
            )}
            <label className="rb-file">
              <Upload size={13} /> Impor OBJ
              <input
                disabled={readOnly || !scene}
                type="file"
                accept=".obj"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f || !scene) return;
                  try {
                    if (f.size > 1000000) throw new Error("OBJ maksimal 1 MB.");
                    const o = parseOBJ(await f.text());
                    commit(
                      { ...scene, objects: [...scene.objects, o] },
                      "Impor mesh OBJ",
                    );
                    setSelected(o.id);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Impor gagal");
                  }
                }}
              />
            </label>
          </div>
          <div className="rb-map-tools" aria-label="Alat scene Roblox">
            <div role="group" aria-label="Manipulasi objek">
              {(["select", "translate", "rotate", "scale"] as const).map(
                (t, i) => (
                  <button
                    key={t}
                    disabled={
                      t !== "select" &&
                      (readOnly ||
                        !current ||
                        (t === "scale" && current.kind === "model"))
                    }
                    aria-pressed={tool === t}
                    onClick={() => setTool(t)}
                  >
                    {(() => {
                      const Icon = [MousePointer2, Move, RotateCw, Scaling][i];
                      return <Icon size={14} />;
                    })()}
                    {["Pilih", "Geser", "Putar", "Ukuran"][i]}
                  </button>
                ),
              )}
            </div>
            <label>
              Snap{" "}
              <select
                aria-label="Snap grid"
                value={snap}
                onChange={(e) => setSnap(Number(e.target.value))}
              >
                {[0, 0.5, 1, 2, 4].map((n) => (
                  <option key={n} value={n}>
                    {n ? n + " stud" : "Bebas"}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => setFrame((n) => n + 1)}>
              Bingkai semua
            </button>
            {mode === "map" && (
              <div role="group" aria-label="Geser di map">
                {(
                  [
                    [-1, 0, "Kiri"],
                    [1, 0, "Kanan"],
                    [0, -1, "Atas"],
                    [0, 1, "Bawah"],
                  ] as const
                ).map(([x, z, label]) => (
                  <button
                    key={label}
                    aria-label={"Geser map " + label.toLowerCase()}
                    disabled={readOnly || !current}
                    onClick={() => nudge(x, z)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {(error || parsed.error) && (
            <p className="rb-error" role="alert">
              {error || parsed.error}
            </p>
          )}
          <div
            className={
              "rb-layout" +
              (!showExplorer ? " is-explorer-hidden" : "") +
              (!showProperties ? " is-properties-hidden" : "")
            }
          >
            {showExplorer && (
              <aside className="rb-explorer">
                <h3>
                  <span>EXPLORER</span>
                  <span>{scene?.objects.length || 0}</span>
                </h3>
                {scene?.objects.length ? (
                  tree(null)
                ) : (
                  <p>Belum ada objek. Tambahkan Part atau Model.</p>
                )}
                <button onClick={() => onOpenFile(SCENE_PATH)}>
                  Buka scene JSON
                </button>
              </aside>
            )}
            {scene ? (
              <Suspense fallback={<p>Memuat renderer 3D…</p>}>
                <SceneViewport
                  scene={scene}
                  selected={selected}
                  onSelect={setSelected}
                  mode={mode}
                  tool={tool}
                  snap={snap}
                  readOnly={readOnly}
                  frameRequest={frame + (draft ? 100000 : 0)}
                  onNudge={nudge}
                  onTransform={(objectId, values) =>
                    commit(
                      {
                        ...scene,
                        objects: scene.objects.map((o) =>
                          o.id === objectId ? { ...o, ...values } : o,
                        ),
                      },
                      "Transformasi objek di canvas",
                    )
                  }
                />
              </Suspense>
            ) : (
              <div className="rb-viewport">
                <p>Preview tidak dijalankan untuk scene yang tidak valid.</p>
              </div>
            )}
            {showProperties && (
              <aside className="rb-properties">
                <h3>PROPERTI</h3>
                {current && scene ? (
                  <ObjectProperties
                    key={current.id + JSON.stringify(current)}
                    object={current}
                    objects={scene.objects}
                    readOnly={readOnly}
                    onSave={(o) =>
                      commit(
                        {
                          ...scene,
                          objects: scene.objects.map((n) =>
                            n.id === o.id ? o : n,
                          ),
                        },
                        "Ubah " + o.name,
                      )
                    }
                    onDelete={() => {
                      if (
                        confirm(
                          "Hapus " +
                            current.name +
                            " beserta objek di dalamnya? Perubahan dapat dipulihkan di Riwayat.",
                        )
                      ) {
                        commit(
                          deleteObject(scene, current.id),
                          "Hapus " + current.name,
                        );
                        setSelected("");
                      }
                    }}
                  />
                ) : (
                  <p>Pilih objek di Explorer atau viewport.</p>
                )}
              </aside>
            )}
          </div>
          <footer className="rb-note">
            <span>
              {scene?.objects.length || 0}/250 objek · Stud ·{" "}
              {mode === "map" ? "Sumbu X / Z" : "Perspektif"}
            </span>
            <span title="Preview menampilkan geometri scene, bukan eksekusi Luau atau Play Test. Perubahan tersimpan ke Riwayat.">
              Preview geometri · bukan Play Test
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
function ObjectProperties({
  object,
  objects,
  readOnly,
  onSave,
  onDelete,
}: {
  object: SceneObject;
  objects: SceneObject[];
  readOnly: boolean;
  onSave: (o: SceneObject) => void;
  onDelete: () => void;
}) {
  const [o, set] = useState(object),
    [vertices, setVertices] = useState(
      object.mesh?.vertices.map((v) => v.join(" ")).join("\n") || "",
    ),
    [faces, setFaces] = useState(
      object.mesh?.faces.map((v) => v.join(" ")).join("\n") || "",
    ),
    [error, setError] = useState("");
  const vector = (key: "position" | "rotation" | "size", label: string) => (
    <label>
      {label}
      <div className="rb-vector">
        {["X", "Y", "Z"].map((axis, i) => (
          <input
            aria-label={`${label} ${axis}`}
            key={axis}
            type="number"
            step="0.1"
            required
            value={o[key][i]}
            onChange={(e) =>
              set({
                ...o,
                [key]: o[key].map((v, j) =>
                  j === i ? Number(e.target.value) : v,
                ),
              })
            }
          />
        ))}
      </div>
    </label>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const next = {
            ...o,
            ...(o.kind === "mesh"
              ? {
                  mesh: {
                    vertices: vertices
                      .trim()
                      .split(/\n/)
                      .filter(Boolean)
                      .map((l) => l.trim().split(/\s+/).map(Number)),
                    faces: faces
                      .trim()
                      .split(/\n/)
                      .filter(Boolean)
                      .map((l) => l.trim().split(/\s+/).map(Number)),
                  },
                }
              : {}),
          };
          const valid = sceneSchema.parse({
            version: 1,
            objects: objects.map((n) => (n.id === o.id ? next : n)),
          });
          onSave(valid.objects.find((n) => n.id === o.id)!);
          setError("");
        } catch {
          setError(
            "Periksa angka, parent, dan indeks mesh. Face memakai tiga indeks vertex berbeda mulai dari 0.",
          );
        }
      }}
    >
      <fieldset disabled={readOnly}>
        <label>
          Nama
          <input
            value={o.name}
            maxLength={80}
            required
            onChange={(e) => set({ ...o, name: e.target.value })}
          />
        </label>
        <label>
          Parent
          <select
            value={o.parent || ""}
            onChange={(e) => set({ ...o, parent: e.target.value || null })}
          >
            <option value="">Workspace</option>
            {objects
              .filter((n) => n.kind === "model" && n.id !== o.id)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
          </select>
        </label>
        {vector("position", "Posisi")}
        {vector("rotation", "Rotasi °")}
        {o.kind !== "model" && (
          <>
            {vector("size", "Ukuran")}
            <label>
              Warna
              <input
                type="color"
                value={o.color}
                onChange={(e) => set({ ...o, color: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={o.anchored}
                onChange={(e) => set({ ...o, anchored: e.target.checked })}
              />{" "}
              Anchored
            </label>
          </>
        )}
        {o.kind === "mesh" && (
          <details open>
            <summary>Editor mesh dasar</summary>
            <p>
              Ubah vertex dan susun segitiga. Koordinat lokal; face memakai
              indeks mulai dari 0.
            </p>
            <label>
              Vertices · X Y Z per baris
              <textarea
                aria-label="Vertices mesh"
                rows={6}
                value={vertices}
                onChange={(e) => setVertices(e.target.value)}
              />
            </label>
            <label>
              Faces · tiga indeks per baris
              <textarea
                aria-label="Faces mesh"
                rows={4}
                value={faces}
                onChange={(e) => setFaces(e.target.value)}
              />
            </label>
          </details>
        )}
        {error && (
          <p role="alert" className="rb-error">
            {error}
          </p>
        )}
        <button className="rb-primary" type="submit">
          Simpan properti
        </button>
        <button type="button" onClick={onDelete}>
          <Trash2 size={14} /> Hapus objek
        </button>
      </fieldset>
      {object.mesh && (
        <button
          type="button"
          onClick={() =>
            downloadText("piwu-mesh.obj", meshOBJ(object), "text/plain")
          }
        >
          <Download size={14} /> Ekspor OBJ tersimpan
        </button>
      )}
    </form>
  );
}
