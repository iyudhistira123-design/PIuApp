import {
  CREDIT_COSTS,
  PLAN_LADDER,
  PLAN_PERIOD_DAYS,
  USAGE_PROFILES,
  costLine,
  durationDays,
  lastsLabel,
  ratePerCredit,
  usageProfile,
} from "../../../shared/credits.mjs";

/**
 * The upgrade page's data, as pure functions so the wording and the arithmetic
 * can be tested without a browser.
 *
 * Where the numbers come from: `GET /api/account`, which returns the products
 * the server really sells (`server/providers/payments.mjs`) — price, credits and
 * label. How long those credits last comes from `shared/credits.mjs`, the same
 * price list the server bills with, so the page cannot promise a duration the
 * billing does not match. Nothing here invents features per plan: this app does
 * not gate features by plan yet, and the page says so instead of implying it.
 */
export interface ProductLike {
  kind?: string;
  plan?: string;
  amount?: number;
  credits?: number;
  label?: string;
}

export interface DurationRow {
  id: string;
  label: string;
  detail: string;
  /** Credits this profile spends per day, from the operations it lists. */
  perDay: number;
  days: number;
  text: string;
}

export interface Offer {
  sku: string;
  label: string;
  price: number;
  credits: number;
  /** Plan name for a subscription product, empty for a top-up. */
  plan: string;
  /** What the price buys per day over the 30-day period (arithmetic, not a promise). */
  perDayCredits: number;
  /** Effective price of one credit at this package size. */
  rate: number;
  /** How long these credits last at each usage profile, from the real costs. */
  durations: DurationRow[];
  /** True when this is the plan the account is on right now. */
  current: boolean;
}

/**
 * How long a paid plan's period runs. This is a duration of the *plan*, not of
 * the credits: credits are a balance and the database expires nothing. The
 * server applies the same 30 days in supabase/003_services.sql.
 */
export const PLAN_DAYS = PLAN_PERIOD_DAYS;

/** Rupiah per credit, and how long a balance lasts, at every usage profile. */
export function priceFacts(price: number, credits: number) {
  return {
    rate: ratePerCredit(price, credits),
    durations: creditDurations(credits),
  };
}

/** The usage profiles as table rows: what a day looks like, and what it costs. */
export function usageRows() {
  return USAGE_PROFILES.map((profile) => ({
    id: profile.id,
    label: profile.label,
    detail: profile.detail,
    perDay: Math.round(creditsPerDayOf(profile.id) * 10) / 10,
  }));
}

/** Durations for a credit balance, one row per usage profile. */
export function creditDurations(credits: number): DurationRow[] {
  return USAGE_PROFILES.map((profile) => ({
    id: profile.id,
    label: profile.label,
    detail: profile.detail,
    perDay: Math.round(creditsPerDayOf(profile.id) * 10) / 10,
    days: durationDays(credits, profile),
    text: lastsLabel(credits, profile),
  }));
}

/** Credits one day of a named usage profile costs. */
export function creditsPerDayOf(profileId: string) {
  const profile = usageProfile(profileId);
  const per = (value?: number) => (value ? Number(value) : 0);
  return (
    per(profile.chatSeimbang) * CREDIT_COSTS.chat.Seimbang +
    per(profile.chatKuat) * CREDIT_COSTS.chat.Kuat +
    per(profile.ask) * CREDIT_COSTS.ask +
    per(profile.researchRounds) * CREDIT_COSTS.researchRound +
    (per(profile.sandboxJobsPerWeek) * CREDIT_COSTS.sandboxJob) / 7 +
    (per(profile.auditsPerMonth) * CREDIT_COSTS.audit) / PLAN_PERIOD_DAYS +
    (per(profile.publishesPerMonth) * CREDIT_COSTS.publish) / PLAN_PERIOD_DAYS
  );
}

/** Re-exported from the shared model so pages import one module, not two. */
export {
  costLine,
  lastsLabel,
  usageProfile,
} from "../../../shared/credits.mjs";

/** Plain counts written the Indonesian way (2.500, not 2500). */
export function count(value: number) {
  return new Intl.NumberFormat("id-ID").format(
    Number.isFinite(Number(value)) ? Number(value) : 0,
  );
}

export function rupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function toOffer(
  sku: string,
  product: ProductLike,
  currentPlan: string,
  kind: string,
): Offer | null {
  const price = Number(product?.amount);
  const credits = Number(product?.credits);
  if (!Number.isFinite(price) || !Number.isFinite(credits)) return null;
  return {
    sku,
    label: product.label || sku,
    price,
    credits,
    plan: product.plan || "",
    perDayCredits: Math.round(credits / PLAN_DAYS),
    ...priceFacts(price, credits),
    current:
      kind === "plan" &&
      Boolean(currentPlan) &&
      (product.plan || "").toLowerCase() === currentPlan.toLowerCase(),
  };
}

