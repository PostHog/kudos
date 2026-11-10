// The hug ladder: Give 3, 5 and 10 hugs, counted from the member's first hug under two-quests. Today's
// convex/quests/hugLadder.ts over the service's transaction, with one change: the ladder counts every hug given under
// two-quests whatever order the hugs arrive in, where today's ladder lost a hug that arrived after a later one.
import { and, eq, gt, gte, lt } from "drizzle-orm";
import { indexOrder } from "../db/indexOrder.ts";
import { hugLadders, questRecognitions } from "../db/schema/index.ts";
import { rewardKeyOf } from "./crates.ts";
import { finishMondayQuest } from "./finish.ts";
import { questFinishOf } from "./finishes.ts";
import { mondayCatalogueVersion } from "./mondayCatalogue.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Reward } from "./journey.ts";
import type { JourneyStep } from "./step.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const hugLadderSteps = ["hugs-3", "hugs-5", "hugs-10"] as const satisfies readonly JourneyStep[];

export type HugLadderStep = (typeof hugLadderSteps)[number];

export const hugLadderReward: Reward = { xp: 20, coins: 0, item: null };

const hugsToFinish: Record<HugLadderStep, number> = { "hugs-3": 3, "hugs-5": 5, "hugs-10": 10 };

const mostHugsCounted = hugsToFinish["hugs-10"];

export function hugLadderTargetOf(step: HugLadderStep): number {
  return hugsToFinish[step];
}

/**
 * Starts the member's ladder at a hug just recorded under two-quests, or moves its start back to that hug when it was
 * given before the start: so the ladder's start is the earliest such hug, whatever order they arrived in. It never
 * reaches back over a hug recorded while two-quests was off: every hug recorded under two-quests passes here, so a hug
 * between this one and the start was recorded without it, and this hug then counts for nothing, as the hugs before
 * two-quests do.
 */
export async function startTheHugLadder(ctx: MutationContext, member: MemberId, at: number): Promise<void> {
  const ladder = await hugLadderOf(ctx, member);
  if (ladder !== null && ladder.at <= at) return;
  if (await hugBetween(ctx, member, at, ladder?.at ?? null)) return;
  if (ladder === null) await ctx.tx.insert(hugLadders).values({ ...ctx.newRow(), member, at });
  else await ctx.tx.update(hugLadders).set({ at }).where(eq(hugLadders._id, ladder._id));
}

export async function advanceHugLadder(ctx: MutationContext, workspace: string, member: MemberId): Promise<void> {
  const ladder = await hugLadderOf(ctx, member);
  if (ladder === null) return;
  const hugs = await hugsSince(ctx, member, ladder.at);
  for (const step of hugLadderSteps) {
    const reaching = hugs[hugLadderTargetOf(step) - 1];
    if (reaching === undefined) return;
    await finishMondayQuest(ctx, workspace, member, { kind: "journey", step }, { reward: hugLadderReward, catalogueVersion: mondayCatalogueVersion }, reaching.at);
  }
}

export async function hugsOnTheLadderOf(ctx: QueryContext, member: MemberId): Promise<number> {
  const ladder = await hugLadderOf(ctx, member);
  return ladder === null ? 0 : (await hugsSince(ctx, member, ladder.at)).length;
}

export async function nextHugLadderStepOf(ctx: QueryContext, member: MemberId): Promise<HugLadderStep | null> {
  for (const step of hugLadderSteps) if ((await questFinishOf(ctx, member, rewardKeyOf({ kind: "journey", step }))) === null) return step;
  return null;
}

const byMember = indexOrder(hugLadders, ["member"]);
const byGiverSourceAt = indexOrder(questRecognitions, ["giver", "source", "at"]);

/** The member's ladder, or `null`; two fail, as `.unique()` did. */
async function hugLadderOf(ctx: QueryContext, member: MemberId) {
  const rows = await ctx.tx.select({ _id: hugLadders._id, at: hugLadders.at }).from(hugLadders).where(eq(hugLadders.member, member)).orderBy(...byMember.orderBy()).limit(2);
  if (rows.length > 1) throw new Error("The member has more than one hug ladder");
  return rows[0] ?? null;
}

/** Whether the member gave a hug after `after` and before `before`, or at any time after when `before` is `null`. */
async function hugBetween(ctx: QueryContext, member: MemberId, after: number, before: number | null): Promise<boolean> {
  const [hug] = await ctx.tx
    .select({ _id: questRecognitions._id })
    .from(questRecognitions)
    .where(and(eq(questRecognitions.giver, member), eq(questRecognitions.source, "hug"), gt(questRecognitions.at, after), before === null ? undefined : lt(questRecognitions.at, before)))
    .orderBy(...byGiverSourceAt.orderBy())
    .limit(1);
  return hug !== undefined;
}

/** The member's first hugs from `start`, by when each was given. */
function hugsSince(ctx: QueryContext, member: MemberId, start: number) {
  return ctx.tx
    .select({ at: questRecognitions.at })
    .from(questRecognitions)
    .where(and(eq(questRecognitions.giver, member), eq(questRecognitions.source, "hug"), gte(questRecognitions.at, start)))
    .orderBy(...byGiverSourceAt.orderBy())
    .limit(mostHugsCounted);
}
