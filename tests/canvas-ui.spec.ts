import { realAccountFixture, loginRealFixture } from "./helpers-real";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function workspace(page: Page) {
  // Public configuration is a fixture; these tests do not contact Supabase.
  await page.route("**/api/public/site", (r) =>
    r.fulfill({ json: { configured: false, settings: {}, broadcasts: [] } }),
  );
  await realAccountFixture(page);
  await page.goto("/login");
  await loginRealFixture(page);
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page
    .getByPlaceholder("Buat website portfolio untuk studio desain saya…")
    .fill("Studio Canvas");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  await expect(
    page.locator('iframe[title="Live preview aplikasi Anda"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hentikan respons" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator(".cv-frame")).toHaveCount(3);
}
test("canvas responsive frames, keyboard move, undo/redo, zoom, resize and persistence", async ({
  page,
}) => {
  await workspace(page);
  await expect(
    page.frameLocator('iframe[title="Canvas Desktop"]').locator("h1"),
  ).toBeVisible();
  await page.screenshot({
    path: ".artifacts/canvas-desktop.png",
    fullPage: true,
  });
  const first = page.getByRole("button", {
    name: "Pindahkan frame Desktop",
    exact: true,
  });
  await first.focus();
  await first.press("ArrowRight");
  await expect(
    page.getByRole("region", { name: "Frame Desktop", exact: true }),
  ).toHaveCSS("left", "8px");
  await page.getByRole("button", { name: "Urungkan layout canvas" }).click();
  await expect(
    page.getByRole("region", { name: "Frame Desktop", exact: true }),
  ).toHaveCSS("left", "0px");
  await page.getByRole("button", { name: "Ulangi layout canvas" }).click();
  await expect(
    page.getByRole("region", { name: "Frame Desktop", exact: true }),
  ).toHaveCSS("left", "8px");
  const oldZoom = await page.getByLabel("Zoom canvas").textContent();
  await page.getByRole("button", { name: "Perbesar canvas" }).click();
  expect(await page.getByLabel("Zoom canvas").textContent()).not.toBe(oldZoom);
  await page.getByRole("button", { name: "Sesuaikan semua frame" }).click();
  await page
    .getByRole("button", { name: "Properti frame", exact: true })
    .click();
  await page.getByLabel("Lebar frame", { exact: true }).fill("1440");
  await page.getByLabel("Lebar frame", { exact: true }).press("Enter");
  await expect(
    page.getByRole("region", { name: "Frame Desktop", exact: true }),
  ).toHaveCSS("width", "1440px");
  await page.getByLabel("Nama frame", { exact: true }).fill("Beranda lebar");
  await page.getByLabel("Nama frame", { exact: true }).press("Enter");
  await expect(
    page.getByText("Layout tersimpan lokal", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(
    page.locator('iframe[title="Canvas Beranda lebar"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Frame Beranda lebar", exact: true }),
  ).toHaveCSS("width", "1440px");
  await page.getByLabel("Jenis frame baru").selectOption("mobile");
  await page.getByRole("button", { name: "Tambah frame", exact: true }).click();
  await expect(page.locator(".cv-frame")).toHaveCount(4);
  await page.getByRole("button", { name: "Urungkan layout canvas" }).click();
  await expect(page.locator(".cv-frame")).toHaveCount(3);
});
test("clean code workbench preserves tabs, command palette, preview and panel shortcuts", async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
  await page.screenshot({
    path: ".artifacts/workbench-code.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Cari perintah atau file", exact: true })
    .click();
  await page.getByPlaceholder("Cari perintah atau file…").fill("canvas");
  await page.getByRole("button", { name: "Buka canvas responsif" }).click();
  await expect(page.locator(".cv-panel")).toBeVisible();
  await page.keyboard.press("Control+j");
  await expect(page.locator(".bottom-panel")).toBeVisible();
  await page.keyboard.press("Control+j");
  await expect(page.locator(".bottom-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.locator('iframe[title="Live preview aplikasi Anda"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page
    .getByRole("button", { name: "Tutup src/App.tsx", exact: true })
    .click();
  await expect(
    page.getByText("Buka file dari explorer.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "App.tsx", exact: true }).click();
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
});
test("canvas mobile navigation, safe iframe sandbox and accessible controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".ws-chat")).toHaveCount(0);
  for (const iframe of await page.locator(".cv-frame iframe").all())
    await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  await page
    .getByRole("button", { name: "Properti frame", exact: true })
    .click();
  await page.getByRole("button", { name: "Duplikasi", exact: true }).click();
  await expect(page.locator(".cv-frame")).toHaveCount(4);
  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(page.locator(".cv-frame")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Properti frame", exact: true })
    .click();
  await page.screenshot({
    path: ".artifacts/canvas-mobile.png",
    fullPage: true,
  });
  const results = await new AxeBuilder({ page })
    .include(".cv-panel")
    .disableRules(["frame-tested"])
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Tampilkan explorer", exact: true })
    .click();
  await expect(page.locator(".ws-explorer")).toBeVisible();
  await page.getByRole("button", { name: "App.tsx", exact: true }).click();
  await expect(page.locator(".ws-explorer")).toHaveCount(0);
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
});

test("canvas pointer drag, panning, interaction and immediate local persistence", async ({
  page,
}) => {
  await workspace(page);
  const handle = page.getByRole("button", {
    name: "Pindahkan frame Desktop",
    exact: true,
  });
  const rect = (await handle.boundingBox())!;
  await page.mouse.move(rect.x + 40, rect.y + 14);
  await page.mouse.down();
  await page.mouse.move(rect.x + 120, rect.y + 54, { steps: 10 });
  await page.mouse.up();
  const frame = page.getByRole("region", {
    name: "Frame Desktop",
    exact: true,
  });
  const x = await frame.evaluate((el) => getComputedStyle(el).left);
  expect(x).not.toBe("0px");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(frame).toHaveCSS("left", x);
  const world = page.locator(".cv-world"),
    before = await world.evaluate((el) => getComputedStyle(el).transform);
  const area = (await page.locator(".cv-stage").boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + 90);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 + 75, area.y + 145, {
    steps: 8,
  });
  await page.mouse.up();
  expect(await world.evaluate((el) => getComputedStyle(el).transform)).not.toBe(
    before,
  );
  await page
    .getByLabel("Pusatkan frame")
    .selectOption((await frame.getAttribute("data-frame-id")) as string);
  await page.getByRole("button", { name: "Interaksi", exact: true }).click();
  await expect(
    page.locator(".cv-frame.selected .cv-frame-document"),
  ).not.toHaveAttribute("inert", "");
  const preview = page.frameLocator('iframe[title="Canvas Desktop"]');
  await preview.getByRole("button", { name: /Jelajahi karya/ }).click();
  await expect
    .poll(() =>
      preview
        .locator("body")
        .evaluate((el) => el.ownerDocument.defaultView!.scrollY),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Hentikan interaksi", exact: true })
    .click();
  await expect(
    page.locator(".cv-frame.selected .cv-frame-document"),
  ).toHaveAttribute("inert", "");
});

test("canvas frame cap, storage error, recovery and editor chrome accessibility", async ({
  page,
}) => {
  await workspace(page);
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Tambah frame", exact: true })
      .click();
  await expect(page.locator(".cv-frame")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Tambah frame", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).__restoreCanvasStorage = () =>
      (Storage.prototype.setItem = original);
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("piwu-canvas-v1:"))
        throw new DOMException("Quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page
    .getByRole("button", { name: "Properti frame", exact: true })
    .click();
  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Layout belum tersimpan");
  await expect(page.locator(".cv-frame")).toHaveCount(5);
  await page.evaluate(() => (window as any).__restoreCanvasStorage());
  await page.getByRole("button", { name: "Simpan ulang", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const result = await new AxeBuilder({ page })
    .include(".workspace")
    .exclude("iframe")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        message: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});
