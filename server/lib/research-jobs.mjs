// Research that outlives the tab that started it.
//
// A research turn can run for a minute and cost credits on every round, so a
// closed tab must not throw that work away: the rounds keep running, and the
// finished answer waits here for the same account and project to come back.
// The store is deliberately in-process and bounded — no new table, no new
// privilege — and the client collects a job exactly once. Anything a restart
// loses is lost honestly: the credits of unfinished rounds are refunded by the
// route, and the client is told instead of shown a fake answer.
export const RESEARCH_JOB_TTL_MS = 30 * 60 * 1000;
export const RESEARCH_JOBS_MAX = 20;
export const RESEARCH_JOBS_PER_PROJECT = 4;

/** Public shape: no internal promise, no cross-project data, no raw prompt. */
function view(job) {
  return {
    requestId: job.requestId,
    state: job.state,
    prompt: job.prompt,
    mode: job.mode,
    model: job.model,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || 0,
    creditsUsed: job.creditsUsed || 0,
    error: job.error || "",
    ...(job.state === "ready" ? { result: job.result } : {}),
  };
}

export function createResearchJobs({
  ttlMs = RESEARCH_JOB_TTL_MS,
  max = RESEARCH_JOBS_MAX,
  perProject = RESEARCH_JOBS_PER_PROJECT,
  now = Date.now,
} = {}) {
  const jobs = new Map();
  const sweep = () => {
    const t = now();
    for (const [requestId, job] of jobs)
      if (job.expiresAt <= t) jobs.delete(requestId);
  };
  const ordered = () =>
    [...jobs.values()].sort((a, b) => a.startedAt - b.startedAt);
  // One finished job per project beyond the cap is dropped, oldest first; a run
  // that is still working is only dropped when the global cap demands it.
  const trimProject = (projectId) => {
    if (!perProject) return;
    const mine = ordered().filter((job) => job.projectId === projectId);
    while (mine.length > perProject) {
      const victim = mine.find((job) => job.state !== "running") || mine[0];
      jobs.delete(victim.requestId);
      mine.splice(mine.indexOf(victim), 1);
    }
  };
  const evict = () => {
    // Leave room for the job that is about to be added.
    while (jobs.size > Math.max(1, max) - 1) {
      const all = ordered();
      const victim = all.find((job) => job.state !== "running") || all[0];
      jobs.delete(victim.requestId);
    }
  };
  const start = ({
    requestId,
    userId,
    projectId,
    prompt = "",
    mode = "",
    model = "",
  }) => {
    sweep();
    const existing = jobs.get(requestId);
    if (existing) return existing;
    evict();
    const job = {
      requestId,
      userId,
      projectId,
      prompt: String(prompt).slice(0, 300),
      mode,
      model,
      state: "running",
      result: null,
      error: "",
      creditsUsed: 0,
      startedAt: now(),
      finishedAt: 0,
      expiresAt: now() + ttlMs,
    };
    jobs.set(requestId, job);
    trimProject(projectId);
    return job;
  };
  const finish = (
    requestId,
    { result = null, error = "", creditsUsed = 0 } = {},
  ) => {
    const job = jobs.get(requestId);
    if (!job || job.state !== "running") return null;
    job.finishedAt = now();
    job.expiresAt = job.finishedAt + ttlMs;
    if (result) {
      job.state = "ready";
      job.result = result;
      job.creditsUsed = creditsUsed;
    } else {
      job.state = "failed";
      job.error = error || "Riset gagal diselesaikan.";
    }
    trimProject(job.projectId);
    return view(job);
  };
  const list = ({ userId, projectId }) => {
    sweep();
    return [...jobs.values()]
      .filter((job) => job.userId === userId && job.projectId === projectId)
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(view);
  };
  const claim = ({ requestId, userId, projectId }) => {
    sweep();
    const job = jobs.get(requestId);
    if (!job || job.userId !== userId || job.projectId !== projectId)
      return null;
    jobs.delete(requestId);
    return view(job);
  };
  const stats = () => {
    sweep();
    const all = [...jobs.values()];
    return {
      jobs: all.length,
      running: all.filter((job) => job.state === "running").length,
      ready: all.filter((job) => job.state === "ready").length,
      ttlMinutes: Math.round(ttlMs / 60000),
      max,
    };
  };
  return {
    start,
    finish,
    list,
    claim,
    stats,
    reset: () => jobs.clear(),
    size: () => jobs.size,
  };
}