/** Products the server sells, with their kind kept beside the parsed offer. */
function pricedProducts(
  products: Record<string, ProductLike> | undefined,
  currentPlan: string,
) {
  return Object.entries(products || {}).flatMap(([sku, product]) => {
    const kind = product?.kind || "topup";
    const offer = toOffer(sku, product, currentPlan, kind);
    return offer ? [{ kind, offer }] : [];
  });
}

export const planOffers = (
  products: Record<string, ProductLike> | undefined,
  currentPlan = "Free",
) =>
  pricedProducts(products, currentPlan)
    .filter((entry) => entry.kind === "plan")
    .map((entry) => entry.offer);

export const topupOffers = (
  products: Record<string, ProductLike> | undefined,
) =>
  pricedProducts(products, "")
    .filter((entry) => entry.kind === "topup")
    .map((entry) => entry.offer);

/**
 * What the page may promise about paying. When payments are off, this is the
 * sentence shown instead of a checkout button that cannot work.
 */
export function paymentsNotice(
  paymentsEnabled: boolean | undefined,
  provider: string | null | undefined,
) {
  if (paymentsEnabled)
    return {
      ready: true,
      text: `Checkout dibuka oleh provider${provider ? ` (${provider})` : ""}. Metode pembayaran yang tersedia dipilih di halaman provider. Prabayar 30 hari — tanpa penagihan otomatis.`,
    };
  return {
    ready: false,
    text: "Pembayaran belum dikonfigurasi di server ini, jadi tombol checkout dinonaktifkan dan tidak ada tagihan yang dibuat. Kredit yang ada tetap bisa dipakai.",
  };
}

/**
 * What is true about plans today. Kept as data so the page cannot drift into
 * advertising a gated feature that does not exist.
 */
export function planFacts() {
  return [
    {
      title: "Kredit tidak kedaluwarsa",
      detail:
        "Kredit yang masuk ke saldo tidak hangus dan tidak punya tanggal kedaluwarsa. Yang berjalan 30 hari adalah masa paket, bukan kreditnya: tidak ada penagihan otomatis dan tidak ada perpanjangan diam-diam.",
    },
    {
      title: "Harga menentukan jumlah kredit",
      detail: `${rateSentence()} Semakin besar paket, semakin murah harga per kreditnya. Free tetap 30 kredit sekali untuk mencoba — tanpa tagihan dan tanpa reset bulanan. Saat ini Pro dan Team hanya berbeda pada harga dan jumlah kreditnya: pembatasan fitur per paket belum diterapkan di aplikasi ini, jadi tidak ada fitur yang dikunci diam-diam.`,
    },
    {
      title: "Perkiraan berapa lama jatah bertahan",
      detail: `Durasi di halaman ini aritmetika dari daftar harga di bawah, bukan janji: ${profileSentence()}`,
    },
    {
      title: "Kredit dipakai per operasi",
      detail: `Tidak ada biaya langganan per operasi di luar saldo. ${costLine()}. Rinciannya tercatat di ledger dan bisa dilihat di halaman Akun & kredit.`,
    },
    {
      title: "Referral bonus untuk kedua pihak",
      detail:
        "50 kredit untuk masing-masing akun setelah pembelian paket/top-up minimal Rp49.000 terverifikasi. Bonus dibatalkan bila pembayaran dikembalikan.",
    },
  ];
}

/** "Pro Rp 249/kredit · Team Rp 200/kredit" — computed, never typed twice. */
function rateSentence() {
  return PLAN_LADDER.filter((plan) => plan.monthly > 0)
    .map(
      (plan) =>
        `${plan.plan} ${rupiah(ratePerCredit(plan.monthly, plan.credits))}/kredit`,
    )
    .join(" · ");
}

/** One clause per usage profile, built from the profile definitions. */
function profileSentence() {
  return USAGE_PROFILES.map(
    (profile) =>
      `${profile.label} ${profile.detail} (±${Math.round(creditsPerDayOf(profile.id) * 10) / 10} kredit/hari)`,
  ).join("; ");
}

/**
 * "Sisa 18 hari" from the active period. An expired end date is reported as
 * ended today only when it really is today; older dates return nothing rather
 * than a line that implies the plan is still running.
 */
export function periodLeft(currentPeriodEnd?: string | null, now = Date.now()) {
  if (!currentPeriodEnd) return "";
  const end = Date.parse(currentPeriodEnd);
  if (Number.isNaN(end)) return "";
  const days = Math.ceil((end - now) / 86400000);
  if (days > 0) return `Sisa ${days} hari`;
  if (days === 0) return "Masa aktif berakhir hari ini";
  return "";
}
