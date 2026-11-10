// The analytics drain, today's convex/analytics/drain.ts on the jobs table: it sends the outbox's due rows to
// PostHog's batch endpoint, 100 to a request. Sending is send.ts's, the one module here that reaches the network; the
// outbox, which the flag module imports, wakes the drain through this one and so never reaches it.
// - A request only inserts its rows and a drain job (`wakeDrain`), which wakes the worker once it commits. It never
//   reads the drain's state: today's read a singleton and its job in the request's transaction, so a drain claiming
//   rows ran concurrent requests out of retries.
// - Any number of drains may run. Each claims due rows `FOR UPDATE SKIP LOCKED` under a lease of its own, so two never
//   send one row; one that finds none due ends, scheduling one drain for the next retry unless one is due by then.
// - A lease runs 2 minutes. The recovery job at its expiry, and the 10-minute cron, release a dead drain's rows, and a
//   drain whose lease expired changes nothing when it settles.
// - A failed batch is retried after 1, 5, 30, 120 and 360 minutes, then given up; PostHog's 400 and 413 give it up at
//   once. Every attempt sends each row's own UUID, so PostHog keeps one copy of a batch it received twice.
// - Capture switched off pauses the outbox: nothing is sent, no failure counted, and the 7-day clean-up still runs.
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import type { Id } from "../db/columns.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { analyticsOutbox, type Doc } from "../db/schema/index.ts";
import { jobs } from "../db/schema/service.ts";
import { actionJob, mutationJob } from "../jobs/define.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { zv } from "../values.ts";
import { captureSettings, type Capture } from "./capture.ts";
import { failuresLogged } from "./failures.ts";
import { followPeopleSentLate, forgetRecordedProfiles, markDeliveriesUncertain, personEventsIn, withoutStalePersonEvents } from "./person.ts";

const batchSize = 100;
const leaseMs = 2 * 60_000;
const retryDelaysMs = [1, 5, 30, 120, 360].map((minutes) => minutes * 60_000);
const givenUpKeptForMs = 7 * 24 * 60 * 60_000;
const pendingKeptForMs = 7 * 24 * 60 * 60_000;
const cleanUpBatchSize = 500;

export type OutboxRow = Doc<"analyticsOutbox">;
type GiveUpReason = NonNullable<OutboxRow["reason"]>;
type Claim = { token: string; rows: OutboxRow[] };

const answerValidator = z.union([z.literal("delivered"), z.literal("rejected"), z.literal("failed")]);
const sentPersonEventValidator = z.strictObject({ row: zv.id("analyticsOutbox"), distinctId: z.string() });
export type Answer = z.infer<typeof answerValidator>;

/** Sends one batch and answers how PostHog took it; send.ts's `sendBatch` in the app. */
export type Send = (capture: Capture, batch: OutboxRow[]) => Promise<Answer>;

/**
 * A drain job's args. Today's named the generation of the one drain its singleton allowed; a job loaded from Convex
 * still carries one, which the rewrite reads nowhere, since any number of drains may run.
 */
export const drainArgs = z.strictObject({ generation: z.optional(z.string()) });

/** The drain's job: claims, sends and settles batches until none is due. The registry's sends by send.ts's `sendBatch`. */
export function createDrain(send: Send) {
  return actionJob("analytics.drain.drain", drainArgs, (ctx) => drain(ctx, send));
}

async function drain(ctx: ActionContext, send: Send): Promise<void> {
  await failuresLogged("analytics.drain_failed", async () => {
    for (;;) {
      const capture = captureSettings();
      const claimed = await ctx.run.mutation("analytics.drain.claim", claim);
      if (claimed === null || capture === null) return;
      const answer = await send(capture, claimed.rows);
      const people = personEventsIn(claimed.rows);
      await ctx.run.mutation("analytics.drain.settle", (mutation) => settle(mutation, { token: claimed.token, rows: claimed.rows.map((row) => row._id), people, answer }));
    }
  });
}

/**
 * The drain's job as requests and the drain's own jobs schedule it: its name, kind and args. The worker runs the job
 * registered under its name, send.ts's `drainJob`, so this one's sender never runs.
 */
const scheduledDrain = createDrain(() => Promise.reject(new Error("The drain sends from the registry's job, send.ts's drainJob")));

/**
 * Leases the due rows to this drain, oldest due first, skipping rows another drain's claim holds. With none due, or
 * capture off, it claims nothing and schedules the drain for the next retry.
 */
