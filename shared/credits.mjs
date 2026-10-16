/**
 * The credit model, in one place: what an operation costs, what "normal usage"
 * means, and how long a number of credits lasts.
 *
 * Why it lives in shared/: the server bills with these numbers and the pages
 * explain prices with the same numbers, so a plan page can never promise a
 * duration that the billing does not match. Both sides import it, like
 * shared/studio.mjs.
 *
 * Nothing here expires credits. `durationDays()` answers "how long would this
 * last at that usage", not "when does it disappear" — the database has no
 * per-credit expiry and adding one is a migration, not a display change.
 */

/** Credits charged per operation. Every reservation in the server uses these. */
export const CREDIT_COSTS = {
  /** Read-only question: one model pass, no tools. */
  ask: 1,
  /** Structured plan, approved before any build runs. */
  plan: 2,
  /** One chat turn, billed by the tier that answered it. */
  chat: { Cepat: 1, Seimbang: 3, Kuat: 8 },
  /** One search round inside a research turn. */
  researchRound: 1,
  /** A turn may ask for this many rounds; operators can lower it, never raise it. */
  researchRoundsPerRequest: 2,
  /** One shell/npm command in the sandbox. */
  sandboxCommand: 1,
  /** One build/preview/files/packages job in the sandbox. */
  sandboxJob: 2,
  /** One Lighthouse audit run. */
  audit: 3,
  /** One publish/deploy attempt. */
  publish: 5,
};

/**
 * Prepaid plan period. Must stay equal to the `interval '30 days'` in
 * supabase/003_services.sql (piwu_apply_payment); tests/credits-model.test.ts
 * fails if the two drift apart.
 */
export const PLAN_PERIOD_DAYS = 30;

/**
 * The free allowance a new account gets, once. Must stay equal to the value in
 * supabase/003_services.sql (piwu_ensure_credits); guarded by the same test.
 */
export const FREE_PLAN = {
  plan: "Free",
  credits: 30,
  once: true,
  reason: "Kredit awal",
};

/**
 * Public plan ladder: what each plan costs and how many credits it grants.
 * The server's billing catalogue (server/providers/payments.mjs) is the source
 * of truth for real purchases; tests/credits-model.test.ts fails if the two
 * disagree, and if a bigger package ever becomes pricier per credit.
 * `annual` is the already-discounted monthly figure shown on the landing page,
 * not a separate charge.
 */
export const PLAN_LADDER = [
  {
    plan: "Free",
    sku: null,
    monthly: 0,
    annual: 0,
    credits: FREE_PLAN.credits,
    once: true,
  },
  { plan: "Pro", sku: "pro", monthly: 199000, annual: 159200, credits: 800 },
  { plan: "Team", sku: "team", monthly: 499000, annual: 399200, credits: 2500 },
];

/** Top-ups have no plan and no period: they only add credits to the balance. */
export const TOPUP_LADDER = [
  { sku: "credits100", amount: 49000, credits: 100 },
  { sku: "credits500", amount: 199000, credits: 500 },
];

/**
 * What an active account does in a day, written as operations rather than as a
 * credit number, so the number follows the price list instead of guessing.
 * Weekly/monthly operations are divided down over the period.
 */
export const USAGE_PROFILES = [
  {
    id: "ringan",
    label: "pemakaian ringan",
    detail:
      "2 chat Seimbang + 1 tanya-jawab + 1 ronde riset per hari, 1 build/preview per minggu",
    chatSeimbang: 2,
    ask: 1,
    researchRounds: 1,
    sandboxJobsPerWeek: 1,
  },
  {
    id: "normal",
    label: "pemakaian normal",
    detail:
      "10 chat Seimbang + 1 tanya-jawab + 1 ronde riset per hari, 4 build/preview per minggu, 2 audit + 1 publish per bulan",
    chatSeimbang: 10,
    ask: 1,
    researchRounds: 1,
    sandboxJobsPerWeek: 4,
    auditsPerMonth: 2,
    publishesPerMonth: 1,
  },
  {
    id: "intens",
    label: "pemakaian intens",
    detail:
      "20 chat Seimbang + 4 chat Kuat + 2 tanya-jawab + 4 ronde riset per hari, 1 build/preview per hari, 8 audit + 4 publish per bulan",
    chatSeimbang: 20,
    chatKuat: 4,
    ask: 2,
    researchRounds: 4,
    sandboxJobsPerWeek: 7,
    auditsPerMonth: 8,
    publishesPerMonth: 4,
  },
];

