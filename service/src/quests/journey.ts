// The module map's skeleton of convex/quests/journey.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { memberLeftEventValidator, memberRejoinedEventValidator } from "../bus/events.ts";
import { type MemberId } from "../workspace/directory.ts";
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
export async function recheckRejoined(ctx: MutationContext, args: z.infer<typeof recheckRejoinedArgs>): Promise<void> {
  throw notPorted("quests.journey.recheckRejoined");
}
export const recheckRejoinedJob = mutationJob("quests.journey.recheckRejoined", recheckRejoinedArgs, recheckRejoined);

export const recheckSomeoneNewOfArgs = z.strictObject({ workspace: z.string(), member: zv.id("members"), at: zv.number() });
export async function recheckSomeoneNewOf(ctx: MutationContext, args: z.infer<typeof recheckSomeoneNewOfArgs>): Promise<void> {
  throw notPorted("quests.journey.recheckSomeoneNewOf");
}
export const recheckSomeoneNewOfJob = mutationJob("quests.journey.recheckSomeoneNewOf", recheckSomeoneNewOfArgs, recheckSomeoneNewOf);

export async function hasThankedEveryone(ctx: QueryContext, workspace: string, member: MemberId, at: number): Promise<boolean> {
  throw notPorted("quests.journey.hasThankedEveryone");
}
