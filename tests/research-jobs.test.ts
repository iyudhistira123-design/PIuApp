import test from "node:test";
import assert from "node:assert/strict";
import {
  createResearchJobs,
  RESEARCH_JOBS_MAX,
} from "../server/lib/research-jobs.mjs";

// The store is what makes a closed tab harmless: a finished answer waits for the
// same account and project, is handed over exactly once, and never grows without
// a bound. Time is injected, so expiry is proven instead of waited for.
const owner = { userId: "user-1", projectId: "project-1" };

test("a finished job waits for its own account and project and is handed over once", () => {
  const jobs = createResearchJobs();
  jobs.start({
    requestId: "r1",
    ...owner,
    prompt: "Cari dokumentasi",
    mode: "Ask",
  });
  // Still running: nothing to collect yet, and nobody else can see it.
  assert.equal(jobs.list(owner)[0].state, "running");
  assert.deepEqual(jobs.list({ userId: "user-2", projectId: "project-1" }), []);
  assert.deepEqual(jobs.list({ userId: "user-1", projectId: "project-2" }), []);

  jobs.finish("r1", { result: { content: "Jawaban [1]" }, creditsUsed: 2 });
  const [listed] = jobs.list(owner);
  assert.equal(listed.state, "ready");
  assert.equal(listed.creditsUsed, 2);
  assert.equal(listed.result.content, "Jawaban [1]");
  assert.match(listed.prompt, /Cari dokumentasi/);

  // Claiming hands it over exactly once, and only to its owner.
  assert.equal(
    jobs.claim({ requestId: "r1", userId: "user-2", projectId: "project-1" }),
    null,
  );
  assert.equal(jobs.claim({ requestId: "r1", ...owner }).requestId, "r1");
  assert.equal(jobs.claim({ requestId: "r1", ...owner }), null);
  assert.deepEqual(jobs.list(owner), []);
});

test("a job that failed keeps the real reason instead of a fake answer", () => {
  const jobs = createResearchJobs();
  jobs.start({ requestId: "r2", ...owner });
  jobs.finish("r2", { error: "Mode riset aktif, tetapi belum ada provider." });
  const [job] = jobs.list(owner);
  assert.equal(job.state, "failed");
  assert.equal(job.error, "Mode riset aktif, tetapi belum ada provider.");
  assert.equal(job.result, undefined);
});

test("an expired job is dropped instead of delivered late", () => {
  let clock = 1_000;
  const jobs = createResearchJobs({ ttlMs: 60_000, now: () => clock });
  jobs.start({ requestId: "r3", ...owner });
  jobs.finish("r3", { result: { content: "Lama" } });
  clock += 59_000;
  assert.equal(jobs.list(owner).length, 1);
  clock += 2_000;
  assert.deepEqual(jobs.list(owner), []);
  assert.equal(jobs.claim({ requestId: "r3", ...owner }), null);
  assert.equal(jobs.size(), 0);
});

test("the store stays bounded: the oldest finished job per project is evicted first", () => {
  let clock = 5_000;
  const jobs = createResearchJobs({
    max: 3,
    perProject: 2,
    now: () => (clock += 10),
  });
  for (const requestId of ["a", "b", "c"])
    jobs.start({ requestId, ...owner, prompt: requestId });
  jobs.finish("a", { result: { content: "a" } });
  jobs.finish("b", { result: { content: "b" } });
  assert.ok(jobs.size() <= 3);
  // A third finished job in the same project drops the oldest finished one, not
  // the run that is still working.
  jobs.finish("c", { result: { content: "c" } });
  const ids = jobs
    .list(owner)
    .map((job) => job.requestId)
    .sort();
  assert.deepEqual(ids, ["b", "c"]);
  assert.ok(jobs.size() <= 3);
});

test("the cap holds across many projects and a dropped run is simply not collectable", () => {
  const jobs = createResearchJobs({ max: 4, perProject: 2 });
  for (let i = 0; i < 12; i++) {
    jobs.start({ requestId: "job-" + i, userId: "u", projectId: "p-" + i });
  }
  assert.ok(jobs.size() <= 4, `expected at most 4 jobs, got ${jobs.size()}`);
  assert.equal(RESEARCH_JOBS_MAX > 0, true);
  const stats = jobs.stats();
  assert.equal(stats.jobs, jobs.size());
  assert.equal(stats.running, jobs.size());
  assert.equal(stats.ttlMinutes > 0, true);
});

test("the same request id is never registered twice", () => {
  const jobs = createResearchJobs();
  const first = jobs.start({ requestId: "r4", ...owner, prompt: "Awal" });
  const again = jobs.start({ requestId: "r4", ...owner, prompt: "Ulang" });
  assert.equal(first, again);
  assert.equal(jobs.size(), 1);
  assert.match(jobs.list(owner)[0].prompt, /Awal/);
});