export async function claim(ctx: MutationContext): Promise<null | Claim> {
  const due = captureSettings() === null ? [] : await withoutStalePersonEvents(ctx, await dueRows(ctx));
  if (due.length === 0) {
    await scheduleDrain(ctx);
    return null;
  }
  const token = randomUUID();
  const leasedUntil = ctx.now + leaseMs;
  await ctx.tx
    .update(analyticsOutbox)
    .set({ state: "sending", lease: token, dueAt: leasedUntil })
    .where(inArray(analyticsOutbox._id, due.map((row) => row._id)));
  await ctx.jobs.enqueue(recoverJob, {}, { at: leasedUntil });
  return { token, rows: due.map((row) => ({ ...row, state: "sending", lease: token, dueAt: leasedUntil })) };
}

export const settleArgs = z.strictObject({ token: z.string(), rows: z.array(zv.id("analyticsOutbox")), people: z.array(sentPersonEventValidator), answer: answerValidator });

/** Ends a batch by PostHog's answer; rows whose lease is no longer this drain's are left as they are. */
export async function settle(ctx: MutationContext, { token, rows, people, answer }: z.infer<typeof settleArgs>): Promise<void> {
  const leased = (await outboxRows(ctx, rows)).filter((row) => row.lease === token && row.dueAt > ctx.now);
  await followPeopleSentLate(ctx, people, leased);
  if (answer === "failed") await markDeliveriesUncertain(ctx, people);
  const held = answer === "delivered" ? leased : await withoutStalePersonEvents(ctx, leased);
  if (answer === "delivered") {
    if (held.length > 0) await ctx.tx.delete(analyticsOutbox).where(inArray(analyticsOutbox._id, held.map((row) => row._id)));
  } else if (captureSettings() === null) {
    await release(ctx, held);
  } else if (answer === "rejected") {
    await giveUp(ctx, held, "rejected");
  } else {
    await retryOrGiveUp(ctx, held);
  }
}

export const recoverArgs = z.strictObject({});

/** Releases the rows of leases that expired, and starts a drain when rows are due; at each lease's expiry and every 10 minutes. */
export async function recover(ctx: MutationContext, _args: z.infer<typeof recoverArgs>): Promise<void> {
  await failuresLogged("analytics.recovery_failed", async () => {
    const expiredLeases = await rowsByDue(ctx, "sending", ctx.now, cleanUpBatchSize);
    await markDeliveriesUncertain(ctx, personEventsIn(expiredLeases));
    await release(ctx, expiredLeases);
    await scheduleDrain(ctx);
  });
}
export const recoverJob = mutationJob("analytics.drain.recover", recoverArgs, recover);

export const cleanUpArgs = z.strictObject({});

/** Gives up rows pending for 7 days and deletes rows given up 7 days ago, 500 of each to a run; daily. */
export async function cleanUp(ctx: MutationContext, _args: z.infer<typeof cleanUpArgs>): Promise<void> {
  await failuresLogged("analytics.cleanup_failed", async () => {
    const expired = await ctx.tx
      .select()
      .from(analyticsOutbox)
      .where(and(eq(analyticsOutbox.state, "pending"), lte(analyticsOutbox._creationTime, ctx.now - pendingKeptForMs)))
      .orderBy(asc(analyticsOutbox.state), asc(analyticsOutbox._creationTime), asc(analyticsOutbox._id))
      .limit(cleanUpBatchSize);
    await giveUp(ctx, await withoutStalePersonEvents(ctx, expired.map(asRow)), "expired");
    const forgotten = await rowsByDue(ctx, "exhausted", ctx.now, cleanUpBatchSize);
    if (forgotten.length > 0) await ctx.tx.delete(analyticsOutbox).where(inArray(analyticsOutbox._id, forgotten.map((row) => row._id)));
    if (expired.length === cleanUpBatchSize || forgotten.length === cleanUpBatchSize) await ctx.jobs.enqueue(cleanUpJob, {});
  });
}
export const cleanUpJob = mutationJob("analytics.drain.cleanUp", cleanUpArgs, cleanUp);

/**
 * Wakes a drain once the caller commits: a job row and the jobs channel's notification, both insert-only. It reads
 * nothing, so a request recording analytics never conflicts with a drain claiming the outbox.
 */
