import { readFileSync } from "node:fs";
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
            reason: "ai",
            created_at: new Date().toISOString(),
          },
          {
            id: "l-2",
            delta: 500,
            reason: "Pembayaran terverifikasi",
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
  // Two audits, so the panel has a score and a movement to report.
  let audits: Record<string, unknown>[] = [
    {
      id: "a-1",
      type: "lighthouse",
      score: 72,
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      findings: {
        scores: { performance: 72, accessibility: 95 },
        findings: [],
      },
    },
    {
      id: "a-2",
      type: "lighthouse",
      score: 92,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      findings: {
        scores: {
          performance: 92,
          accessibility: 88,
          "best-practices": 100,
          seo: 90,
        },
        findings: [{ id: "f-1" }],
      },
    },
  ];
  await page.route("**/api/projects/*/audits", (route) =>
    route.fulfill({ json: { reports: audits } }),
  );
  // This deployment has a sandbox, which is what makes an audit runnable.
  await page.unroute("**/api/status");
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        mode: "real",
        ai: "configured",
        storage: "supabase-configured",
        capabilities: {
          auth: true,
          cloud: true,
          ai: true,
          sandbox: true,
          audit: true,
          publish: false,
          payments: false,
        },
        verification: "configuration-only",
      },
    }),
  );
  await page.route("**/api/projects/*/audit", (route) => {
    audits = [
      {
        id: "a-3",
        type: "lighthouse",
        score: 95,
        created_at: new Date().toISOString(),
        findings: { scores: { performance: 95 }, findings: [] },
      },
      ...audits,
    ];
    return route.fulfill({ json: { report: audits[0] } });
  });

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
  // Where those credits went, and only the spending (top ups are not spending).
  await expect(credit.locator(".credit-split")).toContainText("Percakapan AI");
  await expect(credit.locator(".credit-split")).toContainText("30");
  await expect(credit).not.toContainText("Pembayaran");
  await expect(credit.locator(".credit-low")).toHaveCount(0);
  // How long the balance lasts, at the stated usage, right where the session
  // starts — and that credits do not expire.
  await expect(credit.locator(".credit-lasts")).toContainText(
    "pada pemakaian normal",
  );
  await expect(credit.locator(".credit-lasts")).toContainText(
    "kredit tidak kedaluwarsa",
  );
  await expect(credit.getByRole("link", { name: /Rincian/ })).toBeVisible();

  // 2. The readiness list: this deployment has no publish and no payments, and
  // it must say which exact switch is off instead of leaving a dead button.
  const readiness = page.locator(".dashboard-readiness");
  await expect(readiness).toContainText("fitur belum aktif di server ini");
  await expect(readiness).toContainText("Publish ke web");
  await expect(readiness).toContainText("NETLIFY_TOKEN");
  await expect(readiness).toContainText("Top up kredit");
  await expect(readiness).toContainText("Pencarian web");
  // The parts that are already on are named when the list is opened.
  await readiness.getByRole("button", { name: "Lihat daftar lengkap" }).click();
  await expect(readiness).toContainText("Percakapan AI");
  await expect(readiness).toContainText("Audit Lighthouse");
  await readiness.getByRole("button", { name: "Ringkas daftar" }).click();
  await readiness.getByRole("button", { name: "Sembunyikan" }).click();
  await expect(page.locator(".dashboard-ready-warn")).toContainText(
    "lihat apa yang kurang",
  );
  await page.locator(".dashboard-ready-warn").click();
  await expect(readiness).toBeVisible();

  // 3. "Menunggu Anda": four real items from four real endpoints.
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

  // 4. "Kualitas project": the score, where it came from, and its movement.
  const quality = page.locator(".dashboard-quality");
  await expect(quality).toContainText("Kualitas project");
  await expect(quality).toContainText("92");
  await expect(quality).toContainText("/100 · Bagus");
  await expect(quality).toContainText("naik 20 poin dari audit sebelumnya");
  await expect(quality).toContainText("Performa 92");
  await expect(quality).toContainText("1 temuan");
  // The audit button is offered because this server has a sandbox and the role
  // may edit; running it refreshes the score without a page reload.
  const auditButton = quality.getByRole("button", {
    name: "Audit ulang (3 kredit)",
  });
  // The button only appears once the latest revision is on the server, because
  // that is the copy the audit builds.
  await expect(auditButton).toBeEnabled({ timeout: 20000 });
  await auditButton.click();
  await expect(quality).toContainText("selesai", { timeout: 10000 });
  await expect(quality).toContainText("95");
  await expect(quality).toContainText("naik 3 poin dari audit sebelumnya");

  // 5. The activity log: what just happened, from the version history.
  const activity = page.locator(".dashboard-activity");
  await expect(activity).toContainText("Aktivitas terbaru");
  await expect(activity).toContainText("Project dibuat");
  await expect(activity).toContainText("dashboard toko roti");
  await expect(activity).toContainText("Hari ini");
  await expect(activity).toContainText("pesan chat belum punya stempel waktu");

  // 6. The project card: where you stopped, and what the project holds.
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

