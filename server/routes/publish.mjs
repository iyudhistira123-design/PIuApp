import { siteSettings, userActive, projectUnlocked } from "../lib/platform.mjs";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  HttpError,
  check,
  wrap,
  capabilities,
  appOrigin,
} from "../lib/core.mjs";
import { rateLimit } from "../lib/context.mjs";
import { CREDIT_COSTS } from "../../shared/credits.mjs";
export function analyticsScript(origin, id) {
  return `<script>(()=>{if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl)return;const send=()=>{const payload={projectId:${JSON.stringify(id)},path:location.pathname.slice(0,500),referrer:document.referrer?new URL(document.referrer).hostname:'',device:innerWidth<640?'mobile':innerWidth<1024?'tablet':'desktop'};fetch(${JSON.stringify(origin + "/api/public/analytics")},{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload),keepalive:true,credentials:'omit'}).catch(()=>{});};send();addEventListener('popstate',send);})();</script>`;
}
export function registerPublish(app, ctx, hosting) {
  app.get(
    "/api/projects/:id/deployments",
    ctx.auth,
    ctx.project(),
    wrap(async (req, res) =>
      res.json({
        site: check(
          await ctx.admin
            .from("project_sites")
            .select("url,custom_domain,domain_status")
            .eq("project_id", req.project.id)
            .maybeSingle(),
        ),
        deployments: check(
          await ctx.admin
            .from("deployments")
            .select("id,url,status,revision,error,created_at")
            .eq("project_id", req.project.id)
            .order("created_at", { ascending: false })
            .limit(20),
        ),
        jobs: check(
          await ctx.admin
            .from("publish_jobs")
            .select("id,status,error,created_at")
            .eq("project_id", req.project.id)
            .order("created_at", { ascending: false })
            .limit(10),
        ),
      }),
    ),
  );
  app.post(
    "/api/projects/:id/publish",
    ctx.auth,
    ctx.project("Owner"),
    rateLimit({ max: 3, windowMs: 600000 }),
    wrap(async (req, res) => {
      if (!capabilities(ctx.env).publish)
        throw new HttpError(
          503,
          "Konfigurasi E2B, Netlify, dan APP_BASE_URL diperlukan untuk publish.",
        );
      const { payload, revision } = await ctx.snapshot(req.project.id);
      if (payload.kind && payload.kind !== "webapp")
        throw new HttpError(
          409,
          "Hosting web tidak dapat mempublikasikan aplikasi native atau place Roblox.",
        );
      if (
        check(
          await ctx.admin
            .from("publish_jobs")
            .select("id")
            .eq("project_id", req.project.id)
            .in("status", ["queued", "building"])
            .limit(1),
        ).length
      )
        throw new HttpError(
          409,
          "Project ini masih memiliki build yang berjalan.",
        );
      const id = randomUUID();
      await ctx.reserve(req.user.id, id, CREDIT_COSTS.publish, "publish");
      try {
        check(
          await ctx.admin.from("publish_jobs").insert({
            id,
            project_id: req.project.id,
            user_id: req.user.id,
            snapshot: payload,
            revision,
          }),
        );
        res.status(202).json({
          jobId: id,
          status: "queued",
          notice:
            "Build dan Lighthouse dijalankan sebelum deployment. Kredit dikembalikan jika proses gagal.",
        });
      } catch (e) {
        await ctx.finish(id, false).catch(() => {});
        throw e;
      }
    }),
  );
  app.delete(
    "/api/projects/:id/publish",
    ctx.auth,
    ctx.project("Owner"),
    wrap(async (req, res) => {
      if (
        check(
          await ctx.admin
            .from("publish_jobs")
            .select("id")
            .eq("project_id", req.project.id)
            .in("status", ["queued", "building"])
            .limit(1),
        ).length
      )
        throw new HttpError(
          409,
          "Tunggu build selesai sebelum menghentikan publikasi.",
        );
      const site = check(
        await ctx.admin
          .from("project_sites")
          .select("provider_site_id")
          .eq("project_id", req.project.id)
          .maybeSingle(),
      );
      if (site) {
        await hosting.remove(site.provider_site_id);
        check(
          await ctx.admin
            .from("project_sites")
            .delete()
            .eq("project_id", req.project.id),
        );
        check(
          await ctx.admin
            .from("deployments")
            .update({ status: "unpublished" })
            .eq("project_id", req.project.id),
        );
      }
      res.json({ unpublished: true });
    }),
  );
  app.post(
    "/api/projects/:id/domain",
    ctx.auth,
    ctx.project("Owner"),
    wrap(async (req, res) => {
      const domain = z
        .string()
        .toLowerCase()
        .max(253)
        .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
        .parse(req.body.domain);
      if (domain.endsWith(".local") || domain.endsWith(".internal"))
        throw new HttpError(400, "Gunakan domain publik yang Anda miliki.");
      const site = check(
        await ctx.admin
          .from("project_sites")
          .select("*")
          .eq("project_id", req.project.id)
          .single(),
      );
      await hosting.domain(site.provider_site_id, domain);
      check(
        await ctx.admin
          .from("project_sites")
          .update({ custom_domain: domain, domain_status: "pending_dns" })
          .eq("project_id", req.project.id),
      );
      res.json({
        domain,
        status: "pending_dns",
        dns: { type: "CNAME", target: new URL(site.url).hostname },
        notice:
          "Atur DNS di registrar. Untuk apex domain ikuti panduan DNS hosting. SSL baru aktif setelah verifikasi DNS berhasil.",
      });
    }),
  );
  app.post(
    "/api/projects/:id/domain/verify",
    ctx.auth,
    ctx.project("Owner"),
    wrap(async (req, res) => {
      const site = check(
        await ctx.admin
          .from("project_sites")
          .select("*")
          .eq("project_id", req.project.id)
          .single(),
      );
      const ssl = await hosting.certificate(site.provider_site_id);
      const active =
        ssl.state === "issued" &&
        Array.isArray(ssl.domains) &&
        ssl.domains.includes(site.custom_domain);
      check(
        await ctx.admin
          .from("project_sites")
          .update({ domain_status: active ? "active" : "pending_dns" })
          .eq("project_id", req.project.id),
      );
      res.json({
        status: active ? "active" : "pending_dns",
        certificate: ssl.state || "pending",
      });
    }),
  );
  app.post(
    "/api/projects/:id/rollback/:deployId",
    ctx.auth,
    ctx.project("Owner"),
    wrap(async (req, res) => {
      const deployment = check(
        await ctx.admin
          .from("deployments")
          .select("*")
          .eq("id", req.params.deployId)
          .eq("project_id", req.project.id)
          .eq("status", "ready")
          .single(),
      );
      const site = check(
        await ctx.admin
          .from("project_sites")
          .select("*")
          .eq("project_id", req.project.id)
          .single(),
      );
      await hosting.rollback(
        site.provider_site_id,
        deployment.provider_deploy_id,
      );
      res.json({ restored: true, url: site.url });
    }),
  );
}
export function startPublishWorker(ctx, sandbox, hosting) {
  let active = false,
    stopped = false;
  const tick = async () => {
    if (active || stopped || !ctx.admin) return;
    active = true;
    let job, deploymentId;
    try {
      if (ctx.env.NETLIFY_TOKEN) {
        const pending = check(
          await ctx.admin
            .from("hosting_cleanup_jobs")
            .select("id,provider_site_id,attempts")
            .lt("attempts", 5)
            .order("created_at")
            .limit(1),
        );
        for (const row of pending) {
          try {
            await hosting.remove(row.provider_site_id);
            check(
              await ctx.admin
                .from("hosting_cleanup_jobs")
                .delete()
                .eq("id", row.id),
            );
          } catch {
            await ctx.admin
              .from("hosting_cleanup_jobs")
              .update({
                attempts: row.attempts + 1,
                error:
                  "Penghapusan hosting belum dikonfirmasi. Periksa provider dan ulangi.",
              })
              .eq("id", row.id);
          }
        }
      }
      if (!capabilities(ctx.env).publish) return;
      const settings = await siteSettings(ctx);
      if (
        settings.value.maintenance ||
        settings.value.enabled_services?.publish === false ||
        settings.value.enabled_services?.sandbox === false
      )
        return;
      job = check(await ctx.admin.rpc("piwu_claim_publish"))?.[0];
      if (!job) return;
      await userActive(ctx, job.user_id);
      await projectUnlocked(ctx, job.project_id);
      const p = check(
        await ctx.admin
          .from("projects")
          .select("owner_id")
          .eq("id", job.project_id)
          .single(),
      );
      if (p.owner_id !== job.user_id)
        throw new HttpError(403, "Akses pemilik berubah.");
      const { zip, report } = await sandbox.build(job.snapshot.files, {
        audit: true,
      });
      check(
        await ctx.admin.from("scan_reports").insert({
          project_id: job.project_id,
          type: "lighthouse",
          score: report.scores.performance,
          findings: report,
        }),
      );
      if (
        ["performance", "accessibility", "seo"].some(
          (k) => typeof report.scores[k] !== "number" || report.scores[k] < 60,
        )
      )
        throw new HttpError(
          422,
          "Lighthouse di bawah 60 atau audit belum lengkap. Tinjau laporan, perbaiki, lalu publish kembali.",
        );
      const origin = appOrigin(ctx.env);
      const html = await zip.file("index.html").async("string");
      const script = analyticsScript(origin, job.project_id);
      zip.file(
        "index.html",
        /<\/body\s*>/i.test(html)
          ? html.replace(/<\/body\s*>/i, script + "</body>")
          : html + script,
      );
      if (!zip.file("_redirects"))
        zip.file("_redirects", "/* /index.html 200\n");
      const ownerNow = check(
        await ctx.admin
          .from("projects")
          .select("owner_id")
          .eq("id", job.project_id)
          .maybeSingle(),
      );
      if (ownerNow?.owner_id !== job.user_id)
        throw new HttpError(
          403,
          "Project dihapus atau izin berubah selama build.",
        );
      await userActive(ctx, job.user_id);
      await projectUnlocked(ctx, job.project_id);
      const settingsNow = await siteSettings(ctx);
      if (
        settingsNow.value.maintenance ||
        settingsNow.value.enabled_services?.publish === false ||
        settingsNow.value.enabled_services?.sandbox === false
      )
        throw new HttpError(503, "Publish dijeda administrator.");
      let site = check(
        await ctx.admin
          .from("project_sites")
          .select("*")
          .eq("project_id", job.project_id)
          .maybeSingle(),
      );
      if (!site) {
        const name = "piwu-" + job.project_id;
        const created = await hosting.createSite(name);
        try {
          site = check(
            await ctx.admin
              .from("project_sites")
              .insert({
                project_id: job.project_id,
                provider_site_id: created.id,
                url: created.ssl_url || created.url,
              })
              .select()
              .single(),
          );
        } catch (error) {
          try {
            await hosting.remove(created.id);
          } catch {
            await ctx.admin
              .from("hosting_cleanup_jobs")
              .upsert(
                { provider_site_id: created.id },
                { onConflict: "provider_site_id" },
              );
          }
          throw error;
        }
      }
      const response = await hosting.deploy(
        site.provider_site_id,
        await zip.generateAsync({ type: "nodebuffer" }),
      );
      const deployment = check(
        await ctx.admin
          .from("deployments")
          .insert({
            project_id: job.project_id,
            url: response.ssl_url || site.url,
            status: "uploading",
            revision: job.revision,
            provider_deploy_id: response.id,
          })
          .select()
          .single(),
      );
      deploymentId = deployment.id;
      let ready = response.state === "ready";
      for (let i = 0; i < 30 && !ready && !stopped; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await hosting.status(response.id);
        if (status.state === "error")
          throw new HttpError(502, "Hosting gagal memproses deployment.");
        ready = status.state === "ready";
      }
      if (!ready)
        throw new HttpError(
          504,
          "Hosting belum mengonfirmasi deployment dalam batas waktu. Periksa dashboard hosting sebelum mengulang.",
        );
      check(
        await ctx.admin.rpc("piwu_complete_publish", {
          p_job: job.id,
          p_deployment: deployment.id,
        }),
      );
    } catch (e) {
      if (job) {
        if (deploymentId)
          await ctx.admin
            .from("deployments")
            .update({
              status: "unconfirmed",
              error:
                "Status deployment belum dikonfirmasi. Periksa dashboard hosting.",
            })
            .eq("id", deploymentId)
            .neq("status", "ready");
        await ctx.admin
          .from("publish_jobs")
          .update({
            status: "failed",
            error:
              e instanceof HttpError
                ? e.message
                : "Build gagal atau layanan tidak dapat dijangkau.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "building");
        await ctx.finish(job.id, false).catch(() => {});
      }
    } finally {
      active = false;
    }
  };
  const timer = setInterval(() => void tick(), 3000);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
