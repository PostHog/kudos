// The failed-job sweep, today's convex/analytics/sweep.ts on the service's one job history: every 15 minutes it reports
// each job that failed, once, as a PostHog $exception named by the job's operation. It reads the failed jobs it has not
// taken in yet (`sweptAt` is NULL), in the order they finished, and takes in every one it reads, reported or not. So a
// failure is read however late its transaction commits, and never twice. The jobs the move recovers from Convex arrive
// swept (../load/recovery.ts): Convex's sweep reported their failures.
import { and, asc, eq, getTableName, inArray, is, isNull } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import * as schema from "../db/schema/index.ts";
import { jobs } from "../db/schema/service.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { carriesReportedMarker, exceptionOfJobError } from "./exceptions.ts";
import { recordException } from "./outbox.ts";

type FailedJob = { _id: string; name: string; kind: "mutation" | "action"; error: string | null; completedAt: number };

const pageSize = 100;
const pagesPerSweep = 10;
const analyticsModule = "analytics.";

export const sweepArgs = z.strictObject({});

export async function sweep(ctx: MutationContext, _args: z.infer<typeof sweepArgs>): Promise<void> {
  try {
    await reportNewFailures(ctx);
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
  for (let page = 0; page < pagesPerSweep; page += 1) {
    const failed = await unsweptFailures(ctx);
    for (const job of failed) await report(ctx, job);
    if (failed.length > 0) await ctx.tx.update(jobs).set({ sweptAt: ctx.now }).where(inArray(jobs._id, failed.map(({ _id }) => _id)));
    if (failed.length < pageSize) return;
  }
}

/** Read through `jobs_failed_and_unswept`, which holds only the failed jobs no sweep has taken in yet. */
async function unsweptFailures(ctx: QueryContext): Promise<FailedJob[]> {
  const rows = await ctx.tx
    .select({ _id: jobs._id, name: jobs.name, kind: jobs.kind, error: jobs.error, completedAt: jobs.completedAt })
    .from(jobs)
    .where(and(eq(jobs.state, "failed"), isNull(jobs.sweptAt)))
    .orderBy(asc(jobs.completedAt), asc(jobs._id))
    .limit(pageSize);
  return rows.map((row) => ({ ...row, completedAt: row.completedAt ?? ctx.now }));
}

async function report(ctx: MutationContext, job: FailedJob) {
  const error = job.error ?? undefined;
  if (job.name.startsWith(analyticsModule) || carriesReportedMarker(error)) return;
  await recordException(ctx, { path: operationPathOf(job.name), kind: job.kind }, exceptionOfJobError(error, schemaTables), job.completedAt);
}

/** The app's tables, which a `unique()` refusal may name: one it reports as it is, since it names no member's words. */
const schemaTables: ReadonlySet<string> = new Set(Object.values(schema).flatMap((table) => (is(table, PgTable) ? [getTableName(table)] : [])));
