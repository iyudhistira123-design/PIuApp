import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_DAYS,
  paymentsNotice,
  periodLeft,
  planFacts,
  planOffers,
  rupiah,
  topupOffers,
} from "../src/lib/dashboard/plans";

// The exact products the server sells today (server/providers/payments.mjs).
const products = {
  pro: {
    kind: "plan",
    plan: "Pro",
    amount: 199000,
    credits: 800,
    label: "PiwuApp Pro · 30 hari",
  },
  team: {
    kind: "plan",
    plan: "Team",
    amount: 499000,
    credits: 2500,
    label: "PiwuApp Team · 30 hari",
  },
  credits100: {
    kind: "topup",
    amount: 49000,
    credits: 100,
    label: "Top-up 100 kredit",
  },
  credits500: {
    kind: "topup",
    amount: 199000,
    credits: 500,
    label: "Top-up 500 kredit",
  },
};

test("the upgrade page splits plans from top-ups using the server's own kind", () => {
  assert.deepEqual(
    planOffers(products, "Free").map((o) => o.sku),
    ["pro", "team"],
  );
  assert.deepEqual(
    topupOffers(products).map((o) => o.sku),
    ["credits100", "credits500"],
  );
  const [pro] = planOffers(products, "Free");
  assert.equal(pro.price, 199000);
  assert.equal(pro.credits, 800);
  assert.equal(pro.plan, "Pro");
  assert.equal(pro.perDayCredits, Math.round(800 / PLAN_DAYS));
  // The price per credit is written on the card and comes from the same model
  // the server bills with, so a package that got bigger cannot keep the old
  // rate printed beside it.
  assert.equal(pro.rate, 249);
  const [team] = planOffers(products, "Free").slice(1);
  assert.equal(team.rate, 200);
  assert.ok(team.rate < pro.rate, "a bigger package is cheaper per credit");
  // Durations are arithmetic over the real operation costs, not a promise.
  const normal = pro.durations.find((d) => d.id === "normal")!;
  const intens = pro.durations.find((d) => d.id === "intens")!;
  assert.ok(normal.perDay > 0 && intens.perDay > normal.perDay);
  assert.ok(normal.days > intens.days);
  assert.match(normal.text, /^±\d+ hari$/);
  assert.equal(pro.current, false);
  assert.equal(topupOffers(products)[0].plan, "");
});

test("only the plan the account is on is flagged as current", () => {
  const offers = planOffers(products, "Pro");
  assert.deepEqual(
    offers.map((o) => [o.sku, o.current]),
    [
      ["pro", true],
      ["team", false],
    ],
  );
  // A plan name that matches no product flags nothing.
  assert.equal(
    planOffers(products, "Enterprise").some((o) => o.current),
    false,
  );
  // Free is not a purchasable product, so nothing is marked current.
  assert.equal(
    planOffers(products, "Free").some((o) => o.current),
    false,
  );
});

test("products without a numeric price or credit are not offered", () => {
  const partial = {
    pro: { kind: "plan", plan: "Pro", amount: 199000, credits: 800 },
    broken: { kind: "plan", plan: "Broken", label: "Tanpa harga" },
    odd: { kind: "topup", amount: "gratis", credits: 10 },
  };
  assert.deepEqual(
    planOffers(partial, "Free").map((o) => o.sku),
    ["pro"],
  );
  assert.deepEqual(topupOffers(partial), []);
  // Nothing to read at all stays empty instead of inventing a product.
  assert.deepEqual(planOffers(undefined, "Free"), []);
  assert.deepEqual(topupOffers(undefined), []);
});

test("checkout is only offered when the server says payments are configured", () => {
  assert.equal(paymentsNotice(true, "midtrans").ready, true);
  assert.match(paymentsNotice(true, "midtrans").text, /midtrans/);
  assert.equal(
    paymentsNotice(false, null).ready,
    false,
    "no provider means no checkout",
  );
  assert.match(paymentsNotice(undefined, null).text, /belum dikonfigurasi/i);
  assert.match(paymentsNotice(undefined, null).text, /Kredit yang ada tetap/);
});

test("the period line counts days left and never shows a negative day", () => {
  const now = Date.parse("2026-10-16T00:00:00.000Z");
  assert.equal(periodLeft("2026-11-03T00:00:00.000Z", now), "Sisa 18 hari");
  assert.equal(periodLeft("2026-10-16T12:00:00.000Z", now), "Sisa 1 hari");
  assert.equal(periodLeft("2026-10-01T00:00:00.000Z", now), "");
  assert.equal(periodLeft("bukan tanggal", now), "");
  assert.equal(periodLeft(null, now), "");
  assert.equal(
    periodLeft("2026-10-15T23:00:00.000Z", now),
    "Masa aktif berakhir hari ini",
  );
});

test("the page states what is true about plans instead of implying gating", () => {
  const facts = planFacts();
  assert.equal(facts.length, 5);
  // Intl writes "Rp\u00a0249" with a non-breaking space; normalise it so the
  // assertions read like the text a person sees.
  const joined = facts
    .map((f) => f.title + " " + f.detail)
    .join(" ")
    .replace(/\u00a0/g, " ");
  assert.match(joined, /tidak ada penagihan otomatis/i);
  assert.match(joined, /belum diterapkan/i);
  // Credits never expire: the page must not promise a deadline.
  assert.match(joined, /tidak kedaluwarsa/i);
  assert.equal(/hangus setelah/i.test(joined), false);
  // The rate sentence is derived from the ladder, so both plans appear.
  assert.match(joined, /Pro Rp 249\/kredit/);
  assert.match(joined, /Team Rp 200\/kredit/);
  // And the durations are explained, not asserted.
  assert.match(joined, /pemakaian normal/i);
  assert.match(joined, /pemakaian intens/i);
  assert.match(joined, /50 kredit/);
  for (const fact of facts) {
    assert.ok(fact.title.length > 3);
    assert.ok(fact.detail.length > 20);
  }
});

test("prices are written as rupiah without hidden decimals", () => {
  const text = rupiah(199000);
  assert.match(text, /199\.000/);
  assert.equal(text.includes(",00"), false);
  assert.equal(rupiah(Number.NaN), rupiah(0));
});
