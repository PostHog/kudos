// When a teammate leaves or comes back, Thank someone new may now be finished or open again for those still on it.
// Today's convex/quests/journey.ts over the service's operations. The recheck pages through the workspace's members with
// the shared keyset paginate, which S11 lands; until then that one job stays a stub.
import { memberLeftEventValidator, memberRejoinedEventValidator } from "../bus/events.ts";
import { thankedAtOrBefore } from "../engine/awards.ts";
import { teammatesOf, type MemberId } from "../workspace/directory.ts";
import { onTheMondayPath } from "./flag.ts";
import { finishSomeoneNewOnceEveryoneIsThanked, someoneNewWaitsOnTheMondayPath } from "./onboarding.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const rewardValidator = z.strictObject({ xp: zv.number(), coins: zv.number(), item: z.null() });

export type Reward = z.infer<typeof rewardValidator>;

export const recheckSomeoneNewArgs = z.strictObject({ event: memberLeftEventValidator, cursor: z.optional(z.string()) });
export async function recheckSomeoneNew(ctx: MutationContext, args: z.infer<typeof recheckSomeoneNewArgs>): Promise<void> {
  throw notPorted("quests.journey.recheckSomeoneNew");
}
export const recheckSomeoneNewJob = mutationJob("quests.journey.recheckSomeoneNew", recheckSomeoneNewArgs, recheckSomeoneNew);

export const recheckRejoinedArgs = z.strictObject({ event: memberRejoinedEventValidator });
export async function recheckRejoined(ctx: MutationContext, { event: { workspace, member, at } }: z.infer<typeof recheckRejoinedArgs>): Promise<void> {
  if (await someoneNewWaitsOnTheMondayPath(ctx, member)) await recheckLater(ctx, workspace, member, at);
}
export const recheckRejoinedJob = mutationJob("quests.journey.recheckRejoined", recheckRejoinedArgs, recheckRejoined);

export const recheckSomeoneNewOfArgs = z.strictObject({ workspace: z.string(), member: zv.id("members"), at: zv.number() });
export async function recheckSomeoneNewOf(ctx: MutationContext, { workspace, member, at }: z.infer<typeof recheckSomeoneNewOfArgs>): Promise<void> {
  if (await onTheMondayPath(ctx, member)) await finishSomeoneNewOnceEveryoneIsThanked(ctx, workspace, member, at);
}
export const recheckSomeoneNewOfJob = mutationJob("quests.journey.recheckSomeoneNewOf", recheckSomeoneNewOfArgs, recheckSomeoneNewOf);

async function recheckLater(ctx: MutationContext, workspace: string, member: MemberId, at: number): Promise<void> {
  await ctx.jobs.enqueue(recheckSomeoneNewOfJob, { workspace, member, at });
}

export async function hasThankedEveryone(ctx: QueryContext, workspace: string, member: MemberId, at: number): Promise<boolean> {
  for (const teammate of await teammatesOf(ctx, workspace, member)) if (!(await thankedAtOrBefore(ctx, member, teammate, at))) return false;
  return true;
}
