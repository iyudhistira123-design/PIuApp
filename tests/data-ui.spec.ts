import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
// UI contracts use an injected in-memory repository. SQL authorization and
// transactions are tested on PostgreSQL separately; this is not live Supabase.
async function fixture(page: Page, role = "Editor") {
  await page.goto("/");
  await page.evaluate(async (role) => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const { createRoot } = (
      await import("/node_modules/.vite/deps/react-dom_client.js")
    ).default;
    const { default: Panel } =
      await import("/src/workspace/CloudDataPanel.tsx");
    const apiPath =
      performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => new URL(n).pathname === "/src/services/api.ts") ||
      "/src/services/api.ts";
    const { APIError } = await import(apiPath);
    const id = crypto.randomUUID(),
      project = crypto.randomUUID();
    const server = {
      tables: [
        {
          id,
          name: "Produk",
          revision: 1,
          columns: [
            { key: "nama", label: "Nama", type: "text" },
            { key: "harga", label: "Harga", type: "number" },
          ],
          rows: [
            { id: crypto.randomUUID(), values: { nama: "Kopi", harga: 25000 } },
          ],
        },
      ],
      fail: false,
    };
    const repo = {
      async list() {
        return server.tables.map(({ id, name, revision }) => ({
          id,
          name,
          revision,
        }));
      },
      async get(id: string) {
        const found = server.tables.find((t) => t.id === id);
        if (!found)
          throw new APIError("Tabel sudah dihapus.", 404, "DATA_NOT_FOUND");
        return structuredClone(found);
      },
      async save(table: any) {
        if (server.fail)
          throw new APIError(
            "Jaringan tidak tersedia; draft belum disimpan.",
            502,
            "DATA_UNAVAILABLE",
          );
        const old = server.tables.find((t) => t.id === table.id);
        if ((old?.revision || 0) !== table.revision)
          throw new APIError("Tabel berubah di cloud.", 409, "DATA_CONFLICT");
        const saved = structuredClone({
          ...table,
          revision: table.revision + 1,
        });
        server.tables = server.tables
          .filter((t) => t.id !== table.id)
          .concat(saved);
        return saved;
      },
      async remove(id: string, revision: number) {
        const old = server.tables.find((t) => t.id === id);
        if (old?.revision !== revision)
          throw new APIError("Konflik revisi.", 409, "DATA_CONFLICT");
        server.tables = server.tables.filter((t) => t.id !== id);
      },
    };
    document.getElementById("root")!.style.display = "none";
    const host = document.createElement("main");
    host.id = "data-fixture";
    host.style.cssText = "background:#11151b;min-height:100vh;padding:24px";
    document.body.append(host);
    const root = createRoot(host);
    const render = (account = "account-a", access = role) =>
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(Panel, {
            key: account,
            account,
            projectId: project,
            role: access,
            repository: repo,
          }),
        ),
      );
    (window as any).__dataFixture = { server, render, project };
    render();
  }, role);
  await expect(
    page.locator("#data-fixture").getByLabel("Nama baris 1"),
  ).toHaveValue("Kopi");
  return page.locator("#data-fixture");
}
test("cloud data UI saves typed rows and never treats draft as committed", async ({
  page,
}) => {
  const panel = await fixture(page);
  await panel.getByLabel("Harga baris 1").fill("27000");
  await expect(
    panel.getByText("Draft · belum disimpan", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).__dataFixture.server.tables[0].rows[0].values.harga,
    ),
  ).toBe(25000);
  await panel
    .getByRole("button", { name: "Simpan ke cloud", exact: true })
    .click();
  await expect(
    panel.getByRole("status").filter({ hasText: "Tersimpan di cloud" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).__dataFixture.server.tables[0].rows[0].values.harga,
    ),
  ).toBe(27000);
  await expect(
    panel.getByRole("button", { name: "Simpan ke cloud", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Hapus tabel cloud" }),
  ).toHaveCount(0);
});
test("Viewer cannot edit data, columns, import or save", async ({ page }) => {
  const panel = await fixture(page, "Viewer");
  await expect(panel.getByLabel("Nama baris 1")).toBeDisabled();
  for (const name of [
    "Buat tabel",
    "Impor JSON",
    "Tambah kolom",
    "Tambah baris",
    "Simpan ke cloud",
  ])
    await expect(
      panel.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Ekspor JSON" }),
  ).toBeEnabled();
  await expect(
    panel.getByRole("button", { name: "Hapus tabel cloud" }),
  ).toHaveCount(0);
});
test("conflict preserves edits and save-as-new preserves both tables", async ({
  page,
}) => {
  const panel = await fixture(page);
  await panel.getByLabel("Harga baris 1").fill("29000");
  await page.evaluate(() => {
    const s = (window as any).__dataFixture.server;
    s.tables[0].revision = 2;
    s.tables[0].rows[0].values.harga = 28000;
  });
  await panel
    .getByRole("button", { name: "Simpan ke cloud", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("Tabel berubah");
  await expect(panel.getByLabel("Harga baris 1")).toHaveValue("29000");
  await panel
    .getByRole("button", { name: "Simpan sebagai tabel baru" })
    .click();
  await expect(
    panel.getByRole("status").filter({ hasText: "Tersimpan di cloud" }),
  ).toBeVisible();
  const rows = await page.evaluate(() =>
    (window as any).__dataFixture.server.tables.map(
      (t: any) => t.rows[0].values.harga,
    ),
  );
  expect(rows.sort()).toEqual([28000, 29000]);
});
test("failed writes persist account-scoped drafts without silently submitting them", async ({
  page,
}) => {
  const panel = await fixture(page);
  await panel.getByLabel("Harga baris 1").fill("31000");
  await page.evaluate(() => ((window as any).__dataFixture.server.fail = true));
  await panel
    .getByRole("button", { name: "Simpan ke cloud", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "Jaringan tidak tersedia",
  );
  await page.evaluate(() => (window as any).__dataFixture.render("account-b"));
  await expect(panel.getByLabel("Harga baris 1")).toHaveValue("25000");
  await page.evaluate(() => (window as any).__dataFixture.render("account-a"));
  await expect(panel.getByLabel("Harga baris 1")).toHaveValue("31000");
  await expect(
    panel.getByRole("button", { name: "Simpan ke cloud", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => (window as any).__dataFixture.server.tables[0].rows[0].values.harga,
    ),
  ).toBe(25000);
});
