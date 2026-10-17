import { realAccountFixture, loginRealFixture } from "./helpers-real";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("admin requires authenticated server role; no preview bypass", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(
    page.getByRole("button", { name: "Lihat pratinjau panel" }),
  ).toHaveCount(0);
  await realAccountFixture(page);
  await page.route("**/api/admin/session", (r) =>
    r.fulfill({
      status: 403,
      json: { error: "Akses administrator diperlukan." },
    }),
  );
  await loginRealFixture(page);
  await page.goto("/admin");
  await expect(page.getByRole("alert")).toContainText(
    "Akses administrator diperlukan.",
  );
  await expect(
    page.getByRole("navigation", { name: "Navigasi admin" }),
  ).toHaveCount(0);
});
async function fixture(
  page: Page,
  role = "operator",
  tab = "broadcasts",
  items: any[] = [],
) {
  await page.goto("/");
  await page.evaluate(
    async ({ role, tab, items }) => {
      const React = (await import("/node_modules/.vite/deps/react.js")).default;
      const { createRoot } = (
        await import("/node_modules/.vite/deps/react-dom_client.js")
      ).default;
      const routerPath = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find(
          (n) =>
            new URL(n).pathname ===
            "/node_modules/.vite/deps/react-router-dom.js",
        )!;
      const { MemoryRouter } = await import(routerPath);
      const { AdminPanel } = await import("/src/pages/Admin.tsx");
      const state = {
        items: structuredClone(items),
        actions: [] as any[],
        fail: false,
      };
      const client = async (path: string, body?: any) => {
        if (path === "/admin/actions") {
          state.actions.push(structuredClone(body));
          if (state.fail) throw new Error("Konflik revisi. Muat ulang data.");
          state.items = [
            { id: body.target, ...body.payload, revision: 1, read_count: 0 },
          ];
          return { notice: "Broadcast disimpan dalam fixture pengujian." };
        }
        if (path.startsWith("/admin/settings"))
          return {
            revision: 1,
            value: {
              maintenance: false,
              maintenance_message: "Pemeliharaan",
              hero_title: "",
              hero_subtitle: "",
              support_email: "",
              enabled_services: {
                ai: true,
                sandbox: true,
                payments: true,
                marketplace: true,
              },
            },
          };
        return { items: structuredClone(state.items), hasMore: false };
      };
      document.getElementById("root")!.style.display = "none";
      const host = document.createElement("div");
      host.id = "admin-fixture";
      document.body.append(host);
      (window as any).__adminFixture = state;
      createRoot(host).render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ["/admin?tab=" + tab] },
          React.createElement(AdminPanel, {
            session: { role, email: "fixture@example.test" },
            preview: false,
            client,
          }),
        ),
      );
    },
    { role, tab, items },
  );
  if (tab === "broadcasts")
    await expect(
      page.getByRole("heading", { name: "Broadcast", exact: true }),
    ).toBeVisible();
}
test("broadcast editor: schedule, audience, confirmation, retained draft and explicit errors", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Buat broadcast", exact: true })
    .click();
  await page
    .getByLabel("Judul", { exact: true })
    .fill("Pemeliharaan terjadwal");
  await page
    .getByLabel("Isi pengumuman")
    .fill("Simpan perubahan project sebelum pemeliharaan.");
  await page
    .getByRole("combobox", { name: "Audiens", exact: true })
    .selectOption("pro");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("published");
  await page.getByLabel("Mulai tayang").fill("2099-12-12T10:00");
  await page
    .getByRole("button", { name: "Tinjau & simpan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(page.getByLabel("Judul", { exact: true })).toHaveValue(
    "Pemeliharaan terjadwal",
  );
  await page
    .getByRole("button", { name: "Tinjau & simpan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Konfirmasi perubahan" }),
  ).toBeDisabled();
  await page
    .getByLabel("Alasan perubahan")
    .fill("Informasi pemeliharaan rutin");
  await page.evaluate(() => {
    (window as any).__adminFixture.fail = true;
  });
  await page.getByRole("button", { name: "Konfirmasi perubahan" }).click();
  await expect(page.getByRole("alert")).toContainText("Konflik revisi");
  await page.evaluate(() => {
    (window as any).__adminFixture.fail = false;
  });
  await page.getByRole("button", { name: "Konfirmasi perubahan" }).click();
  await expect(
    page.getByRole("cell", { name: "Terjadwal", exact: true }),
  ).toBeVisible();
  const actions = await page.evaluate(
    () => (window as any).__adminFixture.actions,
  );
  expect(actions).toHaveLength(2);
  expect(actions[0].requestId).toBe(actions[1].requestId);
  expect(actions[1].payload.audience).toBe("pro");
  expect(actions[1].payload.status).toBe("published");
  expect(actions[1]).not.toHaveProperty("actor");
});
test("auditor cannot mutate and operator cannot change settings", async ({
  page,
}) => {
  for (const role of ["auditor", "operator"]) {
    await fixture(page, role);
    if (role === "auditor")
      await expect(
        page.getByRole("button", { name: "Buat broadcast", exact: true }),
      ).toBeDisabled();
    await page
      .getByRole("navigation", { name: "Navigasi admin" })
      .getByRole("button", { name: "Pengaturan situs" })
      .click();
    await expect(
      page.getByRole("button", { name: "Tinjau & simpan pengaturan" }),
    ).toBeDisabled();
    await expect(page.getByLabel("Judul utama")).toBeDisabled();
  }
});
test("public announcements render as plain text and site content is connected", async ({
  page,
}) => {
  await page.route("**/api/public/site", (route) =>
    route.fulfill({
      json: {
        configured: true,
        settings: {
          hero_title: "Bangun bersama komunitas",
          hero_subtitle: "Konten dari pengaturan admin",
          support_email: "support@example.test",
          maintenance: true,
          maintenance_message: "Pemeliharaan terjadwal",
        },
        broadcasts: [
          {
            id: crypto.randomUUID(),
            title: "Kabar platform",
            body: "<script>window.injected=true</script>",
            read: false,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bangun bersama komunitas" }),
  ).toBeVisible();
  await expect(page.getByText("Konten dari pengaturan admin")).toBeVisible();
  await page.locator(".platform-announcements summary").click();
  await expect(
    page.getByText("<script>window.injected=true</script>", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  await expect(page.getByRole("button", { name: "Tandai dibaca" })).toHaveCount(
    0,
  );
});

test("settings edit package prices and the Studio switch for the whole platform", async ({
  page,
}) => {
  await fixture(page, "superadmin", "settings");
  await expect(
    page.getByRole("heading", { name: "Paket & kredit" }),
  ).toBeVisible();
  // Effective defaults are shown, not blank boxes.
  await expect(
    page.getByLabel("Harga (Rp)", { exact: true }).first(),
  ).toHaveValue("199000");
  await expect(page.getByLabel("Kredit", { exact: true }).first()).toHaveValue(
    "1500",
  );
  await expect(page.getByText("Roblox Studio bridge")).toBeVisible();
  await page.getByLabel("Harga (Rp)", { exact: true }).first().fill("249000");
  await page.getByLabel("Kredit", { exact: true }).first().fill("2000");
  await page
    .getByRole("button", { name: "Tinjau & simpan pengaturan" })
    .click();
  await page
    .getByLabel("Alasan perubahan")
    .fill("Menyesuaikan harga paket Pro");
  await page.getByRole("button", { name: "Konfirmasi perubahan" }).click();
  const actions = await page.evaluate(
    () => (window as any).__adminFixture.actions,
  );
  expect(actions).toHaveLength(1);
  expect(actions[0].action).toBe("settings");
  expect(actions[0].payload.value.enabled_services.plan_overrides.pro).toEqual({
    amount: 249000,
    credits: 2000,
  });
  expect(actions[0].payload.value.enabled_services.plan_overrides.team).toEqual(
    {
      amount: 499000,
      credits: 4500,
    },
  );
  // Prices must not be sent as a top-level key: migration 005's RPC rejects it.
  expect(actions[0].payload.value).not.toHaveProperty("plan_overrides");
  expect(actions[0].payload.value.enabled_services.studio).toBe(true);
});

test("settings stay read-only without the superadmin role", async ({
  page,
}) => {
  await fixture(page, "operator", "settings");
  await expect(
    page.getByLabel("Harga (Rp)", { exact: true }).first(),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Kredit", { exact: true }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Gunakan harga bawaan" }),
  ).toBeDisabled();
  await expect(page.getByText("Roblox Studio bridge")).toBeVisible();
});

test("users tab removes an account only after the exact id and a reason", async ({
  page,
}) => {
  const target = crypto.randomUUID(),
    admin = crypto.randomUUID();
  const rows = [
    {
      id: target,
      name: "Budi",
      email: "budi@example.test",
      balance: 10,
      suspended: false,
      verified: true,
      admin_role: "",
    },
    {
      id: admin,
      name: "Admin Lain",
      email: "admin@example.test",
      balance: 0,
      suspended: false,
      verified: true,
      admin_role: "auditor",
    },
  ];
  await fixture(page, "superadmin", "users", rows);
  const remove = page.getByRole("button", { name: "Hapus akun" });
  await expect(remove).toHaveCount(2);
  // An account with an admin role must lose that role first.
  await expect(remove.nth(1)).toBeDisabled();
  await remove.first().click();
  await expect(page.getByRole("dialog")).toContainText(
    "Catatan pembayaran dan audit tetap disimpan",
  );
  const confirm = page.getByRole("button", {
    name: "Konfirmasi perubahan",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByLabel("Ketik ID pengguna lengkap untuk menghapus akun")
    .fill(target);
  await page
    .getByLabel("Alasan perubahan")
    .fill("Permintaan penghapusan oleh pemilik akun");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  const actions = await page.evaluate(
    () => (window as any).__adminFixture.actions,
  );
  expect(actions).toHaveLength(1);
  expect(actions[0].action).toBe("user_delete");
  expect(actions[0].target).toBe(target);
  expect(actions[0].payload).toEqual({ confirmation: target });
  expect(actions[0].reason).toBe("Permintaan penghapusan oleh pemilik akun");
});

test("users tab keeps account removal closed to non-superadmin roles", async ({
  page,
}) => {
  await fixture(page, "operator", "users", [
    {
      id: crypto.randomUUID(),
      name: "Budi",
      email: "budi@example.test",
      balance: 10,
      suspended: false,
      verified: true,
      admin_role: "",
    },
  ]);
  await expect(page.getByRole("button", { name: "Hapus akun" })).toBeDisabled();
});
