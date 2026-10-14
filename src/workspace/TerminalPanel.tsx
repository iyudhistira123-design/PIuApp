import { useIDETheme, type IDETheme } from "./IDETheme";
const terminalThemes = {
  dark: {
    background: "#181b20",
    foreground: "#e2e7ef",
    cursor: "#e2e7ef",
    green: "#9ad7b3",
    blue: "#82baff",
    red: "#ffb2b0",
    yellow: "#efcf87",
    black: "#181b20",
    magenta: "#c5b5f3",
    cyan: "#8bcfda",
    white: "#d4dce8",
    brightBlack: "#a0adbf",
    brightRed: "#ffc3c2",
    brightGreen: "#aff0c9",
    brightYellow: "#f5dfa6",
    brightBlue: "#a0caff",
    brightMagenta: "#dcc8ff",
    brightCyan: "#b0e6ef",
    brightWhite: "#f4f6fa",
    cursorAccent: "#181b20",
    selectionBackground: "#345579",
  },
  light: {
    background: "#f4f6f8",
    foreground: "#222c3a",
    cursor: "#222c3a",
    green: "#246240",
    blue: "#075fa9",
    red: "#ac3038",
    yellow: "#7c5714",
    black: "#17202a",
    magenta: "#744f9f",
    cyan: "#006a7a",
    white: "#4b5563",
    brightBlack: "#637083",
    brightRed: "#b82336",
    brightGreen: "#247047",
    brightYellow: "#855d13",
    brightBlue: "#0b66bc",
    brightMagenta: "#7952a8",
    brightCyan: "#006b81",
    brightWhite: "#17202a",
    cursorAccent: "#f4f6f8",
    selectionBackground: "#c9dffc",
  },
};
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api, projectApi } from "../services/api";
import { useStore } from "../lib/store";
export default function TerminalPanel({
  projectId,
  files,
}: {
  projectId: string;
  files: Record<string, string>;
}) {
  const { theme } = useIDETheme();
  const terminalRef = useRef<Terminal | null>(null);
  const themeRef = useRef<IDETheme>(theme);
  themeRef.current = theme;
  useEffect(() => {
    if (terminalRef.current)
      terminalRef.current.options.theme = terminalThemes[theme];
  }, [theme]);
  const ref = useRef<HTMLDivElement>(null),
    latest = useRef(files);
  latest.current = files;
  const [remote, setRemote] = useState(false);
  const kind = useStore(
    (s) => s.projects.find((p) => p.id === projectId)?.kind || "webapp",
  );
  const user = useStore((s) => s.user),
    role = useStore((s) => s.sync[projectId]?.role);
  useEffect(() => {
    let alive = true;
    void api("/status")
      .then((s) => {
        if (alive)
          setRemote(
            Boolean(
              s.capabilities.sandbox &&
              kind === "webapp" &&
              user &&
              !user.demo &&
              role !== "Viewer",
            ),
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.id, role, kind]);
  useEffect(() => {
    const terminal = new Terminal({
      theme: terminalThemes[themeRef.current],
      fontSize: 12,
      lineHeight: 1.4,
      fontFamily: '"JetBrains Mono",monospace',
      cols: 95,
      rows: 10,
      convertEol: true,
      cursorBlink: true,
    });
    terminalRef.current = terminal;
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(ref.current!);
    const resizeObserver = new ResizeObserver(() => {
      if (ref.current?.clientWidth && ref.current?.clientHeight) fitAddon.fit();
    });
    resizeObserver.observe(ref.current!);
    fitAddon.fit();
    terminal.writeln(
      "\x1b[32mPiwuApp · " +
        (remote ? "Shell E2B terisolasi" : "Shell belum tersedia") +
        "\x1b[0m",
    );
    terminal.writeln(
      kind !== "webapp"
        ? kind === "roblox"
          ? "Terminal ini khusus Web App. Jalankan Luau dan Play Test di Roblox Studio."
          : "Terminal ini khusus Web App. Jalankan source native melalui Expo di perangkat Anda."
        : remote
          ? "Perintah nyata · 1 kredit/eksekusi · batas 90 detik · tanpa secrets server. Shell non-interaktif; gunakan panel Paket untuk preview."
          : "Hubungkan sandbox E2B dan sinkronkan project untuk menjalankan perintah. Tidak ada shell simulasi.",
    );
    const prompt = () => terminal.write("\r\n\x1b[34m~/project\x1b[0m $ ");
    prompt();
    let command = "",
      busy = false,
      alive = true;
    const data = terminal.onData(async (c) => {
      if (busy) return;
      if (c === "\r") {
        terminal.writeln("");
        const text = command.trim();
        command = "";
        if (!text) {
          prompt();
          return;
        }
        const [cmd] = text.split(" ");
        if (cmd === "clear") {
          terminal.clear();
          prompt();
          return;
        }
        if (remote) {
          busy = true;
          try {
            const result = await projectApi(projectId, "sandbox/command", {
              command: text,
            });
            if (alive) {
              terminal.writeln(
                result.output.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, ""),
              );
              terminal.writeln("Exit " + result.exitCode);
            }
          } catch (e) {
            if (alive)
              terminal.writeln(
                e instanceof Error ? e.message : "Eksekusi gagal.",
              );
          } finally {
            busy = false;
            if (alive) prompt();
          }
        } else {
          terminal.writeln(
            "Perintah tidak dijalankan. Sandbox belum tersedia atau akses Anda hanya baca.",
          );
          prompt();
        }
      } else if (c === "\u007f") {
        if (command.length) {
          command = command.slice(0, -1);
          terminal.write("\b \b");
        }
      } else if (c === "\u0003") {
        command = "";
        terminal.writeln("^C");
        prompt();
      } else if (c.charCodeAt(0) >= 32 && command.length < 4000) {
        command += c.replace(/[\r\n]/g, " ");
        terminal.write(c.replace(/[\r\n]/g, " "));
      }
    });
    return () => {
      alive = false;
      data.dispose();
      resizeObserver.disconnect();
      terminalRef.current = null;
      terminal.dispose();
    };
  }, [projectId, remote, kind]);
  return <div className="terminal-container" ref={ref} />;
}
