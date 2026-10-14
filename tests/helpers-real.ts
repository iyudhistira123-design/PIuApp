import type { Page } from "@playwright/test";
// Network fixtures ONLY for browser regression tests, never imported by src/.
// Exercises the real Supabase login/RPC client and authenticated AI API path;
// it does not establish that any external provider is live.
export async function realAccountFixture(page: Page, ai = true) {
  const user = {
    id: "d29f9dc0-cb78-4a4a-8d4c-30d287c7b1fa",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.test",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: { name: "Akun Uji" },
    created_at: new Date().toISOString(),
  };
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  const session = {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test-signature`,
    refresh_token: "test-only-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
  const rows = new Map<string, any>();
  const calls: { path: string; body: any }[] = [];
  await page.route("**/auth/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    await route.fulfill({
      json: url.pathname.endsWith("/user") ? user : session,
    });
  });
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const body = route.request().postDataJSON() || {};
    calls.push({ path, body });
    if (path === "piwu_save_workspace") {
      const old = rows.get(body.p_id);
      if ((old?.revision || 0) !== body.p_expected_revision)
        return route.fulfill({
          status: 409,
          json: { code: "23505", message: "PIWU_CONFLICT" },
        });
      const row = {
        project_id: body.p_id,
        payload: body.p_payload,
        revision: (old?.revision || 0) + 1,
        access_role: "Owner",
        owner_id: user.id,
        updated_at: new Date().toISOString(),
      };
      rows.set(body.p_id, row);
      return route.fulfill({ json: [row] });
    }
    if (path === "piwu_delete_workspace") rows.delete(body.p_id);
    await route.fulfill({
      json: path === "piwu_list_workspaces" ? [...rows.values()] : null,
    });
  });
  await page.routeWebSocket("**/realtime/v1/**", (ws) => ws.close());
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: {
        mode: "real",
        ai: ai ? "configured" : "not_configured",
        storage: "supabase-configured",
        capabilities: {
          auth: true,
          cloud: true,
          ai,
          sandbox: false,
          publish: false,
          payments: false,
        },
        verification: "configuration-only",
      },
    }),
  );
  await page.route("**/api/public/site", (r) =>
    r.fulfill({ json: { configured: true, settings: {}, broadcasts: [] } }),
  );
  await page.route("**/api/public/readiness", (r) =>
    r.fulfill({
      json: {
        mode: "real",
        auth: "reachable",
        database: "reachable",
        ai: ai ? "configured_unverified" : "not_configured",
        sandbox: "not_configured",
        publish: "not_configured",
        payments: "not_configured",
        whatsapp: "not_configured",
        secrets: "not_configured",
      },
    }),
  );
  await page.route("**/api/announcements**", (r) =>
    r.fulfill({ json: { broadcasts: [] } }),
  );
  await page.route("**/api/projects/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith("/ai")) {
      const b = r.request().postDataJSON();
      const result: any = {
        content:
          b.mode === "Ask"
            ? "Jawaban provider pengujian tentang struktur project."
            : "Respons API pengujian diterima.",
      };
      if (b.mode === "Plan")
        result.plan = {
          goal: b.prompt,
          approved: false,
          tasks: [
            { text: "Rencana dari fixture provider", done: false, comment: "" },
          ],
        };
      if (b.mode === "Builder" && /biru/.test(b.prompt))
        result.files = {
          "src/styles.css":
            b.files["src/styles.css"] + "\nbody {color:#2857aa;}",
        };
      return r.fulfill({
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ type: "result", result })}\n\n`,
      });
    }
    // Offline service contract fixtures; no shell, hosting, or payments called.
    if (path.endsWith("/hosting"))
      return r.fulfill({ json: { hosting: null, jobs: [] } });
    if (path.endsWith("/invites"))
      return r.fulfill({ json: { members: [], invites: [] } });
    if (path.endsWith("/recordings"))
      return r.fulfill({ json: { recordings: [] } });
    return r.fulfill({
      status: 503,
      json: { error: "Layanan pengujian belum dikonfigurasi." },
    });
  });
  return { rows, calls, user };
}
export async function loginRealFixture(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("anda@email.com").fill("test@example.test");
  await page
    .locator('input[type="password"]')
    .fill("test-password-not-a-real-credential");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  // Wait for the authenticated route before a caller starts another navigation.
  await page.waitForURL(/\/(?:projects(?:[/?#]|$)|project\/)/);
}
