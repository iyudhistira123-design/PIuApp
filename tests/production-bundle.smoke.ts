import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
test("production assets: landing/auth gate, lazy Monaco, actual TypeScript worker, diff and undo", async ({
  page,
  request,
}) => {
  const status = await request.get("/api/status");
  expect((await status.json()).production).toBe(true);
  const errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  expect(requests.some((p) => p.includes("/assets/CodeEditor-"))).toBe(false);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(
    page.getByRole("heading", { name: "Senang bertemu Anda." }),
  ).toBeVisible();
  const files = readdirSync("dist/assets"),
    file = files.find((n) => /^CodeEditor-.*\.js$/.test(n))!,
    css = files.find((n) => /^CodeEditor-.*\.css$/.test(n))!;
  // Exercise the actual built vendor API in a test-only DOM mount. No auth/provider fixture or bypass.
  const result = await page.evaluate(
    async ({ file, css }) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/assets/" + css;
      document.head.append(link);
      const module = await import("/assets/" + file);
      const monaco: any = Object.values(module).find(
        (m: any) => m?.editor?.create && m?.languages,
      );
      if (!monaco) throw new Error("Built Monaco API missing");
      const host = document.createElement("div");
      host.style.cssText = "width:700px;height:350px";
      document.body.append(host);
      const model = monaco.editor.createModel(
        "const value: number = 1;",
        "typescript",
        monaco.Uri.parse("file:///smoke.ts"),
      );
      const editor = monaco.editor.create(host, {
        model,
        theme: "piwu-workbench-light",
        minimap: { enabled: false },
      });
      model.pushStackElement();
      editor.executeEdits("smoke", [
        { range: model.getFullModelRange(), text: "const value: number = 2;" },
      ]);
      model.pushStackElement();
      await model.undo();
      const undo = model.getValue() === "const value: number = 1;";
      // Language services register asynchronously after the first TS model activates.
      let service: any;
      const deadline = performance.now() + 10000;
      while (!service && performance.now() < deadline) {
        try {
          const worker =
            await monaco.languages.typescript.getTypeScriptWorker();
          service = await worker(model.uri);
        } catch (e) {
          if (!String(e).includes("not registered")) throw e;
          await new Promise((r) => setTimeout(r, 25));
        }
      }
      if (!service) throw new Error("TypeScript worker registration timed out");
      const diagnostics = await service.getSyntacticDiagnostics(
        model.uri.toString(),
      );
      const find = Boolean(editor.getAction("actions.find"));
      const lua = monaco.languages
        .getLanguages()
        .some((l: any) => l.id === "lua");
      editor.dispose();
      model.dispose();
      const original = monaco.editor.createModel("before", "plaintext"),
        modified = monaco.editor.createModel("after", "plaintext");
      const diff = monaco.editor.createDiffEditor(host, {
        theme: "piwu-workbench",
      });
      diff.setModel({ original, modified });
      const diffWorks = diff.getModifiedEditor().getValue() === "after";
      diff.dispose();
      original.dispose();
      modified.dispose();
      host.remove();
      return { undo, find, lua, diffWorks, syntaxErrors: diagnostics.length };
    },
    { file, css },
  );
  expect(result).toEqual({
    undo: true,
    find: true,
    lua: true,
    diffWorks: true,
    syntaxErrors: 0,
  });
  expect(errors).toEqual([]);
});
