import express from "express";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { check, wrap, HttpError } from "../lib/core.mjs";
import { rateLimit } from "../lib/context.mjs";
export function aggregateAnalytics(events) {
  const days = {},
    pages = {},
    referrers = {},
    devices = {};
  const visitors = new Set();
  for (const e of events) {
    const day = e.created_at.slice(0, 10);
    days[day] = (days[day] || 0) + 1;
    pages[e.path] = (pages[e.path] || 0) + 1;
    referrers[e.referrer || "Langsung"] =
      (referrers[e.referrer || "Langsung"] || 0) + 1;
    devices[e.device] = (devices[e.device] || 0) + 1;
    if (e.visitor_hash) visitors.add(e.visitor_hash);
  }
  const sorted = (o) =>
    Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));
  return {
    pageviews: events.length,
    dailyDevices: visitors.size,
    days: Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    pages: sorted(pages),
    referrers: sorted(referrers),
    devices: sorted(devices),
  };
}
export function registerAnalytics(app, ctx) {
  app.post(
    "/api/public/analytics",
    express.text({ type: "text/plain", limit: "4kb" }),
    rateLimit({ max: 120 }),
    wrap(async (req, res) => {
      let parsed;
      try {
        parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      } catch {
        throw new HttpError(400, "Payload tidak valid.");
      }
      const event = z
        .object({
          projectId: z.uuid(),
          path: z.string().startsWith("/").max(500),
          referrer: z.string().max(253),
          device: z.enum(["desktop", "tablet", "mobile"]),
        })
        .parse(parsed);
      const site = check(
        await ctx
          .needAdmin()
          .from("project_sites")
          .select("url,custom_domain,domain_status")
          .eq("project_id", event.projectId)
          .maybeSingle(),
      );
      if (!site) throw new HttpError(404, "Aplikasi tidak dipublikasikan.");
      const allowed = [
        new URL(site.url).origin,
        ...(site.domain_status === "active"
          ? ["https://" + site.custom_domain]
          : []),
      ];
      const origin = req.get("origin");
      if (!allowed.includes(origin))
        throw new HttpError(403, "Origin analytics tidak diizinkan.");
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      if (req.get("DNT") === "1" || req.get("Sec-GPC") === "1")
        return res.status(204).end();
      const day = new Date().toISOString().slice(0, 10);
      const visitor = ctx.env.ANALYTICS_HASH_KEY
        ? createHmac("sha256", ctx.env.ANALYTICS_HASH_KEY)
            .update(
              day +
                "|" +
                req.ip +
                "|" +
                (req.get("User-Agent") || "").slice(0, 200),
            )
            .digest("hex")
        : null;
      check(
        await ctx.admin.from("analytics_events").insert({
          project_id: event.projectId,
          path: event.path.split("?")[0],
          referrer: event.referrer.replace(/[^a-zA-Z0-9.-]/g, "").slice(0, 253),
          device: event.device,
          visitor_hash: visitor,
        }),
      );
      res.status(204).end();
    }),
  );
  app.get(
    "/api/projects/:id/analytics",
    ctx.auth,
    ctx.project(),
    wrap(async (req, res) => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const events = [];
      for (let offset = 0; offset < 10000; offset += 1000) {
        const rows = check(
          await ctx.admin
            .from("analytics_events")
            .select("path,referrer,device,visitor_hash,created_at")
            .eq("project_id", req.project.id)
            .gte("created_at", since)
            .order("id", { ascending: false })
            .range(offset, offset + 999),
        );
        events.push(...rows);
        if (rows.length < 1000) break;
      }
      res.json({
        ...aggregateAnalytics(events),
        periodDays: 30,
        sampled: events.length === 10000,
        notice:
          "Tanpa cookie atau IP mentah. Estimasi perangkat dirotasi per hari; bukan jumlah individu unik. DNT/GPC dihormati.",
      });
    }),
  );
}
