import { test, expect } from "@playwright/test";
import { realAccountFixture, loginRealFixture } from "./helpers-real";
import AxeBuilder from "@axe-core/playwright";

test("real mode: demo session cannot unlock private routes; login shows bounded readiness", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "piwuapp-local-v1",
      JSON.stringify({
        state: {
          user: { id: "demo-user", demo: true },
          projects: [],
          prompts: [],
        },
        version: 0,
      }),
    ),
  );
  await page.route("**/api/public/readiness", (r) =>
    r.fulfill({
      json: {
        mode: "real",
        auth: "unreachable",
        database: "unreachable",
        ai: "not_configured",
        sandbox: "not_configured",
        payments: "not_configured",
      },
    }),
  );
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(
    page.getByRole("button", { name: "Jelajahi mode demo" }),
  ).toHaveCount(0);
  await page.getByText("Lihat kesiapan layanan", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Status layanan nyata" }),
  ).toContainText("Tidak dapat dijangkau");
  await expect(page.locator(".dashboard-page")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).include(".auth-main").analyze()).violations,
  ).toEqual([]);
});

test("real mode: authenticated cloud RPC → AI API → reviewed files → version restore", async ({
  page,
}) => {
  const fixture = await realAccountFixture(page);
  let aiCalls = 0;
  await page.route("**/api/projects/*/ai", async (r) => {
    const body = r.request().postDataJSON();
    aiCalls++;
    expect(r.request().headers().authorization).toMatch(/^Bearer /);
    const result = {
      content: "Hasil provider pengujian.",
      files: {
        "src/styles.css":
          body.files["src/styles.css"] + "\nbody { color: #2857aa; }",
      },
      summary: ["Perubahan dari fixture API, bukan provider live."],
    };
    await r.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ type: "token", content: result.content })}\n\ndata: ${JSON.stringify({ type: "result", result })}\n\n`,
    });
  });
  await loginRealFixture(page);
  await expect(page).toHaveURL(/\/projects$/);
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page
    .getByPlaceholder("Buat website portfolio untuk studio desain saya…")
    .fill("Aplikasi nyata saya");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Terima semua", exact: true }),
  ).toBeVisible();
  expect(fixture.calls.some((c) => c.path === "piwu_save_workspace")).toBe(
    true,
  );
  expect(aiCalls).toBe(1);
  await page.getByRole("button", { name: "Terima semua", exact: true }).click();
  await expect
    .poll(() => [...fixture.rows.values()][0]?.payload.files["src/styles.css"])
    .toContain("#2857aa");
  await page.reload();
  await expect(
    page.locator('iframe[title="Live preview aplikasi Anda"]'),
  ).toBeVisible();
  await expect(
    page.getByText("Hasil provider pengujian.", { exact: true }),
  ).toBeVisible();
  expect(aiCalls).toBe(1);
});

test("real mode: missing AI does not simulate edits and pending idea is retained", async ({
  page,
}) => {
  await realAccountFixture(page, false);
  let aiCalls = 0;
  await page.route("**/api/projects/*/ai", (r) => {
    aiCalls++;
    return r.abort();
  });
  await loginRealFixture(page);
  await page
    .getByRole("button", { name: "Buat project pertama", exact: true })
    .click();
  await page
    .getByPlaceholder("Buat website portfolio untuk studio desain saya…")
    .fill("Ide jangan dihilangkan");
  await page.getByRole("button", { name: "Buat project", exact: true }).click();
  await expect(page.locator(".provider-label")).toContainText(
    "AI belum tersedia",
  );
  await expect(page.locator(".chat-composer textarea")).toHaveValue(
    "Ide jangan dihilangkan",
  );
  await page
    .getByRole("button", { name: "Ubah warna jadi biru", exact: true })
    .click();
  await expect(
    page.getByText(/Tidak ada jawaban atau perubahan kode simulasi/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Terima semua", exact: true }),
  ).toHaveCount(0);
  expect(aiCalls).toBe(0);
});
