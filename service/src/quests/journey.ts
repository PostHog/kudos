// When a teammate leaves or comes back, Thank someone new may now be finished or open again for those still on it.
// Today's convex/quests/journey.ts over the service's operations. The recheck pages through the workspace's members in
// the by_user index's order with the shared keyset paginate, a hundred at a time, each page scheduling the next.
import { memberLeftEventValidator, memberRejoinedEventValidator } from "../bus/events.ts";
import { thankedAtOrBefore } from "../engine/awards.ts";
import { teammatesOf, type MemberId } from "../workspace/directory.ts";
import { onTheMondayPath } from "./flag.ts";
import { finishSomeoneNewOnceEveryoneIsThanked, someoneNewWaitsOnTheMondayPath } from "./onboarding.ts";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { indexOrder } from "../db/indexOrder.ts";
import { paginate } from "../db/page.ts";
import { members, type Doc } from "../db/schema/index.ts";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export const rewardValidator = z.strictObject({ xp: zv.number(), coins: zv.number(), item: z.null() });

export type Reward = z.infer<typeof rewardValidator>;

const membersPerRecheck = 100;

const byUser = indexOrder(members, ["workspace", "user"]);

export const recheckSomeoneNewArgs = z.strictObject({ event: memberLeftEventValidator, cursor: z.optional(z.string()) });
export async function recheckSomeoneNew(ctx: MutationContext, args: z.infer<typeof recheckSomeoneNewArgs>): Promise<void> {
  const { event, cursor } = args;
  const people = await paginate<Doc<"members">>(ctx.tx, { table: members, order: byUser, where: eq(members.workspace, event.workspace) }, { numItems: membersPerRecheck, cursor: cursor ?? null });
  for (const { _id: member, kind } of people.page) {
    if (kind === "member" && (await someoneNewWaitsOnTheMondayPath(ctx, member))) await recheckLater(ctx, event.workspace, member, event.at);
  }
  if (!people.isDone) await ctx.jobs.enqueue(recheckSomeoneNewJob, { event, cursor: people.continueCursor });
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
