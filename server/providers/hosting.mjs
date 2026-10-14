import { HttpError } from "../lib/core.mjs";
export class NetlifyHosting {
  constructor(env, fetcher = fetch) {
    this.env = env;
    this.fetcher = fetcher;
  }
  async call(
    path,
    { method = "GET", body, zip = false, allowMissing = false } = {},
  ) {
    if (!this.env.NETLIFY_TOKEN)
      throw new HttpError(503, "Hosting belum dikonfigurasi.");
    const r = await this.fetcher("https://api.netlify.com/api/v1" + path, {
      method,
      headers: {
        Authorization: "Bearer " + this.env.NETLIFY_TOKEN,
        ...(body
          ? { "Content-Type": zip ? "application/zip" : "application/json" }
          : {}),
      },
      body: body ? (zip ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(zip ? 120000 : 20000),
    });
    if (r.status === 404 && allowMissing) return {};
    if (!r.ok)
      throw new HttpError(
        502,
        "Layanan hosting menolak operasi. Periksa akun, DNS, dan status deployment.",
      );
    if (r.status === 204) return {};
    return r.json();
  }
  createSite(name) {
    return this.call("/sites", { method: "POST", body: { name } });
  }
  deploy(siteId, zip) {
    return this.call("/sites/" + encodeURIComponent(siteId) + "/deploys", {
      method: "POST",
      body: zip,
      zip: true,
    });
  }
  remove(siteId) {
    return this.call("/sites/" + encodeURIComponent(siteId), {
      method: "DELETE",
      allowMissing: true,
    });
  }
  status(deployId) {
    return this.call("/deploys/" + encodeURIComponent(deployId));
  }
  domain(siteId, domain) {
    return this.call("/sites/" + encodeURIComponent(siteId), {
      method: "PATCH",
      body: { custom_domain: domain },
    });
  }
  certificate(siteId) {
    return this.call("/sites/" + encodeURIComponent(siteId) + "/ssl");
  }
  rollback(siteId, deployId) {
    return this.call(
      "/sites/" +
        encodeURIComponent(siteId) +
        "/deploys/" +
        encodeURIComponent(deployId) +
        "/restore",
      { method: "POST" },
    );
  }
}