export async function wakeDrain(ctx: MutationContext): Promise<void> {
  await ctx.jobs.enqueue(scheduledDrain, {});
}

/**
 * Schedules a drain at the next pending row's due time, unless capture is off, no row is pending, or a drain is
 * already pending by then. Only the drain's own jobs call it, never a request.
 */
async function scheduleDrain(ctx: MutationContext): Promise<void> {
  if (captureSettings() === null) return;
  const [next] = await rowsByDue(ctx, "pending", Infinity, 1);
  if (next === undefined) return;
  const at = Math.max(next.dueAt, ctx.now);
  const [scheduled] = await ctx.tx
    .select({ _id: jobs._id })
    .from(jobs)
    .where(and(eq(jobs.state, "pending"), lte(jobs.runAt, at), eq(jobs.name, scheduledDrain.name)))
    .limit(1);
  if (scheduled === undefined) await ctx.jobs.enqueue(scheduledDrain, {}, { at });
}

/** The due pending rows, locked, skipping those another drain's claim holds, in `by_due` order. */
async function dueRows(ctx: MutationContext): Promise<OutboxRow[]> {
  const rows = await ctx.tx
    .select()
    .from(analyticsOutbox)
    .where(and(eq(analyticsOutbox.state, "pending"), lte(analyticsOutbox.dueAt, ctx.now)))
    .orderBy(asc(analyticsOutbox.state), asc(analyticsOutbox.dueAt), asc(analyticsOutbox._creationTime), asc(analyticsOutbox._id))
    .limit(batchSize)
    .for("update", { skipLocked: true });
  return rows.map(asRow);
}

async function rowsByDue(ctx: MutationContext, state: OutboxRow["state"], dueBy: number, limit: number): Promise<OutboxRow[]> {
  const rows = await ctx.tx
    .select()
    .from(analyticsOutbox)
    .where(and(eq(analyticsOutbox.state, state), ...(Number.isFinite(dueBy) ? [lte(analyticsOutbox.dueAt, dueBy)] : [])))
    .orderBy(asc(analyticsOutbox.state), asc(analyticsOutbox.dueAt), asc(analyticsOutbox._creationTime), asc(analyticsOutbox._id))
    .limit(limit);
  return rows.map(asRow);
}

async function outboxRows(ctx: MutationContext, ids: Array<Id<"analyticsOutbox">>): Promise<OutboxRow[]> {
  if (ids.length === 0) return [];
  const rows = await ctx.tx.select().from(analyticsOutbox).where(inArray(analyticsOutbox._id, ids));
  return rows.map(asRow);
}

function asRow(row: Record<string, unknown>): OutboxRow {
  return toDocument<OutboxRow>(analyticsOutbox, row);
}

async function patch(ctx: MutationContext, row: OutboxRow, fields: Partial<OutboxRow>): Promise<void> {
  const document: Record<string, unknown> = { ...row, ...fields };
  for (const field of Object.keys(document)) if (document[field] === undefined) delete document[field];
  await ctx.tx
    .update(analyticsOutbox)
    .set(fromDocument(analyticsOutbox, document) as typeof analyticsOutbox.$inferInsert)
    .where(eq(analyticsOutbox._id, row._id));
}

async function retryOrGiveUp(ctx: MutationContext, rows: OutboxRow[]): Promise<void> {
  const exhausted = rows.filter((row) => row.failures === retryDelaysMs.length);
  for (const row of rows.filter((row) => row.failures < retryDelaysMs.length)) {
    await patch(ctx, row, { state: "pending", lease: undefined, failures: row.failures + 1, dueAt: ctx.now + retryDelaysMs[row.failures]! });
  }
  await giveUp(ctx, exhausted, "exhausted");
}

async function release(ctx: MutationContext, rows: OutboxRow[]): Promise<void> {
  for (const row of rows) await patch(ctx, row, { state: "pending", lease: undefined, dueAt: ctx.now });
}

async function giveUp(ctx: MutationContext, rows: OutboxRow[], reason: GiveUpReason): Promise<void> {
  if (rows.length === 0) return;
  for (const row of rows) await patch(ctx, row, { state: "exhausted", reason, lease: undefined, dueAt: ctx.now + givenUpKeptForMs });
  await forgetRecordedProfiles(ctx, rows);
  console.warn("analytics.events_given_up", { reason, events: rows.map((row) => row.event) });
}
