import { realAccountFixture, loginRealFixture } from "./helpers-real";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// The client half of the research contract: the composer toggle really turns
// research on for the request, the numbered sources are shown like the
// citations in the answer, an invented citation number is called out instead of
// resolved, and both survive a reload. Retrieval itself is covered by
// tests/search.test.ts and tests/search-api.test.ts.
const sources = [
  {
    index: 1,
    provider: "tavily",
    kind: "web",
    title: "Dokumentasi resmi",
    url: "https://dokumen.example.test/panduan",
    snippet: "Cuplikan pertama",
    query: "next.js app router retry",
  },
  {
    index: 2,
    provider: "tavily",
    kind: "web",
    title: "Artikel kedua",
    url: "https://kedua.example.test/tulis",
    snippet: "Cuplikan kedua",
    query: "error handling app router",
  },
];
const research = {
  rounds: [
    {
      query: "next.js app router retry",
      kind: "web",
      provider: "tavily",
      label: "Tavily",
      cached: false,
      count: 2,
      error: "",
    },
  ],
  sources,
  read: 2,
  notice: "2 sumber dari 1 pencarian. Isinya data tidak tepercaya.",
  cited: [1],
  uncited: [2],
  invalid: [7],
  citationNotice: "",
  checked: 1,
  unsupported: [2],
  insufficient: [],
  groundingNotice:
    "Pemeriksaan heuristik: sitasi 2 tidak berbagi satu kata pun dengan isi sumbernya. Periksa ulang sebelum dipercaya.",
};

