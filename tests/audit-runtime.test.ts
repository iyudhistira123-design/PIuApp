import test from "node:test";
import assert from "node:assert/strict";
import { SandboxProvider } from "../server/providers/sandbox.mjs";
import { check } from "../server/lib/core.mjs";
function sandboxFixture() {
  const provider = new SandboxProvider({});
  const commands: string[] = [];
  let kills = 0,
    reads = 0,
    probeCode = 0,
    installCode = 0;
  const process = {
    kill: async () => {
      kills++;
      return true;
    },
  };
  const entry: any = {
    expires: Date.now() + 60000,
    box: {
      commands: {
        run: async (command: string, options: any) => {
          commands.push(command);
          if (options?.background) return process;
          if (command.startsWith("node -e"))
            return {
              exitCode: probeCode,
              stdout: '{"src/App.tsx":"export default 1"}',
            };
          return { exitCode: installCode, stdout: "done", stderr: "" };
        },
      },
      getHost: () => "fixture.e2b.test",
      files: {
        read: async () => {
          reads++;
          return '{"dependencies":{}}';
        },
      },
      kill: async () => {
        kills++;
      },
    },
  };
  provider.sessions.set("u:p", entry);
  provider.forProject = async () => entry;
  return {
    provider,
    entry,
    commands,
    kills: () => kills,
    reads: () => reads,
    failProbe: () => (probeCode = 1),
    failInstall: () => (installCode = 1),
  };
}
test("sandbox returns preview URL only after HTTP check and kills failed startup", async () => {
  const f = sandboxFixture();
  const result = await f.provider.preview("u", "p", {});
  assert.match(result.url, /^https:/);
  assert.ok(
    f.commands.some((c) => c.includes("127.0.0.1:5173") && c.includes("r.ok")),
  );
  await f.provider.preview("u", "p", {});
  assert.equal(f.kills(), 1);
  f.failProbe();
  await assert.rejects(f.provider.preview("u", "p", {}), /belum siap/);
  assert.equal(f.kills(), 3);
  assert.equal(f.entry.previewProcess, null);
  assert.equal(f.provider.busy.size, 0);
});
test("sandbox holds exclusive lock through startup; reads and stop cannot race", async () => {
  const f = sandboxFixture();
  let release: () => void = () => {};
  let started: () => void = () => {};
  const waiting = new Promise<void>((r) => (started = r));
  f.provider.waitForHTTP = async () => {
    started();
    await new Promise<void>((r) => (release = r));
  };
  const opening = f.provider.preview("u", "p", {});
  await waiting;
  await assert.rejects(f.provider.snapshot("u", "p"), /operasi lain/);
  await assert.rejects(f.provider.stop("u", "p"), /operasi lain/);
  await assert.rejects(
    f.provider.install("u", "p", {}, "react"),
    /operasi lain/,
  );
  release();
  await opening;
  assert.equal(f.provider.busy.size, 0);
});
test("failed dependency operation returns no fabricated manifest and uninstall disables lifecycle scripts", async () => {
  const f = sandboxFixture();
  f.failInstall();
  const result = await f.provider.install("u", "p", {}, "some-package", true);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.files, {});
  assert.equal(f.reads(), 0);
  assert.match(f.commands[0], /uninstall --ignore-scripts/);
});
test("missing PostgREST relation maps to schema activation error, not generic server failure", () => {
  assert.throws(
    () => check({ error: { code: "PGRST205" } }),
    (e: any) => e.status === 503 && e.message.includes("001–006"),
  );
});

test("workspace pane preferences tolerate blocked storage and clamp corrupt widths", async () => {
  const { readPaneWidth } = await import("../src/workspace/preferences.ts");
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => "Infinity" },
    });
    assert.equal(readPaneWidth("x", 195, 160, 400), 195);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => "9999999" },
    });
    assert.equal(readPaneWidth("x", 195, 160, 400), 400);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    assert.equal(readPaneWidth("x", 195, 160, 400), 195);
  } finally {
    if (old) Object.defineProperty(globalThis, "localStorage", old);
    else delete (globalThis as any).localStorage;
  }
});

test("business scaffolds contain no fabricated revenue, orders, cart or contact address; ZIP can build with Vite", async () => {
  const { starterFiles } = await import("../src/lib/templates.ts");
  const { transform } = await import("sucrase");
  for (const kind of ["dashboard", "shop", "pos", "studio"]) {
    const files = starterFiles(
      kind,
      'Nama </title><script>throw Error("x")</script>',
    );
    const source = files["src/App.tsx"];
    assert.doesNotThrow(() =>
      transform(source, { transforms: ["typescript", "jsx", "imports"] }),
    );
    assert.doesNotMatch(
      source,
      /Rp24\.500\.000|Pesanan · 128|setCount|mailto:halo@example/,
    );
    if (kind !== "studio") assert.match(source, /tidak disimulasikan/);
    assert.ok(!files["index.html"].includes("<script>throw Error"));
    assert.equal(JSON.parse(files["package.json"]).scripts.build, "vite build");
  }
});
