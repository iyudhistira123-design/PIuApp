import { defaultSite, schemaMissing } from "./platform.mjs";

// Display-only fallback for the public landing. NEVER use this reader for auth,
// maintenance enforcement, payments or admin writes; those remain fail-closed.
export function createPublicSiteReader(
  ctx,
  { now = Date.now, timeoutMs = 3000, retryMs = 30000 } = {},
) {
  let lastSettings = null,
    issue = null,
    retryAt = 0,
    inflight = null;
  const fallback = () => ({
    configured: lastSettings !== null,
    availability: issue ? "unavailable" : "not_configured",
    issue,
    source: lastSettings ? "cached" : "defaults",
    settings: lastSettings || defaultSite,
    broadcasts: [],
  });
  const fail = (code) => {
    issue = code;
    retryAt = now() + retryMs;
    return fallback();
  };
  async function load() {
    let config;
    try {
      const result = await ctx.admin
        .from("site_configuration")
        .select("revision,value")
        .eq("id", true)
        .maybeSingle()
        .abortSignal(AbortSignal.timeout(timeoutMs));
      if (result.error)
        return fail(
          schemaMissing(result.error)
            ? "setup_required"
            : "database_unavailable",
        );
      config = result.data;
      if (
        !config?.revision ||
        !config.value ||
        typeof config.value !== "object" ||
        Array.isArray(config.value)
      )
        return fail("setup_required");
      lastSettings = config.value;
    } catch {
      return fail("database_unavailable");
    }
    try {
      // Public callers can never select a member audience or impersonate a user.
      const result = await ctx.admin
        .rpc("piwu_broadcast_feed", { p_user: null })
        .abortSignal(AbortSignal.timeout(timeoutMs));
      if (result.error || !Array.isArray(result.data))
        return fail(
          schemaMissing(result.error)
            ? "setup_required"
            : "announcements_unavailable",
        );
      issue = null;
      retryAt = 0;
      return {
        configured: true,
        availability: "ready",
        issue: null,
        source: "live",
        settings: lastSettings,
        broadcasts: result.data,
      };
    } catch {
      return fail("announcements_unavailable");
    }
  }
  return async () => {
    if (!ctx.admin) return fallback();
    if (now() < retryAt) return fallback();
    if (!inflight)
      inflight = load().finally(() => {
        inflight = null;
      });
    return inflight;
  };
}
