import { realAccountFixture, loginRealFixture } from "./helpers-real";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await realAccountFixture(page, false);
  await loginRealFixture(page);
  // These tests intentionally hold sync offline while injecting conflict/import
  // state. Separate tests cover the actual RPC round-trip and authorization.
  await page.route("**/rest/v1/rpc/**", (r) => r.abort());
});
// Browser fixtures exercise real UI/state without enabling a fake cloud provider
// in the app. RPC/RLS behavior is tested separately on PostgreSQL in database.test.ts.
test("legacy import is explicit, isolated, and original project survives logout", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.evaluate(async () => {
    const path =
      performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => new URL(n).pathname === "/src/lib/store.ts") ||
      "/src/lib/store.ts";
    const { useStore } = await import(path);
    // Seed legacy cache directly. Entering a demo identity is no longer a
    // supported application action and would correctly trigger the route guard.
    const id = useStore.getState().createProject("Studio Lokal");
    const state = useStore.getState();
    const legacy = state.projects.find((p: any) => p.id === id);
    useStore.setState({
      workspaces: {
        ...state.workspaces,
        demo: { projects: [legacy], prompts: [], sync: {}, deleted: {} },
      },
      projects: [],
      sync: {},
      deleted: {},
    });
  });
  await expect(page.locator(".project-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Penyimpanan:/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Impor dari demo/ }).click();
  await page.getByRole("checkbox", { name: /Studio Lokal/ }).check();
  await page
    .getByRole("button", { name: "Salin 1 project ke akun", exact: true })
    .click();
  await expect(page.getByText(/Belum pernah diunggah/)).toBeVisible();
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  const ids = await page.evaluate(async () => {
    const path =
      performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => new URL(n).pathname === "/src/lib/store.ts") ||
      "/src/lib/store.ts";
    const { useStore } = await import(path);
    const s = useStore.getState();
    return {
      copy: s.projects[0].id,
      original: s.workspaces.demo.projects[0].id,
    };
  });
  expect(ids.copy).not.toBe(ids.original);
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=/);
  const legacyId = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("piwuapp-local-v1")!).state.workspaces
        .demo.projects[0].id,
  );
  expect(legacyId).toBe(ids.original);
});
test("conflict dialog requires consent to discard and save-both keeps both versions", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.evaluate(async () => {
    const path =
      performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => new URL(n).pathname === "/src/lib/store.ts") ||
      "/src/lib/store.ts";
    const { useStore } = await import(path);
    const s = useStore.getState();
    s.setUser({
      id: "d29f9dc0-cb78-4a4a-8d4c-30d287c7b1fa",
      name: "Pemilik",
      email: "owner@example.test",
      demo: false,
    });
    const id = s.createProject("Edit lokal saya");
    const p = structuredClone(useStore.getState().projects[0]);
    useStore.setState({
      sync: {
        [id]: {
          revision: 1,
          role: "Owner",
          phase: "conflict",
          remote: {
            project: { ...p, name: "Versi cloud" },
            revision: 2,
            role: "Owner",
            ownerId: useStore.getState().user.id,
            updatedAt: new Date().toISOString(),
          },
        },
      },
      connection: { phase: "ready" },
    });
  });
  await page
    .getByRole("button", { name: /^Penyimpanan:/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Tinjau konflik Edit lokal saya" })
    .click();
  await expect(
    page.getByRole("button", { name: "Gunakan versi cloud", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Versi cloud", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Simpan keduanya · buat salinan pribadi" })
    .click();
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await expect(
    page.locator(".project-card").getByText("Versi cloud", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".project-card")
      .getByText("Edit lokal saya (salinan lokal)", { exact: true }),
  ).toBeVisible();
});
test("shared Viewer sees preview with read-only editor and cannot delete project", async ({
  page,
}) => {
  await page.goto("/projects");
  const id = await page.evaluate(async () => {
    const path =
      performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => new URL(n).pathname === "/src/lib/store.ts") ||
      "/src/lib/store.ts";
    const { useStore } = await import(path);
    const s = useStore.getState();
    s.setUser({
      id: "d29f9dc0-cb78-4a4a-8d4c-30d287c7b1fa",
      name: "Viewer",
      email: "viewer@example.test",
      demo: false,
    });
    const id = s.createProject("Project Tim");
    useStore.setState({
      sync: { [id]: { revision: 4, role: "Viewer", phase: "synced" } },
      connection: { phase: "ready" },
    });
    return id;
  });
  await page
    .getByRole("button", { name: "Dibagikan ke saya", exact: true })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Menu Project Tim" }).click();
  await expect(
    page.getByRole("button", { name: "Hapus project", exact: true }),
  ).toBeDisabled();
  await page.locator(`.project-card a[href="/project/${id}"]`).first().click();
  await expect(page.getByText(/Akses Viewer · Preview/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buat file", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 30000 });
  const before = await page.evaluate(async () => {
    const path =
      performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => new URL(n).pathname === "/src/lib/store.ts") ||
      "/src/lib/store.ts";
    const { useStore } = await import(path);
    return useStore.getState().projects[0].files["src/App.tsx"];
  });
  await page.locator(".monaco-editor textarea").first().focus();
  await page.keyboard.type("THIS MUST NOT BE SAVED");
  const after = await page.evaluate(async () => {
    const path =
      performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => new URL(n).pathname === "/src/lib/store.ts") ||
      "/src/lib/store.ts";
    const { useStore } = await import(path);
    return useStore.getState().projects[0].files["src/App.tsx"];
  });
  expect(after).toBe(before);
});
test("authenticated storage dialog reports offline state on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects");
  await page.getByRole("button", { name: /^Penyimpanan:/ }).click();
  await expect(
    page.getByRole("heading", { name: "Penyimpanan workspace" }),
  ).toBeVisible();
  await expect(page.getByText(/^Akun test@example.test/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
