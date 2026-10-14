import { useState } from "react";
import {
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
export function FileIcon({ path }: { path: string }) {
  return path.endsWith(".json") ? (
    <FileJson size={14} className="file-json" />
  ) : path.endsWith(".md") ? (
    <FileText size={14} className="file-md" />
  ) : (
    <FileCode2
      size={14}
      className={path.endsWith(".css") ? "file-css" : "file-ts"}
    />
  );
}
export default function FileExplorer({
  files,
  active,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  changed,
  readOnly = false,
}: {
  files: Record<string, string>;
  active: string;
  onOpen: (p: string, line?: number) => void;
  onCreate: (p: string) => void;
  onRename: (p: string, n: string) => void;
  onDelete: (p: string) => void;
  changed: string[];
  readOnly?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useState<string[]>([]);
  const [context, setContext] = useState("");
  const [newFile, setNewFile] = useState(false);
  const [path, setPath] = useState("");
  const [renaming, setRenaming] = useState("");
  const [rename, setRename] = useState("");
  const paths = Object.keys(files)
    .filter((p) => p.toLowerCase().includes(search.toLowerCase()))
    .sort();
  const dirs = [
    ...new Set(
      paths
        .filter((p) => p.includes("/"))
        .map((p) => p.substring(0, p.lastIndexOf("/"))),
    ),
  ];
  function file(p: string) {
    return (
      <div className="file-row-wrap" key={p}>
        <button
          className={"file-row " + (active === p ? "active" : "")}
          onClick={() => onOpen(p)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!readOnly) setContext(context === p ? "" : p);
          }}
          style={{ paddingLeft: p.includes("/") ? 28 : 13 }}
        >
          <FileIcon path={p} />
          <span>{p.split("/").pop()}</span>
          {changed.includes(p) && <i className="changed-dot" />}
          <span
            className="file-more"
            onClick={(e) => {
              e.stopPropagation();
              if (!readOnly) setContext(context === p ? "" : p);
            }}
          >
            <MoreHorizontal size={12} />
          </span>
        </button>
        {context === p && (
          <div className="file-context">
            <button
              onClick={() => {
                setRenaming(p);
                setRename(p);
                setContext("");
              }}
            >
              <Pencil size={12} />
              Ganti nama
            </button>
            <button
              className="danger"
              onClick={() => {
                onDelete(p);
                setContext("");
              }}
            >
              <Trash2 size={12} />
              Hapus file
            </button>
          </div>
        )}
        {renaming === p && (
          <form
            className="file-new-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (rename.trim()) {
                onRename(p, rename.trim());
                setRenaming("");
              }
            }}
          >
            <input
              autoFocus
              value={rename}
              onChange={(e) => setRename(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setRenaming("")}
            />
            <button aria-label="Simpan nama">↵</button>
          </form>
        )}
      </div>
    );
  }
  return (
    <>
      <div className="ws-panel-heading">
        <span>EXPLORER</span>
        <button
          className="ws-icon"
          aria-label="Buat file"
          disabled={readOnly}
          onClick={() => setNewFile(!newFile)}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="file-search">
        <Search size={12} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari file…"
          aria-label="Cari file"
        />
      </div>
      <div className="file-root">
        <ChevronDown size={12} />
        <span>PROJECT</span>
        <span>{Object.keys(files).length}</span>
      </div>
      {newFile && (
        <form
          className="file-new-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (path.trim()) {
              onCreate(path.trim());
              setNewFile(false);
              setPath("");
            }
          }}
        >
          <input
            placeholder="src/komponen.tsx"
            autoFocus
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <button aria-label="Buat file">↵</button>
          <button
            type="button"
            aria-label="Batal"
            onClick={() => setNewFile(false)}
          >
            <X size={12} />
          </button>
        </form>
      )}
      <div className="file-tree">
        {dirs.map((dir) => (
          <div key={dir}>
            <button
              className="folder-row"
              onClick={() =>
                setClosed(
                  closed.includes(dir)
                    ? closed.filter((d) => d !== dir)
                    : [...closed, dir],
                )
              }
            >
              {closed.includes(dir) ? (
                <ChevronRight size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
              <FolderOpen size={14} />
              {dir}
            </button>
            {!closed.includes(dir) &&
              paths
                .filter((p) => p.substring(0, p.lastIndexOf("/")) === dir)
                .map(file)}
          </div>
        ))}
        {paths.filter((p) => !p.includes("/")).map(file)}
        {!paths.length && (
          <p className="ws-empty-text">Tidak ada file yang cocok.</p>
        )}
      </div>
      <div className="explorer-bottom">
        <span className="memory-dot" /> PIWU.md selalu menjadi konteks AI
      </div>
    </>
  );
}
