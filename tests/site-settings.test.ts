import test from "node:test";
import assert from "node:assert/strict";
import { defaultSite, enforcePlatform } from "../server/lib/platform.mjs";
import { siteSchema } from "../server/routes/admin.mjs";
import { productCatalog, products } from "../server/providers/payments.mjs";
import { mergePlans, mergeTopups } from "../shared/credits.mjs";

// The admin panel can change package prices/credits and pause the Studio
// bridge. These tests keep the defaults honest and stop a save from producing a
// catalogue where a bigger package is worse, or a switch that does nothing.

const withOverrides = (overrides: Record<string, any>) => ({
  ...defaultSite,
  enabled_services: {
    ...defaultSite.enabled_services,
    plan_overrides: overrides,
  },
});

test("without overrides the catalogue is exactly the shared price list", () => {
  assert.deepEqual(productCatalog(), products);
  assert.deepEqual(productCatalog({}), products);
  assert.equal(products.pro.amount, 199000);
  assert.equal(products.pro.credits, 1500);
  assert.equal(products.pro.label, "PiwuApp Pro · 30 hari");
  assert.equal(products.credits1400.label, "Top-up 1.400 kredit");
  assert.equal(defaultSite.enabled_services.studio, true);
  assert.deepEqual(defaultSite.enabled_services.plan_overrides, {});
});

test("an override moves only the price and credits it names", () => {
  const catalog = productCatalog({
    pro: { amount: 249000, credits: 2000 },
  });
  assert.equal(catalog.pro.amount, 249000);
  assert.equal(catalog.pro.credits, 2000);
  // Everything else stays on the default ladder.
  assert.equal(catalog.team.amount, products.team.amount);
  assert.equal(catalog.team.credits, products.team.credits);
  assert.deepEqual(catalog.credits300, products.credits300);
  // The label follows the new credit amount for a top-up.
  const topup = productCatalog({
    credits1400: { amount: 149000, credits: 2000 },
  });
  assert.equal(topup.credits1400.label, "Top-up 2.000 kredit");
});

test("the saved schema accepts the panel payload and rejects worse packages", () => {
  assert.ok(
    siteSchema.parse(
      withOverrides({
        pro: { amount: 249000, credits: 2000 },
        team: { amount: 499000, credits: 5000 },
      }),
    ),
  );
  // Settings saved before the Studio switch and the price overrides existed
  // still load and save.
  const legacyServices = {
    ...defaultSite.enabled_services,
  } as Record<string, any>;
  delete legacyServices.studio;
  delete legacyServices.plan_overrides;
  assert.ok(
    siteSchema.parse({ ...defaultSite, enabled_services: legacyServices }),
  );

  const plan = { amount: 199000, credits: 1500 };
  const team = { amount: 499000, credits: 4500 };
  // Team must grant more credits…
  assert.throws(
    () =>
      siteSchema.parse(
        withOverrides({ pro: { ...plan, credits: 6000 }, team }),
      ),
    /Team harus memberi kredit lebih banyak/,
  );
  // …and must not be more expensive per credit than Pro.
  assert.throws(
    () =>
      siteSchema.parse(
        withOverrides({ pro: plan, team: { amount: 900000, credits: 4600 } }),
      ),
    /tidak boleh lebih mahal/,
  );
  // Top-ups follow the same rule.
  assert.throws(
    () =>
      siteSchema.parse(
        withOverrides({
          credits300: { amount: 49000, credits: 300 },
          credits1400: { amount: 199000, credits: 200 },
        }),
      ),
    /Top-up besar harus memberi kredit lebih banyak/,
  );
  assert.throws(
    () =>
      siteSchema.parse(withOverrides({ pro: { amount: 0, credits: 1500 } })),
    /Too small|greater than or equal/i,
  );
});

test("the Studio switch is enforced on plugin and project bridge paths", async () => {
  const ctx = (studio: boolean) => ({
    env: {},
    admin: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                revision: 1,
                value: {
                  ...defaultSite,
                  enabled_services: {
                    ...defaultSite.enabled_services,
                    studio,
                  },
                },
              },
            }),
          }),
        }),
      }),
    },
  });
  const request = (path: string) => ({ path, method: "POST", body: {} });
  await assert.rejects(
    () =>
      enforcePlatform(ctx(false) as any, request("/api/studio/status") as any),
    /dinonaktifkan administrator/,
  );
  await assert.rejects(
    () =>
      enforcePlatform(
        ctx(false) as any,
        request("/api/projects/abc/studio/connect") as any,
      ),
    /dinonaktifkan administrator/,
  );
  // Enabled: the guard passes.
  await enforcePlatform(ctx(true) as any, request("/api/studio/status") as any);
  // A path that merely mentions studio is not the bridge.
  await enforcePlatform(
    ctx(false) as any,
    request("/api/projects/status") as any,
  );
});

test("merge helpers keep the database-owned numbers untouched", () => {
  const plans = mergePlans({ pro: { amount: 249000, credits: 2000 } });
  const pro = plans.find((row) => row.plan === "Pro")!;
  assert.equal(pro.daily, 30);
  assert.equal(pro.expiryMonths, 2);
  assert.equal(pro.monthlyCap, null);
  assert.equal(plans.find((row) => row.plan === "Free")!.credits, 20);
  const topups = mergeTopups({ credits300: { credits: 350 } });
  assert.equal(topups[0].credits, 350);
  assert.equal(topups[0].amount, 49000);
  assert.equal(topups[1].credits, 1400);
});
