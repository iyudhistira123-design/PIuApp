import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CREDIT_COSTS,
  FREE_PLAN,
  PLAN_LADDER,
  PLAN_PERIOD_DAYS,
  TOPUP_LADDER,
  USAGE_PROFILES,
  costLine,
  creditsPerDay,
  durationDays,
  lastsLabel,
  ratePerCredit,
  ratesAreMonotonic,
  usageProfile,
} from "../shared/credits.mjs";
import { products } from "../server/providers/payments.mjs";

// The point of this file: credits must follow the price. A bigger package is
// never more expensive per credit, the landing page and the checkout read the
// same ladder, and the free allowance stays exactly what the database grants.

const paid = PLAN_LADDER.filter((plan) => plan.monthly > 0);

test("the server sells exactly the credits the public ladder advertises", () => {
  for (const plan of PLAN_LADDER) {
    if (!plan.sku) continue;
    const product = products[plan.sku];
    assert.ok(product, `produk ${plan.sku} harus ada di katalog server`);
    assert.equal(product.kind, "plan");
    assert.equal(product.plan, plan.plan);
    assert.equal(product.amount, plan.monthly);
    assert.equal(product.credits, plan.credits);
    // The landing page's annual figure is a discount on the same monthly price,
    // never a bigger charge than the monthly one.
    assert.ok(plan.annual > 0 && plan.annual < plan.monthly);
  }
  for (const topup of TOPUP_LADDER) {
    const product = products[topup.sku];
    assert.ok(product, `produk ${topup.sku} harus ada di katalog server`);
    assert.equal(product.kind, "topup");
    assert.equal(product.amount, topup.amount);
    assert.equal(product.credits, topup.credits);
  }
  // No hidden SKU: every product the server sells is on a published ladder.
  const published = [
    ...PLAN_LADDER.filter((plan) => plan.sku).map((plan) => plan.sku),
    ...TOPUP_LADDER.map((topup) => topup.sku),
  ].sort();
  assert.deepEqual(Object.keys(products).sort(), published);
});

test("a bigger package is never more expensive per credit", () => {
  // Within each family of packages, paying more never buys a worse rate.
  const plans = paid.map((plan) => ({
    name: plan.plan,
    amount: plan.monthly,
    credits: plan.credits,
  }));
  const topups = TOPUP_LADDER.map((topup) => ({
    name: topup.sku,
    amount: topup.amount,
    credits: topup.credits,
  }));
  const rates = (
    packages: { name: string; amount: number; credits: number }[],
  ) =>
    packages
      .map(
        (p) =>
          `${p.name} ${p.amount}→${p.credits} (${ratePerCredit(p.amount, p.credits)} Rp/kredit)`,
      )
      .join(" > ");
  assert.ok(ratesAreMonotonic(plans), `tangga paket: ${rates(plans)}`);
  assert.ok(ratesAreMonotonic(topups), `tangga top-up: ${rates(topups)}`);
  // And the reason to upgrade before topping up: every plan is a better rate
  // than the cheapest top-up there is.
  const cheapestTopup = Math.min(
    ...topups.map((topup) => ratePerCredit(topup.amount, topup.credits)),
  );
  for (const plan of plans)
    assert.ok(
      ratePerCredit(plan.amount, plan.credits) < cheapestTopup,
      `${plan.name} harus lebih murah per kredit daripada top-up termurah`,
    );
  for (const plan of plans)
    assert.ok(ratePerCredit(plan.amount, plan.credits) > 0);
});

test("the free allowance matches exactly what the database grants", () => {
  const sql = readFileSync("supabase/003_services.sql", "utf8");
  const ensure =
    /create function public\.piwu_ensure_credits[\s\S]*?\$\$;/.exec(sql)?.[0];
  assert.ok(ensure, "piwu_ensure_credits harus ada di 003_services.sql");
  const granted = Number(
    /values\s*\(\s*p_user\s*,\s*(\d+)\s*\)/.exec(ensure)?.[1],
  );
  assert.equal(
    granted,
    FREE_PLAN.credits,
    "kredit awal di SQL dan di shared/credits.mjs harus sama",
  );
  // The plan period the payment function applies is the one the pages print.
  const interval = /interval '(\d+) days'/.exec(sql)?.[1];
  assert.equal(Number(interval), PLAN_PERIOD_DAYS);
  // Free is free: no price anywhere, and no recurring allowance.
  assert.equal(PLAN_LADDER[0].monthly, 0);
  assert.equal(PLAN_LADDER[0].once, true);
});

test("durations come from the real operation costs, in the stated order", () => {
  const [ringan, normal, intens] = USAGE_PROFILES;
  const day = (profile: (typeof USAGE_PROFILES)[number]) =>
    Math.round(creditsPerDay(profile) * 10) / 10;
  assert.ok(day(ringan) < day(normal) && day(normal) < day(intens));
  // The profiles are spelled out in operations, so the daily cost is a sum of
  // CREDIT_COSTS and nothing else. Changing a price must move this number.
  const expectedNormal =
    10 * CREDIT_COSTS.chat.Seimbang +
    1 * CREDIT_COSTS.ask +
    1 * CREDIT_COSTS.researchRound +
    (4 * CREDIT_COSTS.sandboxJob) / 7 +
    (2 * CREDIT_COSTS.audit) / PLAN_PERIOD_DAYS +
    (1 * CREDIT_COSTS.publish) / PLAN_PERIOD_DAYS;
  assert.equal(day(normal), Math.round(expectedNormal * 10) / 10);

  const pro = PLAN_LADDER.find((plan) => plan.plan === "Pro")!;
  const team = PLAN_LADDER.find((plan) => plan.plan === "Team")!;
  assert.ok(
    durationDays(pro.credits, normal) > durationDays(pro.credits, intens),
  );
  assert.ok(
    durationDays(team.credits, normal) > durationDays(pro.credits, normal),
  );
  assert.match(lastsLabel(pro.credits, usageProfile("normal")), /^±\d+ hari$/);
  // A balance that cannot cover a day says so instead of rounding up to "1 hari".
  assert.equal(lastsLabel(0, normal), "tidak cukup untuk sehari");
  assert.equal(lastsLabel(5, usageProfile("intens")), "kurang dari sehari");
  assert.equal(durationDays(Number.NaN, normal), 0);
});

test("the printed price list is generated from the costs it describes", () => {
  const line = costLine();
  for (const value of [
    CREDIT_COSTS.chat.Cepat,
    CREDIT_COSTS.chat.Seimbang,
    CREDIT_COSTS.chat.Kuat,
    CREDIT_COSTS.ask,
    CREDIT_COSTS.plan,
    CREDIT_COSTS.researchRound,
    CREDIT_COSTS.sandboxCommand,
    CREDIT_COSTS.sandboxJob,
    CREDIT_COSTS.audit,
    CREDIT_COSTS.publish,
  ])
    assert.match(line, new RegExp(`\\b${value}\\b`));
  assert.match(line, /chat Cepat 1 \/ Seimbang 3 \/ Kuat 8 kredit/);
  // Anything the page says about time is a duration of usage. Nothing here may
  // claim credits expire, because the schema has no expiry to enforce.
  assert.equal(/kedaluwarsa|hangus/i.test(line), false);
});
