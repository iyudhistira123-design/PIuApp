import { realAccountFixture, loginRealFixture } from "./helpers-real";
import { test, expect } from "@playwright/test";

// The dashboard has to answer three questions without making the user hunt:
// what is waiting for me, how much credit is left, and what does this project
// actually hold. The numbers come from endpoints that already existed, so this
// spec proves the widgets read them and render them — including the failure
// paths (a service that answers with an error is never shown as "nothing to
// do").
//
// Routes are registered after realAccountFixture on purpose: Playwright matches
// the most recently added route first, so these narrow handlers win over the
// fixture's catch-all.
test.beforeEach(async ({ page }) => {
  await realAccountFixture(page);
  await page.route("**/api/account", (route) =>
    route.fulfill({
      json: {
        balance: 1240,
        ledger: [
          {
            id: "l-1",
            delta: -30,
            reason: "ai_turn",
            created_at: new Date().toISOString(),
          },
          {
            id: "l-2",
            delta: 500,
            reason: "topup",
            created_at: new Date().toISOString(),
          },
        ],
        orders: [],
        plan: { plan: "Free" },
        products: [],
        paymentsEnabled: false,
        provider: null,
        referral: { code: "PIWU-TEST", total: 0, rewarded: 0 },
        sales: [],
      },
    }),
  );
  await page.route("**/api/projects/*/comments", (route) =>
    route.fulfill({
      json: {
        comments: [
          {
            id: "c-1",
            element_selector: "button.primary",
            body: "tombolnya terlalu kecil di ponsel",
            status: "open",
            author_id: "u-test",
            created_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await page.route("**/api/projects/*/members", (route) =>
    route.fulfill({
      json: {
        members: [],
        invites: [
          {
            id: "i-1",
            email: "tim@example.test",
            role: "Editor",
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            accepted_at: null,
            revoked_at: null,
          },
        ],
      },
    }),
  );
  await page.route("**/api/projects/*/deployments", (route) =>
    route.fulfill({
      json: {
        site: {
          url: "https://piwu-test.example",
          custom_domain: "contoh.test",
          domain_status: "pending_dns",
        },
        deployments: [
          {
            id: "d-1",
            url: "https://piwu-test.example",
            status: "failed",
            error: "Build gagal: file hilang",
            revision: 3,
            created_at: new Date().toISOString(),
          },
        ],
        jobs: [],
      },
    }),
  );
  // A web app has no Studio bridge: the panel must skip it, not invent one.
  await page.route("**/api/projects/*/studio", (route) =>
    route.fulfill({
      status: 409,
      json: { error: "Jenis project berubah; pasangkan project Roblox." },
    }),
  );
});

test("dashboard shows what waits, what is left, and what the project holds", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await loginRealFixture(page);

  // One project, with the turn the dashboard's own form starts.
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page
    .getByPlaceholder("Buat website portfolio untuk studio desain saya…")
    .fill("Buat dashboard toko roti");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  await expect(page).toHaveURL(/\/project\//);
  await expect(page.getByText("Respons API pengujian diterima.")).toBeVisible();
  await page.getByRole("link", { name: "Kembali ke dashboard" }).click();

  // 1. The credit card: the same numbers /account shows, where the session starts.
  const credit = page.locator(".dashboard-credit");
  await expect(credit).toContainText("1.240");
  await expect(credit).toContainText("Free");
  await expect(credit).toContainText("7 hari terakhir: 30 kredit");
  await expect(credit.getByRole("link", { name: /Rincian/ })).toBeVisible();

  // 2. "Menunggu Anda": four real items from four real endpoints.
  const waiting = page.locator(".dashboard-waiting");
  await expect(waiting).toContainText("Menunggu Anda");
  await expect(waiting).toContainText("1 komentar belum diselesaikan");
  await expect(waiting).toContainText("1 undangan kolaborator belum dijawab");
  await expect(waiting).toContainText("Domain kustom belum aktif");
  await expect(waiting).toContainText("Deploy terakhir gagal");
  await expect(waiting).toContainText("Build gagal: file hilang");
  // The Studio endpoint refused, so nothing about Studio may appear.
  await expect(waiting).not.toContainText("Studio");
  await expect(waiting).toContainText("Diperiksa dari 1 project terbaru");

  // 3. The project card: where you stopped, and what the project holds.
  const card = page.locator(".project-card").first();
  await expect(card).toContainText("Terakhir: Respons API pengujian diterima.");
  await expect(card).toContainText(/\d+ file · \d+ riwayat · \d+ (B|KB|MB)/);
  await expect(card.locator(".project-sync")).toContainText(
    /sinkron|perangkat/i,
  );

  // The item is a link into the panel that resolves it: the services modal opens
  // on the comments tab, with the comment already loaded.
  await waiting
    .getByRole("link", { name: /komentar belum diselesaikan/ })
    .click();
  await expect(page).toHaveURL(/services=comments/);
  const dialog = page.getByRole("dialog");
  // The Komentar tab is the one already selected, so the item landed where the
  // decision can be made instead of on the Status panel.
  await expect(
    dialog.getByRole("button", { name: "Komentar", exact: true }),
  ).toHaveClass(/active/);
  await expect(dialog).toContainText("tombolnya terlalu kecil di ponsel");
  expect(errors).toEqual([]);
});

test("the dashboard says so when the account endpoint is unreachable", async ({
  page,
}) => {
  // A dead account endpoint must not look like an empty wallet.
  await page.unroute("**/api/account");
  await page.route("**/api/account", (route) =>
    route.fulfill({ status: 503, json: { error: "Layanan pengujian mati." } }),
  );
  await page.goto("/login");
  await loginRealFixture(page);
  const credit = page.locator(".dashboard-credit");
  await expect(credit).toContainText("Belum bisa dimuat");
  await expect(credit).toContainText("Server tidak menjawab");
  await expect(credit.getByRole("link", { name: /Akun/ })).toBeVisible();
});

test("a dashboard where every project service fails says it could not check, not that nothing waits", async ({
  page,
}) => {
  await page.unroute("**/api/projects/*/comments");
  await page.route("**/api/projects/*/comments", (route) =>
    route.fulfill({ status: 503, json: { error: "Layanan pengujian mati." } }),
  );
  await page.goto("/login");
  await loginRealFixture(page);
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page
    .getByPlaceholder("Buat website portfolio untuk studio desain saya…")
    .fill("Buat halaman kontak");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  await expect(page).toHaveURL(/\/project\//);
  await page.getByRole("link", { name: "Kembali ke dashboard" }).click();
  const waiting = page.locator(".dashboard-waiting");
  // Three of the four endpoints still answer, so those items stay; the failed
  // one is reported as unchecked instead of silently dropped.
  await expect(waiting).toContainText("Domain kustom belum aktif");
  await expect(waiting).not.toContainText("komentar belum diselesaikan");
  await expect(waiting).toContainText("tidak bisa diperiksa");
});
