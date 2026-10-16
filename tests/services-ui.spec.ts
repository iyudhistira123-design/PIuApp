import { realAccountFixture, loginRealFixture } from "./helpers-real";
import { signedIn } from "./helpers-account";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function workspace(page: any) {
  await realAccountFixture(page);
  await page.goto("/login");
  await loginRealFixture(page);
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page
    .getByPlaceholder("Buat website portfolio untuk studio desain saya…")
    .fill("Studio Integrasi");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  await expect(page).toHaveURL(/\/project\//);
  await expect(
    page.getByText("Respons API pengujian diterima.", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Penyimpanan: Tersinkron ke cloud" })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hentikan respons" }),
  ).toHaveCount(0, { timeout: 20000 });
}
test("cloud services show configuration state and never fake a paid/publish success", async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole("button", { name: "Layanan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Layanan project" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Belum dikonfigurasi", { exact: true }).first(),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Build & publish" }),
  ).toBeDisabled();
  await expect(
    dialog.getByText("Belum diterbitkan", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Anggota", exact: true }).click();
  await dialog.getByRole("button", { name: "Buat undangan" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Layanan pengujian belum dikonfigurasi.",
  );
  await page.screenshot({ path: ".artifacts/services-panel.png" });
});
test("snapshot recording has isolated playback, scrubber and persistent local library", async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole("button", { name: "Rekam", exact: true }).click();
  await page
    .getByRole("button", { name: "Ubah warna jadi biru", exact: true })
    .click();
  await page.getByRole("button", { name: "Terima semua", exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Live preview aplikasi Anda"]')
      .locator("body"),
  ).toHaveCSS("color", "rgb(40, 87, 170)");
  await page.waitForTimeout(850);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("slider", { name: "Timeline rekaman" }),
  ).toBeVisible();
  const slider = dialog.getByRole("slider", { name: "Timeline rekaman" });
  await slider.focus();
  await slider.press("End");
  await expect(
    page
      .frameLocator('iframe[title="Pemutar snapshot rekaman"]')
      .locator("body"),
  ).toHaveCSS("color", "rgb(40, 87, 170)");
  await expect(
    dialog.getByRole("button", { name: "Buat tautan read-only" }),
  ).toBeDisabled();
  await expect(
    dialog.getByLabel("Rekaman tersimpan").locator("option"),
  ).toHaveCount(2);
});
test("the account page states the plan's daily allowance and its reset clock", async ({
  page,
}) => {
  await signedIn(page, {});
  await page.goto("/account");
  const planCard = page.locator(".service-card", { hasText: "Paket gratis" });
  // The allowance and the countdown come from the same constant migration 010
  // uses, so the card cannot promise a reset the database does not do.
  await expect(planCard.locator("small")).toContainText(
    "20 kredit/hari · direset 00:00 UTC (dalam",
  );
  await expect(planCard.locator("small")).toContainText("jam)");
  // The balance card keeps the deadlines, not a promise that credits never end.
  await expect(
    page.locator(".service-card").first().locator("small"),
  ).toContainText("kredit paket & top-up ada masa berlaku");
});

test("account requires real auth; marketplace gives honest unavailable state; login form a11y", async ({
  page,
}) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=/);
  await realAccountFixture(page);
  await loginRealFixture(page);
  // Keep this error-state UI test independent of local Supabase credentials.
  // Real API authorization/configuration failures are covered separately.
  await page.route("**/api/marketplace", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "Layanan marketplace belum tersedia.",
        code: "SERVICE_UNAVAILABLE",
      },
    }),
  );
  await page.goto("/marketplace");
  await expect(page.getByRole("alert")).toContainText(
    "Layanan marketplace belum tersedia.",
  );
  await page.goto("/login");
  await page.getByText("Masuk dengan OTP WhatsApp", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Kirim OTP WhatsApp" }),
  ).toBeDisabled();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    result.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact || ""),
    ),
  ).toEqual([]);
});
