// The replay of a failed subscriber's job, as today's convex/bus/replay.ts (ADR 0014): nothing retries a subscriber that
// threw, since a bug that throws would throw again, so the failed-job sweep reports it and an operator replays the job
// by hand (`replayJob.ts`). The job runs again with its stored args, and once however often it is replayed: the
// `replays` table keeps each replayed job, in the transaction that schedules it.
import { eq } from "drizzle-orm";
import { decodeStored } from "../db/codec.ts";
import type { Id } from "../db/columns.ts";
import { replays } from "../db/schema/bus.ts";
import { jobs } from "../db/schema/service.ts";
import type { MutationContext } from "../operations.ts";
import type { Registry } from "../registration.ts";

export type Replayed = "replayed" | "not failed" | "not a subscriber" | "already replayed";

/** The jobs a subscriber schedules to finish its delivery, which a replay may run again as it may a subscriber. */
const finishesTheDeliveryOfASubscriber = new Set([
  "album.tallies.tallyHug",
  "album.milestones.recordMilestonesOfStickerHolders",
  "engine.kudosText.forgetAuthoredWords",
  "quests.journey.recheckSomeoneNewOf",
]);

/**
 * Schedules a failed subscriber's job again with its stored args, once. A job whose args its schema now refuses is
 * refused here, in this transaction, and nothing is recorded; Convex scheduled it, and it failed again when it ran.
 */
export async function replay(ctx: MutationContext, registry: Registry, { job }: { job: string }): Promise<Replayed> {
  const [failed] = await ctx.tx.select({ name: jobs.name, args: jobs.args, state: jobs.state }).from(jobs).where(eq(jobs._id, job)).limit(1);
  if (failed?.state !== "failed") return "not failed";
  const replayable = isReplayable(registry, failed.name) ? registry.jobs.get(failed.name) : undefined;
  if (replayable === undefined) return "not a subscriber";
  if (await wasReplayed(ctx, job)) return "already replayed";
  await ctx.tx.insert(replays).values({ ...ctx.newRow(), job: job as Id<"_scheduled_functions"> });
  await ctx.jobs.enqueue(replayable, decodeStored(failed.args));
  return "replayed";
}

function isReplayable(registry: Registry, name: string) {
  return finishesTheDeliveryOfASubscriber.has(name) || [...registry.subscribers.values()].some((subscriptions) => subscriptions.some(({ job }) => job.name === name));
}

async function wasReplayed(ctx: MutationContext, job: string) {
  const [replayed] = await ctx.tx.select({ _id: replays._id }).from(replays).where(eq(replays.job, job as Id<"_scheduled_functions">)).limit(1);
  return replayed !== undefined;
}
