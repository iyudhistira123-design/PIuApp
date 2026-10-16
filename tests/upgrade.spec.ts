import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signedIn } from "./helpers-account";

test("the dashboard opens the upgrade page, which reads prices from the server", async ({
  page,
}) => {
  await signedIn(page, {});
  // The sidebar's pitch card is a real route now, not a landing-page anchor.
  const card = page.locator(".upgrade-card");
  await expect(card.getByRole("link")).toHaveAttribute("href", "/upgrade");
  await card.getByRole("link").click();
  await expect(page).toHaveURL(/\/upgrade$/);
  await expect(
    page.getByRole("heading", {
      name: "Naikkan paket saat karya menuntut lebih.",
    }),
  ).toBeVisible();
  // Plans and top-ups both come from the payload, one card per SKU.
  const planGrid = page.locator(".plan-grid").first();
  await expect(planGrid.locator(".plan-card")).toHaveCount(2);
  await expect(
    planGrid.locator(".plan-card", { hasText: "PiwuApp Pro" }),
  ).toContainText("199.000");
  await expect(
    planGrid.locator(".plan-card", { hasText: "PiwuApp Pro" }),
  ).toContainText("800");
  await expect(
    page.locator(".plan-grid").nth(1).locator(".plan-card"),
  ).toHaveCount(2);
  // No plan is marked current while the account is on Free.
  await expect(page.locator(".plan-flag")).toHaveCount(0);
  await expect(page.locator(".plan-status")).toContainText("Free");
  await expect(page.locator(".plan-status")).toContainText("128");
  // Payments are off in this payload, so checkout must not be offered.
  await expect(page.locator(".plan-notice-warn")).toContainText(
    "Pembayaran belum dikonfigurasi",
  );
  for (const button of await page
    .getByRole("button", { name: "Checkout" })
    .all())
    await expect(button).toBeDisabled();
  // The pending order still offers its real provider link.
  await expect(
    page.getByRole("link", { name: /Lanjutkan pembayaran/ }),
  ).toHaveAttribute("href", "https://checkout.midtrans.test/o1");
  // Credits follow the price: the card prints the effective rate for the
  // package, and the durations come from the shared costs, not from copy.
  const proCard = planGrid.locator(".plan-card", { hasText: "PiwuApp Pro" });
  await expect(proCard.locator(".plan-rate")).toContainText("249");
  await expect(proCard).toContainText("Kredit tidak kedaluwarsa");
  const teamCard = planGrid.locator(".plan-card", { hasText: "PiwuApp Team" });
  await expect(teamCard.locator(".plan-rate")).toContainText("200");
  await expect(teamCard.locator(".plan-credits")).toContainText("2.500");
  // "How long until it runs out" is answered with three stated profiles.
  const table = page.locator(".plan-table");
  await expect(table.locator(".plan-table-row")).toHaveCount(4);
  await expect(table.locator(".plan-table-head")).toContainText("Saldo Anda");
  await expect(table).toContainText("pemakaian ringan");
  await expect(table).toContainText("pemakaian normal");
  await expect(table).toContainText("pemakaian intens");
  await expect(table.locator(".plan-table-row").nth(1)).toContainText("±");
  // Nothing on the page pretends a paid plan unlocks a gated feature.
  await expect(page.locator(".plan-facts")).toContainText(
    "belum diterapkan di aplikasi ini",
  );
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: ".artifacts/upgrade-page.png" });
  // The durations are the part of the page that answers "how long until it runs
  // out", so keep a picture of the table too.
  await page.locator(".plan-table").scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".artifacts/upgrade-durations.png" });
});

test("checkout sends the chosen SKU and follows the provider link", async ({
  page,
}) => {
  const sent: any[] = [];
  await signedIn(
    page,
    {
      paymentsEnabled: true,
      provider: "midtrans",
      plan: { plan: "Pro", current_period_end: "2026-11-03T00:00:00.000Z" },
    },
    (body) => sent.push(body),
  );
  await page.goto("/upgrade");
  await expect(page.locator(".plan-notice")).toContainText("midtrans");
  // The plan the account is on is marked and offered as a renewal.
  const current = page.locator(".plan-card-current");
  await expect(current).toHaveCount(1);
  await expect(current).toContainText("PiwuApp Pro");
  await expect(current.getByRole("button")).toHaveText("Perpanjang paket");
  await expect(page.locator(".plan-status")).toContainText("Sisa 18 hari");
  // Buying a top-up posts its SKU, then leaves for the provider.
  await page.route("https://checkout.midtrans.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<main>Halaman checkout provider (fixture)</main>",
    }),
  );
  await page
    .locator(".plan-card", { hasText: "Top-up 100 kredit" })
    .getByRole("button")
    .click();
  await expect(
    page.getByText("Halaman checkout provider (fixture)"),
  ).toBeVisible();
  expect(sent).toEqual([{ sku: "credits100" }]);
});

test("the upgrade page states the session requirement instead of showing prices", async ({
  page,
}) => {
  await page.goto("/upgrade");
  await expect(page.getByRole("alert")).toContainText(
    "Halaman paket membutuhkan sesi terverifikasi",
  );
  await expect(
    page.getByRole("link", { name: "Masuk ke akun cloud" }),
  ).toHaveAttribute("href", "/login?next=%2Fupgrade");
  // No price card is rendered without a verified account.
  await expect(page.locator(".plan-card")).toHaveCount(0);
});

test("the landing prices come from the same credit ladder as the checkout", async ({
  page,
}) => {
  await page.goto("/");
  const cards = page.locator("#pricing .pricing-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).locator(".pricing-credit")).toContainText(
    "30 kredit",
  );
  await expect(cards.nth(0).locator(".pricing-credit")).toContainText(
    "tanpa reset bulanan",
  );
  await expect(cards.nth(1).locator(".price-value")).toHaveText("199.000");
  await expect(cards.nth(1).locator(".pricing-credit")).toContainText(
    "800 kredit",
  );
  await expect(cards.nth(1).locator(".pricing-credit")).toContainText(
    "pemakaian normal",
  );
  await expect(cards.nth(2).locator(".pricing-credit")).toContainText(
    "2.500 kredit",
  );
  await expect(cards.nth(2).locator(".pricing-credit")).toContainText(
    "pemakaian intens",
  );
  await expect(page.locator(".pricing-note")).toContainText(
    "Kredit tidak kedaluwarsa",
  );
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});
