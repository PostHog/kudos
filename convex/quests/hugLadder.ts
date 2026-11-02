import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { MemberId } from "../workspace/directory";
import { rewardKeyOf } from "./crates";
import { finishMondayQuest } from "./finish";
import { questFinishOf } from "./finishes";
import type { Reward } from "./journey";
import { mondayCatalogueVersion } from "./mondayCatalogue";
import type { JourneyStep } from "./step";

export const hugLadderSteps = ["hugs-3", "hugs-5", "hugs-10"] as const satisfies readonly JourneyStep[];

export type HugLadderStep = (typeof hugLadderSteps)[number];

export const hugLadderReward: Reward = { xp: 20, coins: 0, item: null };

const hugsToFinish: Record<HugLadderStep, number> = { "hugs-3": 3, "hugs-5": 5, "hugs-10": 10 };

const mostHugsCounted = hugsToFinish["hugs-10"];

export function hugLadderTargetOf(step: HugLadderStep): number {
  return hugsToFinish[step];
}

export async function startTheHugLadder(ctx: MutationCtx, member: MemberId, at: number): Promise<void> {
  if ((await hugLadderStartOf(ctx, member)) !== null) return;
  const newest = await newestHugOf(ctx, member);
  if (newest !== null && newest.at >= at) return;
  await ctx.db.insert("hugLadders", { member, at });
}

export async function advanceHugLadder(ctx: MutationCtx, workspace: string, member: MemberId): Promise<void> {
  const start = await hugLadderStartOf(ctx, member);
  if (start === null) return;
  const hugs = await hugsSince(ctx, member, start);
  for (const step of hugLadderSteps) {
    const reaching = hugs[hugLadderTargetOf(step) - 1];
    if (reaching === undefined) return;
    await finishMondayQuest(ctx, workspace, member, { kind: "journey", step }, { reward: hugLadderReward, catalogueVersion: mondayCatalogueVersion }, reaching.at);
  }
}

export async function hugsOnTheLadderOf(ctx: QueryCtx, member: MemberId): Promise<number> {
  const start = await hugLadderStartOf(ctx, member);
  return start === null ? 0 : (await hugsSince(ctx, member, start)).length;
}

export async function nextHugLadderStepOf(ctx: QueryCtx, member: MemberId): Promise<HugLadderStep | null> {
  for (const step of hugLadderSteps) if ((await questFinishOf(ctx, member, rewardKeyOf({ kind: "journey", step }))) === null) return step;
  return null;
}

async function hugLadderStartOf(ctx: QueryCtx, member: MemberId): Promise<number | null> {
  const start = await ctx.db
    .query("hugLadders")
    .withIndex("by_member", (q) => q.eq("member", member))
    .unique();
  return start?.at ?? null;
}

function newestHugOf(ctx: QueryCtx, member: MemberId) {
  return ctx.db
    .query("questRecognitions")
    .withIndex("by_giver_source_at", (q) => q.eq("giver", member).eq("source", "hug"))
    .order("desc")
    .first();
}

function hugsSince(ctx: QueryCtx, member: MemberId, start: number) {
  return ctx.db
    .query("questRecognitions")
    .withIndex("by_giver_source_at", (q) => q.eq("giver", member).eq("source", "hug").gte("at", start))
    .take(mostHugsCounted);
}
