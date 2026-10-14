import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { realAccountFixture, loginRealFixture } from "./helpers-real";

test("Roblox workbench: light/dark theme across scene, code, terminal and dialogs without changing files", async ({
  page,
}) => {
  const fixture = await realAccountFixture(page, false);
  await loginRealFixture(page);
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page.getByRole("radio", { name: /Roblox Game/ }).check();
  await page
    .getByPlaceholder("Buat game Roblox tentang…")
    .fill("Studio Arsitektur");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  const workbench = page.getByRole("region", { name: "Roblox 3D Builder" });
  await expect(workbench).toBeVisible();
  await expect(
    page.getByLabel("Preview 3D hasil scene Roblox", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Balok", exact: true }).click();
  await page.getByLabel("Nama", { exact: true }).fill("Menara observasi");
  await page.getByLabel("Ukuran Y", { exact: true }).fill("12");
  await page.getByLabel("Posisi Y", { exact: true }).fill("6");
  await page
    .getByRole("button", { name: "Simpan properti", exact: true })
    .click();
  await expect
    .poll(
      () =>
        Object.values(fixture.rows.values().next().value?.payload.files || {})
          .length,
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        JSON.parse(
          [...fixture.rows.values()][0].payload.files["scene.roblox.json"],
        ).objects.length,
    )
    .toBe(2);
  const files = structuredClone([...fixture.rows.values()][0].payload.files);
  await page.screenshot({ path: ".artifacts/roblox-clean-dark.png" });
  await page
    .getByRole("button", { name: "Aktifkan mode terang", exact: true })
    .click();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await expect(page.locator(".rb-properties")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".ws-chat")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.screenshot({ path: ".artifacts/roblox-clean-light.png" });
  expect(
    (await new AxeBuilder({ page }).include(".rb-workbench").analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Tampilkan atau sembunyikan properti scene" })
    .click();
  await expect(page.locator(".rb-properties")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Tampilkan atau sembunyikan Explorer scene" })
    .click();
  await expect(page.locator(".rb-explorer")).toHaveCount(0);
  await expect(
    page.getByLabel("Preview 3D hasil scene Roblox", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Tampilan editor" })
    .getByRole("button", { name: "Canvas Map", exact: true })
    .click();
  await expect(
    page.getByLabel("Canvas map Roblox tampak atas", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".artifacts/roblox-clean-map-light.png" });
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator(".monaco-editor").first()).toHaveClass(/\bvs\b/);
  await page
    .getByRole("button", { name: "Tampilkan atau sembunyikan panel bawah" })
    .click();
  await expect(page.locator(".xterm")).toBeVisible();
  await page
    .locator(".xterm")
    .evaluate((e) => e.setAttribute("data-terminal-session", "unchanged"));
  await page.screenshot({ path: ".artifacts/ide-code-light.png" });
  await page
    .getByRole("button", { name: "Aktifkan mode gelap", exact: true })
    .click();
  await expect(page.locator(".monaco-editor").first()).toHaveClass(/vs-dark/);
  await expect(page.locator(".xterm")).toHaveAttribute(
    "data-terminal-session",
    "unchanged",
  );
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    "rgb(32, 36, 43)",
  );
  await page
    .getByRole("group", { name: "Tema IDE", exact: true })
    .getByRole("button", { name: "Terang", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  expect(
    (await new AxeBuilder({ page }).include(".modal").analyze()).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  expect([...fixture.rows.values()][0].payload.files).toEqual(files);
  await page.reload();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-theme",
    "light",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("piwu-ide-theme")),
  ).toBe("light");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Aktifkan mode gelap", exact: true })
    .click();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: ".artifacts/roblox-clean-mobile.png" });
});

test("theme covers web canvas and services; theme persistence failure remains usable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("piwu-ide-theme", "light"),
  );
  await realAccountFixture(page, false);
  await loginRealFixture(page);
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page
    .getByPlaceholder("Buat website portfolio untuk studio desain saya…")
    .fill("Website studio");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await page
    .getByRole("group", { name: "Tampilan editor" })
    .getByRole("button", { name: "Canvas", exact: true })
    .click();
  await expect(page.locator(".cv-panel")).toBeVisible();
  await page.screenshot({ path: ".artifacts/ide-web-canvas-light.png" });
  expect(
    (await new AxeBuilder({ page }).include(".cv-toolbar").analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Integrasi", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(
    page.getByRole("navigation", { name: "Layanan project" }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".service-tabs").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: ".artifacts/ide-services-light.png" });
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "piwu-ide-theme")
        throw new DOMException("Blocked", "SecurityError");
      return original.call(this, key, value);
    };
  });
  await page
    .getByRole("button", { name: "Aktifkan mode gelap", exact: true })
    .click();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /menolak penyimpanan preferensi/ }),
  ).toBeVisible();
});

test("Expo theme and route cleanup do not leak IDE colors into dashboard", async ({
  page,
}) => {
  await realAccountFixture(page, false);
  await loginRealFixture(page);
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page.getByRole("radio", { name: /Aplikasi Mobile/ }).check();
  await page.locator(".modal textarea").fill("Aplikasi seluler");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aplikasi native · Expo" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aktifkan mode terang", exact: true })
    .click();
  await expect(page.locator(".native-preview")).toHaveCSS(
    "background-color",
    "rgb(244, 246, 248)",
  );
  await page
    .getByRole("button", { name: "Aktifkan mode gelap", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Kembali ke dashboard", exact: true })
    .click();
  await expect(page.locator("html")).not.toHaveAttribute("data-ide-theme", /./);
});
