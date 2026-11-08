import type { DocumentByName, SystemDataModel } from "convex/server";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { functionPathOf } from "./boundary";
import schema from "../schema";
import { carriesReportedMarker, exceptionOfJobError } from "./exceptions";
import { recordException } from "./outbox";

type Job = DocumentByName<SystemDataModel, "_scheduled_functions">;

const pageSize = 100;
const pagesPerSweep = 10;
const watchedPerSweep = 1000;
const settledAfterMs = 60 * 1000;
const reportsKeptMs = 7 * 24 * 60 * 60 * 1000;
const analyticsModule = "analytics/";

export const sweep = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    try {
      await recheckWatchedJobs(ctx);
      await discoverNewJobs(ctx);
      await forgetOldReports(ctx);
    } catch (error) {
      console.error("analytics.sweep_failed");
      throw error;
    }
  },
});

async function recheckWatchedJobs(ctx: MutationCtx) {
  const sweepState = await stateOf(ctx);
  const watchedList = await ctx.db
    .query("watchedJobs")
    .withIndex("by_creation_time", (q) => q.gt("_creationTime", sweepState.watchCursor))
    .take(watchedPerSweep);
  for (const watched of watchedList) {
    const job = await ctx.db.system.get(watched.job);
    if (job !== null && !isFinished(job)) continue;
    if (job !== null) await reportIfFailed(ctx, job);
    await ctx.db.delete(watched._id);
  }
  const watchCursor = watchedList.length < watchedPerSweep ? 0 : watchedList.at(-1)!._creationTime;
  await ctx.db.patch(sweepState._id, { watchCursor });
}

async function stateOf(ctx: MutationCtx) {
  const existing = await ctx.db.query("errorSweep").first();
  if (existing !== null) return existing;
  const id = await ctx.db.insert("errorSweep", { cursor: 0, watchCursor: 0 });
  return (await ctx.db.get(id))!;
}

async function discoverNewJobs(ctx: MutationCtx) {
  const sweepState = await stateOf(ctx);
  let cursor = sweepState.cursor;
  const settledBefore = Date.now() - settledAfterMs;
  for (let page = 0; page < pagesPerSweep; page += 1) {
    const jobs = await ctx.db.system
      .query("_scheduled_functions")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", cursor).lt("_creationTime", settledBefore))
      .take(pageSize);
    for (const job of jobs) {
      if (isFinished(job)) await reportIfFailed(ctx, job);
      else await watch(ctx, job);
    }
    cursor = jobs.at(-1)?._creationTime ?? cursor;
    if (jobs.length < pageSize) break;
  }
  await ctx.db.patch(sweepState._id, { cursor });
}

async function watch(ctx: MutationCtx, job: Job) {
  const watched = await ctx.db
    .query("watchedJobs")
    .withIndex("by_job", (q) => q.eq("job", job._id))
    .first();
  if (watched === null) await ctx.db.insert("watchedJobs", { job: job._id });
}

const schemaTables: ReadonlySet<string> = new Set(Object.keys(schema.tables));

async function reportIfFailed(ctx: MutationCtx, job: Job) {
  if (job.state.kind !== "failed") return;
  const error: string | undefined = job.state.error;
  if (job.name.startsWith(analyticsModule) || carriesReportedMarker(error) || (await wasReported(ctx, job))) return;
  await ctx.db.insert("reportedJobs", { job: job._id });
  await recordException(ctx, { path: functionPathOf(job.name), kind: "mutation" }, exceptionOfJobError(error, schemaTables), job.completedTime ?? Date.now());
}

async function wasReported(ctx: MutationCtx, job: Job) {
  const report = await ctx.db
    .query("reportedJobs")
    .withIndex("by_job", (q) => q.eq("job", job._id))
    .first();
  return report !== null;
}

async function forgetOldReports(ctx: MutationCtx) {
  const old = await ctx.db
    .query("reportedJobs")
    .withIndex("by_creation_time", (q) => q.lt("_creationTime", Date.now() - reportsKeptMs))
    .take(pageSize);
  for (const report of old) await ctx.db.delete(report._id);
}

function isFinished(job: Job) {
  return job.state.kind === "success" || job.state.kind === "failed" || job.state.kind === "canceled";
}