async function fixture(page: Page) {
  await realAccountFixture(page);
  const body = { value: null as any };
  await page.route("**/api/projects/*/ai", async (r) => {
    Object.assign(body, { value: r.request().postDataJSON() });
    const prompt = r.request().postDataJSON().prompt as string;
    const result: any = {
      content: "Respons API pengujian diterima.",
      creditsUsed: 1,
    };
    if (/tanpa hasil/i.test(prompt)) {
      result.content = "Saya belum menemukan sumber untuk pertanyaan itu.";
      result.research = {
        ...research,
        rounds: [
          {
            query: "topik langka",
            kind: "web",
            provider: "",
            label: "",
            cached: false,
            count: 0,
            error:
              "Pencarian web belum dikonfigurasi. Isi SEARCH_PROVIDER dan SEARCH_API_KEY di server.",
          },
        ],
        sources: [],
        read: 0,
        notice: "Tidak ada sumber yang berhasil diambil.",
        cited: [],
        uncited: [],
        invalid: [],
        citationNotice: "Jawaban tidak mengutip nomor sumber mana pun.",
      };
    } else if (/retry/i.test(prompt)) {
      result.content = "Pakai pengulangan berjenjang [1], dan catat [7].";
      result.sources = sources;
      result.research = research;
      result.creditsUsed = 2;
    }
    return r.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ type: "result", result })}\n\n`,
    });
  });
  return body;
}

// The composer refuses a follow-up while a sync is still running, so every
// send waits for the workspace to report a synced state first.
async function waitSynced(page: Page) {
  await expect(
    page
      .getByRole("button", { name: "Penyimpanan: Tersinkron ke cloud" })
      .first(),
  ).toBeVisible();
}

async function sendMessage(page: Page, text: string) {
  await waitSynced(page);
  await page.getByLabel("Pesan untuk AI").fill(text);
  await page.getByRole("button", { name: "Kirim pesan" }).click();
  await expect(
    page.getByRole("button", { name: "Hentikan respons" }),
  ).toHaveCount(0);
}

async function openProject(page: Page) {
  await page.goto("/");
  await page
    .getByPlaceholder("Minta PiwuApp membuat aplikasi tentang…")
    .fill("Buat website studio desain");
  await page
    .getByRole("button", { name: "Kirim ide dan buat project" })
    .click();
  await loginRealFixture(page);
  await expect(page.getByText("Respons API pengujian diterima.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hentikan respons" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("button", { name: "Penyimpanan: Tersinkron ke cloud" })
      .first(),
  ).toBeVisible();
}

test("the research toggle is off by default, persists and is sent as research:true", async ({
  page,
}) => {
  const body = await fixture(page);
  await openProject(page);
  const toggle = page.getByRole("button", { name: "Mode riset" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // A plain turn must not ask the server to search.
  await sendMessage(page, "Geser atap dua stud ke kanan");
  await expect(page.getByText("Respons API pengujian diterima.")).toHaveCount(
    2,
  );
  expect(body.value.research).toBe(false);
  await expect(page.locator(".ai-sources")).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await sendMessage(page, "Cara retry di Next.js App Router?");
  await expect(page.locator(".ai-sources")).toHaveCount(1);
  expect(body.value.research).toBe(true);
  // The preference is per account and survives a reload.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mode riset" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a round that found nothing says so instead of showing an empty list", async ({
  page,
}) => {
  await fixture(page);
  await openProject(page);
  await page.getByRole("button", { name: "Mode riset" }).click();
  await sendMessage(page, "Cari bahan tentang topik langka tanpa hasil");
  const panel = page.locator(".ai-sources").last();
  await expect(panel.locator(".sources-headline")).toHaveText(
    "Sumber · tidak ada hasil",
  );
  await expect(panel.locator("ol")).toHaveCount(0);
  await expect(panel).toContainText("Tidak ada sumber yang berhasil diambil.");
  // The failing query carries the server's own reason, so the user can act.
  await expect(panel.locator("ul.sources-failed li")).toContainText(
    "Kueri “topik langka” gagal: Pencarian web belum dikonfigurasi.",
  );
  await expect(panel).toContainText("tidak mengutip nomor sumber mana pun");
});

test("the chat lists the numbered sources and flags an invented citation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fixture(page);
  await openProject(page);
  await page.getByRole("button", { name: "Mode riset" }).click();
  await sendMessage(page, "Cara retry di Next.js App Router?");
  const panel = page.locator(".ai-sources").last();
  await expect(panel.locator(".sources-headline")).toHaveText(
    "Sumber · 2 dari 1 pencarian",
  );
  const items = panel.locator("ol > li");
  await expect(items).toHaveCount(2);
  // Sources are numbered like the citations in the reply, and open in a new tab.
  await expect(items.nth(0).locator("a")).toHaveAttribute(
    "href",
    "https://dokumen.example.test/panduan",
  );
  await expect(items.nth(0).locator("a")).toHaveAttribute("target", "_blank");
  await expect(items.nth(0).locator("a")).toContainText("Dokumentasi resmi");
  await expect(items.nth(0)).toContainText("dikutip");
  await expect(items.nth(1)).toContainText("tidak dikutip");
  // Two queries in one round: each row says which query found it.
  await expect(items.nth(0)).toContainText("kueri “next.js app router retry”");
  await expect(items.nth(1)).toContainText("kueri “error handling app router”");
  // The grounding heuristic is spoken plainly, never as "verified".
  await expect(panel).toContainText("Pemeriksaan heuristik");
  await expect(panel).not.toContainText("terverifikasi");
  await expect(items.nth(0)).toContainText("Cuplikan pertama");
  await expect(panel).toContainText("data tidak tepercaya");
  // A citation number the server never returned is reported, never resolved.
  await expect(
    panel.locator("small.warn", { hasText: "tidak pernah dikembalikan" }),
  ).toContainText("Nomor sumber yang tidak pernah dikembalikan: 7");
  // Folding works, and the report is kept with the answer.
  await panel.locator(".sources-headline").click();
  await expect(page.locator(".ai-sources").last().locator("ol")).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(".ai-sources").last().locator(".sources-headline"),
  ).toHaveText("Sumber · 2 dari 1 pencarian");
  expect(errors).toEqual([]);
});
