/**
 * The upgrade page's data, as pure functions so the wording and the arithmetic
 * can be tested without a browser.
 *
 * Where the numbers come from: `GET /api/account`, which returns the products
 * the server really sells (`server/providers/payments.mjs`) — price, credits and
 * label. Nothing here invents features per plan: this app does not gate features
 * by plan yet, and the page says so instead of implying it does.
 */
export interface ProductLike {
  kind?: string;
  plan?: string;
  amount?: number;
  credits?: number;
  label?: string;
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
  /** True when this is the plan the account is on right now. */
  current: boolean;
}

/** Plans are prepaid 30-day periods; the server says so in the product label. */
export const PLAN_DAYS = 30;

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
      title: "Kredit, bukan langganan berulang",
      detail:
        "Setiap pembelian menambah kredit dan berlaku 30 hari. Tidak ada penagihan otomatis dan tidak ada perpanjangan diam-diam.",
    },
    {
      title: "Yang membedakan paket: jumlah kredit",
      detail:
        "Saat ini Pro dan Team hanya berbeda pada harga, jumlah kredit, dan label paketnya. Pembatasan fitur per paket belum diterapkan di aplikasi ini — jadi tidak ada fitur yang dikunci diam-diam.",
    },
    {
      title: "Kredit dipakai per operasi",
      detail:
        "Percakapan AI, audit Lighthouse, dan publish memakai kredit yang tercatat di ledger. Rinciannya ada di halaman Akun & kredit.",
    },
    {
      title: "Referral bonus untuk kedua pihak",
      detail:
        "50 kredit untuk masing-masing akun setelah pembelian paket/top-up minimal Rp49.000 terverifikasi. Bonus dibatalkan bila pembayaran dikembalikan.",
    },
  ];
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