/** One profile by id; falls back to "normal" so callers never get undefined. */
export function usageProfile(id) {
  return (
    USAGE_PROFILES.find((profile) => profile.id === id) ||
    USAGE_PROFILES.find((profile) => profile.id === "normal")
  );
}

/**
 * The price list as one honest sentence, built from CREDIT_COSTS so the text can
 * never disagree with what the server charges.
 */
export function costLine() {
  const chat = Object.entries(CREDIT_COSTS.chat)
    .map(([tier, cost]) => `${tier} ${cost}`)
    .join(" / ");
  return `chat ${chat} kredit, tanya-jawab ${CREDIT_COSTS.ask}, plan ${CREDIT_COSTS.plan}, ronde riset ${CREDIT_COSTS.researchRound} (maks ${CREDIT_COSTS.researchRoundsPerRequest} per permintaan), perintah sandbox ${CREDIT_COSTS.sandboxCommand}, build/preview ${CREDIT_COSTS.sandboxJob}, audit Lighthouse ${CREDIT_COSTS.audit}, publish ${CREDIT_COSTS.publish}`;
}

/** Credits one day of this usage mix costs, from CREDIT_COSTS. */
export function creditsPerDay(profile) {
  if (!profile) return 0;
  const per = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return (
    per(profile.chatSeimbang) * CREDIT_COSTS.chat.Seimbang +
    per(profile.chatKuat) * CREDIT_COSTS.chat.Kuat +
    per(profile.chatCepat) * CREDIT_COSTS.chat.Cepat +
    per(profile.ask) * CREDIT_COSTS.ask +
    per(profile.plan) * CREDIT_COSTS.plan +
    per(profile.researchRounds) * CREDIT_COSTS.researchRound +
    (per(profile.sandboxJobsPerWeek) * CREDIT_COSTS.sandboxJob) / 7 +
    (per(profile.auditsPerMonth) * CREDIT_COSTS.audit) / PLAN_PERIOD_DAYS +
    (per(profile.publishesPerMonth) * CREDIT_COSTS.publish) / PLAN_PERIOD_DAYS
  );
}

/** Whole days a credit balance covers at that usage; 0 when it cannot be told. */
export function durationDays(credits, profile) {
  const perDay = creditsPerDay(profile);
  const total = Number(credits);
  if (!Number.isFinite(total) || total <= 0 || perDay <= 0) return 0;
  return Math.floor(total / perDay);
}

/** "±37 hari", "±1 hari", or "kurang dari sehari" for a tiny balance. */
export function lastsLabel(credits, profile) {
  const days = durationDays(credits, profile);
  if (days >= 1) return `±${days} hari`;
  const total = Number(credits);
  if (!Number.isFinite(total) || total <= 0) return "tidak cukup untuk sehari";
  return "kurang dari sehari";
}

/** Effective price of one credit, rounded to whole rupiah. */
export function ratePerCredit(amount, credits) {
  const price = Number(amount);
  const total = Number(credits);
  if (!Number.isFinite(price) || !Number.isFinite(total) || total <= 0)
    return 0;
  return Math.round(price / total);
}

/**
 * The rule the paid products follow: a bigger package is never more expensive
 * per credit than a smaller one. tests/credits-model.test.ts checks the real
 * product list against this, so a hand-edited number cannot silently invert it.
 */
export function ratesAreMonotonic(offers) {
  const rates = offers.map((offer) =>
    ratePerCredit(offer.amount, offer.credits),
  );
  return rates.every((rate, index) => index === 0 || rate <= rates[index - 1]);
}
