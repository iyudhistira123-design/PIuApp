import { createHash } from "node:crypto";
import { HttpError, equal, appOrigin } from "../lib/core.mjs";
export const products = {
  pro: {
    kind: "plan",
    plan: "Pro",
    amount: 199000,
    credits: 600,
    label: "PiwuApp Pro · 30 hari",
  },
  team: {
    kind: "plan",
    plan: "Team",
    amount: 499000,
    credits: 2000,
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
export function midtransSignature(body, key) {
  if (
    !body ||
    typeof body.order_id !== "string" ||
    typeof body.status_code !== "string" ||
    typeof body.gross_amount !== "string"
  )
    return "";
  return createHash("sha512")
    .update(body.order_id + body.status_code + body.gross_amount + key)
    .digest("hex");
}
export function rupiah(value) {
  const s = String(value);
  if (!/^\d+(\.00)?$/.test(s) || !Number.isSafeInteger(Number(s)))
    throw new HttpError(400, "Nominal pembayaran tidak valid.");
  return Number(s);
}
export function verifyPaymentHook(provider, req, env) {
  if (provider === "midtrans") {
    if (
      !env.MIDTRANS_SERVER_KEY ||
      !equal(
        midtransSignature(req.body, env.MIDTRANS_SERVER_KEY),
        req.body?.signature_key,
      )
    )
      throw new HttpError(401, "Signature pembayaran tidak valid.");
    return String(req.body.order_id);
  }
  if (provider === "xendit") {
    if (
      !env.XENDIT_WEBHOOK_TOKEN ||
      !equal(req.get("x-callback-token"), env.XENDIT_WEBHOOK_TOKEN)
    )
      throw new HttpError(401, "Signature pembayaran tidak valid.");
    return String(req.body.external_id);
  }
  throw new HttpError(400, "Provider tidak dikenali.");
}
export function paymentProvider(env, fetcher = fetch) {
  const selected = env.PAYMENT_PROVIDER;
  if (!["midtrans", "xendit"].includes(selected))
    throw new HttpError(
      503,
      "Pilih provider pembayaran di environment server.",
    );
  const basic = (key) => "Basic " + Buffer.from(key + ":").toString("base64");
  const call = async (url, options = {}) => {
    const r = await fetcher(url, {
      ...options,
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok)
      throw new HttpError(
        502,
        "Provider pembayaran belum mengonfirmasi operasi. Periksa status pesanan sebelum mencoba lagi.",
      );
    return r.json();
  };
  return {
    name: selected,
    async checkout(order, label, email) {
      const origin = appOrigin(env);
      if (selected === "midtrans") {
        if (!env.MIDTRANS_SERVER_KEY)
          throw new HttpError(503, "Midtrans belum dikonfigurasi.");
        const root =
          env.PAYMENT_LIVE === "true"
            ? "https://app.midtrans.com"
            : "https://app.sandbox.midtrans.com";
        const data = await call(root + "/snap/v1/transactions", {
          method: "POST",
          headers: {
            Authorization: basic(env.MIDTRANS_SERVER_KEY),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transaction_details: {
              order_id: order.id,
              gross_amount: order.amount,
            },
            item_details: [
              {
                id: order.sku,
                price: order.amount,
                quantity: 1,
                name: label.slice(0, 50),
              },
            ],
            customer_details: { email },
            callbacks: { finish: origin + "/account?order=" + order.id },
            enabled_payments: [
              "credit_card",
              "gopay",
              "shopeepay",
              "other_qris",
              "bca_va",
              "bni_va",
              "bri_va",
              "permata_va",
              "echannel",
            ],
          }),
        });
        return { providerId: order.id, url: data.redirect_url };
      }
      if (!env.XENDIT_SECRET_KEY)
        throw new HttpError(503, "Xendit belum dikonfigurasi.");
      const data = await call("https://api.xendit.co/v2/invoices", {
        method: "POST",
        headers: {
          Authorization: basic(env.XENDIT_SECRET_KEY),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          external_id: order.id,
          amount: order.amount,
          currency: "IDR",
          description: label,
          payer_email: email,
          invoice_duration: 86400,
          success_redirect_url: origin + "/account?order=" + order.id,
          failure_redirect_url: origin + "/account?order=" + order.id,
        }),
      });
      return { providerId: data.id, url: data.invoice_url };
    },
    async status(order) {
      if (order.provider === "midtrans") {
        const root =
          env.PAYMENT_LIVE === "true"
            ? "https://api.midtrans.com"
            : "https://api.sandbox.midtrans.com";
        const d = await call(
          root + "/v2/" + encodeURIComponent(order.id) + "/status",
          { headers: { Authorization: basic(env.MIDTRANS_SERVER_KEY) } },
        );
        if (d.order_id !== order.id)
          throw new HttpError(409, "Identitas transaksi tidak cocok.");
        const paid =
          d.transaction_status === "settlement" ||
          (d.transaction_status === "capture" && d.fraud_status === "accept");
        return {
          amount: rupiah(d.gross_amount),
          currency: d.currency || "IDR",
          state: paid
            ? "paid"
            : ["refund", "chargeback"].includes(d.transaction_status)
              ? "refunded"
              : ["partial_refund", "partial_chargeback"].includes(
                    d.transaction_status,
                  )
                ? "review"
                : d.transaction_status === "expire"
                  ? "expired"
                  : ["deny", "cancel", "failure"].includes(d.transaction_status)
                    ? "failed"
                    : "pending",
        };
      }
      const d = await call(
        "https://api.xendit.co/v2/invoices/" +
          encodeURIComponent(order.provider_id),
        { headers: { Authorization: basic(env.XENDIT_SECRET_KEY) } },
      );
      if (d.external_id !== order.id)
        throw new HttpError(409, "Identitas transaksi tidak cocok.");
      return {
        amount: rupiah(d.amount),
        currency: d.currency || "IDR",
        state: ["PAID", "SETTLED"].includes(d.status)
          ? "paid"
          : d.status === "EXPIRED"
            ? "expired"
            : "pending",
      };
    },
  };
}
