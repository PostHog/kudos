// The failed-job sweep, today's convex/analytics/sweep.ts on the service's one job history: every 15 minutes it reports
// each job that failed, once, as a PostHog $exception named by the job's operation. It reads failed jobs in the order
// they finished, from where the last sweep stopped, once they have been finished a minute, so a job marked failed in
// a transaction still committing is read by a later sweep. A job is finished when it reaches `failed`, so no job is
// watched while it waits: `watchedJobs` and the cursor that read it are no longer written.
import { and, asc, eq, getTableName, gt, inArray, is, lt, or } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Id } from "../db/columns.ts";
import * as schema from "../db/schema/index.ts";
import { errorSweep, reportedJobs } from "../db/schema/index.ts";
import { jobs } from "../db/schema/service.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { carriesReportedMarker, exceptionOfJobError } from "./exceptions.ts";
import { recordException } from "./outbox.ts";

type FailedJob = { _id: string; name: string; kind: "mutation" | "action"; error: string | null; completedAt: number };

const pageSize = 100;
const pagesPerSweep = 10;
const settledAfterMs = 60 * 1000;
const reportsKeptMs = 7 * 24 * 60 * 60 * 1000;
const analyticsModule = "analytics.";

export const sweepArgs = z.strictObject({});

export async function sweep(ctx: MutationContext, _args: z.infer<typeof sweepArgs>): Promise<void> {
  try {
    await reportNewFailures(ctx);
    await forgetOldReports(ctx);
  } catch (error) {
    console.error("analytics.sweep_failed");
    throw error;
  }
}

export const sweepJob = mutationJob("analytics.sweep.sweep", sweepArgs, sweep);

/** The operation's path as today's reports name it: `welcome.welcome.welcomeNewMembers` is `welcome/welcome:welcomeNewMembers`. */
export function operationPathOf(name: string): string {
  const last = name.lastIndexOf(".");
  return last === -1 ? name : `${name.slice(0, last).replaceAll(".", "/")}:${name.slice(last + 1)}`;
}

async function reportNewFailures(ctx: MutationContext) {
  const state = await stateOf(ctx);
  const settledBefore = ctx.now - settledAfterMs;
  // A sweep starts at its cursor's instant, so a job that finished then and wasn't read is; within a sweep, a page
  // starts after the last job read, so jobs that finished at one instant never hold a page.
  let after: { completedAt: number; _id: string } = { completedAt: state.cursor, _id: "" };
  for (let page = 0; page < pagesPerSweep; page += 1) {
    const failed = await failedJobsAfter(ctx, after, settledBefore);
    for (const job of failed) await reportOnce(ctx, job);
    const last = failed.at(-1);
    if (last !== undefined) after = last;
    if (failed.length < pageSize) break;
  }
  await ctx.tx.update(errorSweep).set({ cursor: after.completedAt }).where(eq(errorSweep._id, state._id));
}

async function stateOf(ctx: MutationContext) {
  const [existing] = await ctx.tx.select({ _id: errorSweep._id, cursor: errorSweep.cursor }).from(errorSweep).limit(1);
  if (existing !== undefined) return existing;
  const row = { ...ctx.newRow(), cursor: 0, watchCursor: 0 };
  await ctx.tx.insert(errorSweep).values(row);
  return row;
}

async function failedJobsAfter(ctx: QueryContext, after: { completedAt: number; _id: string }, settledBefore: number): Promise<FailedJob[]> {
  const rows = await ctx.tx
    .select({ _id: jobs._id, name: jobs.name, kind: jobs.kind, error: jobs.error, completedAt: jobs.completedAt })
    .from(jobs)
    .where(
      and(
        eq(jobs.state, "failed"),
        lt(jobs.completedAt, settledBefore),
        or(gt(jobs.completedAt, after.completedAt), and(eq(jobs.completedAt, after.completedAt), gt(jobs._id, after._id))),
      ),
    )
    .orderBy(asc(jobs.completedAt), asc(jobs._id))
    .limit(pageSize);
  return rows.map((row) => ({ ...row, completedAt: row.completedAt! }));
}

async function reportOnce(ctx: MutationContext, job: FailedJob) {
  const error = job.error ?? undefined;
  if (job.name.startsWith(analyticsModule) || carriesReportedMarker(error) || (await wasReported(ctx, job))) return;
  await ctx.tx.insert(reportedJobs).values({ ...ctx.newRow(), job: job._id as Id<"_scheduled_functions"> });
  await recordException(ctx, { path: operationPathOf(job.name), kind: job.kind }, exceptionOfJobError(error, schemaTables), job.completedAt);
}

async function wasReported(ctx: QueryContext, job: FailedJob) {
  const [report] = await ctx.tx
    .select({ _id: reportedJobs._id })
    .from(reportedJobs)
    .where(eq(reportedJobs.job, job._id as Id<"_scheduled_functions">))
    .limit(1);
  return report !== undefined;
}

async function forgetOldReports(ctx: MutationContext) {
  const old = await ctx.tx
    .select({ _id: reportedJobs._id })
    .from(reportedJobs)
    .where(lt(reportedJobs._creationTime, ctx.now - reportsKeptMs))
    .orderBy(asc(reportedJobs._creationTime), asc(reportedJobs._id))
    .limit(pageSize);
  if (old.length > 0) await ctx.tx.delete(reportedJobs).where(inArray(reportedJobs._id, old.map(({ _id }) => _id)));
}

/** The app's tables, which a `unique()` refusal may name: one it reports as it is, since it names no member's words. */
const schemaTables: ReadonlySet<string> = new Set(Object.values(schema).flatMap((table) => (is(table, PgTable) ? [getTableName(table)] : [])));