test("a thinning balance is called out with a way to top up", async ({
  page,
}) => {
  await page.unroute("**/api/account");
  await page.route("**/api/account", (route) =>
    route.fulfill({
      json: {
        balance: 4,
        ledger: [
          {
            id: "l-3",
            delta: -3,
            reason: "sandbox",
            created_at: new Date().toISOString(),
          },
        ],
        orders: [],
        plan: { plan: "Free" },
      },
    }),
  );
  await page.goto("/login");
  await loginRealFixture(page);
  const credit = page.locator(".dashboard-credit");
  await expect(credit).toContainText("4");
  await expect(credit.locator(".credit-low")).toContainText("Saldo menipis");
  await expect(credit).toContainText("Build & audit");
  await expect(credit.getByRole("link", { name: /top up/ })).toBeVisible();
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

test("search looks inside files and conversations, and the chips narrow the list", async ({
  page,
}) => {
  await page.goto("/login");
  await loginRealFixture(page);
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page
    .getByPlaceholder("Buat website portfolio untuk studio desain saya…")
    .fill("Buat dashboard toko roti");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  await expect(page).toHaveURL(/\/project\//);
  // Wait for the first turn to finish and the project to reach the cloud: the
  // same order the workflow spec uses before asking for another change.
  await expect(
    page.getByText("Respons API pengujian diterima.", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page
      .getByRole("button", { name: "Penyimpanan: Tersinkron ke cloud" })
      .first(),
  ).toBeVisible({ timeout: 20000 });
  // A change the fixture really writes into src/styles.css (`biru`).
  await page
    .getByRole("button", { name: "Ubah warna jadi biru", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Terima semua", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Terima semua", exact: true })
    .click({ timeout: 30000 });
  await page.getByRole("link", { name: "Kembali ke dashboard" }).click();

  // The colour only exists inside a file, never in the project's name.
  await page.getByLabel("Cari project", { exact: true }).fill("2857aa");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await expect(page.locator(".project-card").first()).toContainText(
    "cocok di src/styles.css",
  );

  // The conversation is searched too, and says that is where it found it.
  await page
    .getByLabel("Cari project", { exact: true })
    .fill("Respons API pengujian");
  await expect(page.locator(".project-card").first()).toContainText(
    "cocok di percakapan",
  );

  // Chips narrow by kind and by open comments, without touching the query.
  await page.getByLabel("Cari project", { exact: true }).fill("");
  await page.getByRole("button", { name: "Roblox", exact: true }).click();
  await expect(page.getByText("Tidak ada project yang cocok")).toBeVisible();
  await page.getByRole("button", { name: "Web", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Komentar terbuka" }).click();
  await expect(page.getByText("Tidak ada project yang cocok")).toBeVisible();
  await page.getByRole("button", { name: "Semua", exact: true }).click();
  await page.getByRole("button", { name: "Komentar terbuka" }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
});

test("a backup downloads, and restoring it adds projects instead of overwriting them", async ({
  page,
}) => {
  await page.goto("/login");
  await loginRealFixture(page);
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page
    .getByPlaceholder("Buat website portfolio untuk studio desain saya…")
    .fill("Buat katalog produk");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  await expect(page).toHaveURL(/\/project\//);
  await page.getByRole("link", { name: "Kembali ke dashboard" }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);

  // Backup lives in the storage dialog, next to the status of local data.
  await page
    .getByRole("button", { name: /^Penyimpanan:/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Cadangan", exact: true }).click();
  const storage = page.getByRole("dialog");
  await expect(storage).toContainText("semua project, riwayatnya, dan foto");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    storage.getByRole("button", { name: "Unduh semua project" }).click(),
  ]);
  const file = await download.path();
  expect(download.suggestedFilename()).toMatch(
    /^piwuapp-cadangan-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const backup = JSON.parse(readFileSync(file, "utf8"));
  expect(backup.app).toBe("PiwuApp");
  expect(backup.version).toBe(1);
  expect(backup.projects).toHaveLength(1);
  expect(backup.projects[0].name).toBe("katalog produk");
  expect(Object.keys(backup.projects[0].files).length).toBeGreaterThan(0);

  // Restoring the very same file must not touch the project it came from.
  await page.getByLabel("Berkas cadangan PiwuApp").setInputFiles({
    name: "cadangan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const confirm = storage.getByRole("group", { name: "Konfirmasi pemulihan" });
  await expect(confirm).toContainText("Berkas memuat 1 project");
  await expect(confirm).toContainText("(pulih)");
  await confirm.getByRole("button", { name: "Tambahkan 1 project" }).click();
  await expect(confirm).toBeHidden();
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Menu katalog produk (pulih)" }),
  ).toBeVisible();

  // A file that is not a backup is refused with words, not a silent no-op.
  await page
    .getByRole("button", { name: /^Penyimpanan:/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Cadangan", exact: true }).click();
  await page.getByLabel("Berkas cadangan PiwuApp").setInputFiles({
    name: "salah.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"halo":1}'),
  });
  await expect(
    page.getByRole("dialog").getByText(/bukan cadangan PiwuApp/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
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
