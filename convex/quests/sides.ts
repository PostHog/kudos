import { v, type Infer } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { publish } from "../bus/publish";
import { lastThankedSince } from "../engine/awards";
import { chatUserOf, type MemberId } from "../workspace/directory";
import { rewardKeyOf } from "./crates";
import { drawFactsOf, factsAtTheStartOf, hugDrawFactsOf, hugFactsAtTheStartOf, timeZoneOf } from "./drawFacts";
import { finishMondayQuest } from "./finish";
import { questFinishOf } from "./finishes";
import { onTheMondayPath, twoQuestsOn } from "./flag";
import { rewardValidator } from "./journey";
import { onboardingFinishedAt } from "./onboarding";
import {
  feasibility,
  feasibleBecauseValidator,
  hugFeasibility,
  hugFeasibleBecauseValidator,
  hugQuestPool,
  mondayQuestPool,
  questIdValidator,
  questOf,
  type PoolQuest,
  type Recipient,
} from "./pool";
import { isRecipient, notThankedForMs, questProgress, type CountedAward } from "./progress";
import { drawRank } from "./rank";
import { recognitionsOf, type RecognitionFact } from "./recognitions";
import { questStartOf } from "./start";
import type { WeeklyQuest } from "./step";
import { weekKeyOf, weekKeyOfDay, weekStartOf, type WeekKey } from "./week";

export const sides: Side[] = ["hug", "kudos"];

export type Side = RecognitionFact["source"];

const sideValidator = v.union(v.literal("hug"), v.literal("kudos"));

export const questSideDrawValidator = v.object({
  member: v.id("members"),
  week: v.string(),
  side: sideValidator,
  quest: questIdValidator,
  reward: rewardValidator,
  catalogueVersion: v.string(),
  feasibleBecause: v.union(feasibleBecauseValidator, hugFeasibleBecauseValidator),
  drawnAt: v.number(),
});

type SideDraw = Infer<typeof questSideDrawValidator>;

// A side quest finishes under the weekly reward key of its own slot. The three-quest draw holds slots 0 to 2, so a week
// drawn the old way before two-quests turned on never shares a key with a side quest of the same week.
const sideSlots: Record<Side, number> = { hug: 3, kudos: 4 };

const pools: Record<Side, typeof hugQuestPool | typeof mondayQuestPool> = { hug: hugQuestPool, kudos: mondayQuestPool };

export async function drawSidesWhenDue(ctx: MutationCtx, member: MemberId, at: number): Promise<boolean> {
  let drawn = false;
  for (const side of sides) drawn = (await drawSideWhenDue(ctx, member, side, at)) || drawn;
  return drawn;
}

export async function awaitsASideDraw(ctx: QueryCtx, member: MemberId, at: number): Promise<boolean> {
  const week = weekKeyOf(at, await timeZoneOf(ctx, member));
  for (const side of sides) {
    const opensAt = await sideOpensAt(ctx, member, side);
    if (opensAt !== null && opensAt <= at && (await sideDrawOf(ctx, member, week, side)) === null) return true;
  }
  return false;
}

export async function advanceSide(ctx: MutationCtx, fact: RecognitionFact): Promise<void> {
  const draw = await sideDrawOf(ctx, fact.giver, weekKeyOfDay(fact.day), fact.source);
  if (draw === null || fact.at < draw.drawnAt || (await isSideFinished(ctx, draw))) return;
  const reachedAt = await targetReachedAt(ctx, draw);
  if (reachedAt === null) return;
  const { workspace } = await chatUserOf(ctx, fact.giver);
  await finishMondayQuest(ctx, workspace, fact.giver, sideQuestOf(draw), { reward: draw.reward, catalogueVersion: draw.catalogueVersion, poolQuest: draw.quest }, reachedAt);
}

export async function unfinishedSideQuestOf(ctx: QueryCtx, member: MemberId, side: Side, at: number): Promise<WeeklyQuest | null> {
  const draw = await sideDrawOf(ctx, member, weekKeyOf(at, await timeZoneOf(ctx, member)), side);
  return draw === null || (await isSideFinished(ctx, draw)) ? null : sideQuestOf(draw);
}

async function drawSideWhenDue(ctx: MutationCtx, member: MemberId, side: Side, at: number): Promise<boolean> {
  const opensAt = await sideOpensAt(ctx, member, side);
  if (opensAt === null || at < opensAt) return false;
  const timeZone = await timeZoneOf(ctx, member);
  const week = weekKeyOf(at, timeZone);
  if (weekKeyOf(opensAt, timeZone) === week) return drawSide(ctx, member, side, week, at, false);
  return drawSide(ctx, member, side, week, weekStartOf(week, timeZone), true);
}

async function sideOpensAt(ctx: QueryCtx, member: MemberId, side: Side): Promise<number | null> {
  if (!(await onTheMondayPath(ctx, member)) || !(await twoQuestsOn(ctx, member)) || (await questStartOf(ctx, member)) === null) return null;
  const onboardingFinished = side === "kudos" ? await onboardingFinishedAt(ctx, member) : await hugLadderFinishedAt(ctx, member);
  return onboardingFinished === null ? null : onboardingFinished + 1;
}

async function hugLadderFinishedAt(ctx: QueryCtx, member: MemberId): Promise<number | null> {
  return (await questFinishOf(ctx, member, rewardKeyOf({ kind: "journey", step: "hugs-10" })))?.at ?? null;
}

async function drawSide(ctx: MutationCtx, member: MemberId, side: Side, week: WeekKey, at: number, atTheWeeksStart: boolean): Promise<boolean> {
  if ((await sideDrawOf(ctx, member, week, side)) !== null) return false;
  const drawn = await firstFeasible(ctx, member, side, week, at, atTheWeeksStart);
  if (drawn === null) return false;
  const pool = pools[side];
  await ctx.db.insert("questSideDraws", { member, week, side, quest: drawn.quest.quest, reward: drawn.quest.reward, catalogueVersion: pool.version, feasibleBecause: drawn.feasibleBecause, drawnAt: at });
  const { workspace } = await chatUserOf(ctx, member);
  await publish(ctx, { type: "questsDrawn", workspace, member, week, quests: [drawn.quest.quest], at });
  return true;
}

async function firstFeasible(ctx: QueryCtx, member: MemberId, side: Side, week: WeekKey, at: number, atTheWeeksStart: boolean) {
  const ranked = [...pools[side].quests].sort((one, other) => drawRank(`${member}:${week}:${one.quest}`) - drawRank(`${member}:${week}:${other.quest}`));
  if (side === "hug") {
    const facts = atTheWeeksStart ? await hugFactsAtTheStartOf(ctx, member, at) : await hugDrawFactsOf(ctx, member, at);
    return firstOf(ranked, (quest) => hugFeasibility(quest, facts));
  }
  const facts = atTheWeeksStart ? await factsAtTheStartOf(ctx, member, at) : await drawFactsOf(ctx, member, at);
  return firstOf(ranked, (quest) => feasibility(quest, facts));
}

function firstOf<Because>(ranked: PoolQuest[], feasibleBecause: (quest: PoolQuest) => Because | null): { quest: PoolQuest; feasibleBecause: Because } | null {
  for (const quest of ranked) {
    const because = feasibleBecause(quest);
    if (because !== null) return { quest, feasibleBecause: because };
  }
  return null;
}

// Facts can be delivered out of order, so the quest's progress is replayed in time order, and it finishes at the fact
// that first reached its target.
async function targetReachedAt(ctx: QueryCtx, draw: SideDraw): Promise<number | null> {
  const pooled = questOf(draw.quest);
  const facts = (await recognitionsOf(ctx, draw.member, draw.week)).filter(({ source, at }) => source === draw.side && at >= draw.drawnAt).sort((one, other) => one.at - other.at);
  const progressOf = await sideProgress(ctx, draw, pooled);
  for (let reached = 1; reached <= facts.length; reached += 1) if (progressOf(facts.slice(0, reached)) >= pooled.progress.target) return facts[reached - 1]!.at;
  return null;
}

async function sideProgress(ctx: QueryCtx, draw: SideDraw, pooled: PoolQuest): Promise<(facts: RecognitionFact[]) => number> {
  const { counts, given } = pooled.progress;
  if (draw.side === "hug") return (facts) => (counts === "days" ? new Set(facts.map(({ day }) => day)).size : facts.length);
  const lastThanked = given.to === "anyone" ? new Map<MemberId, number>() : await lastThankedSince(ctx, draw.member, draw.drawnAt - notThankedForMs, draw.drawnAt - 1);
  return (facts) => questProgress(pooled, peopleCounted(facts, given.to, new Map(lastThanked)));
}

function peopleCounted(facts: RecognitionFact[], to: Recipient, lastThanked: Map<MemberId, number>): CountedAward[] {
  const people: CountedAward[] = [];
  for (const { people: thanked, day, at } of facts) {
    for (const recipient of thanked) if (isRecipient(to, lastThanked.get(recipient) ?? null, at)) people.push({ recipient, day });
    for (const recipient of thanked) lastThanked.set(recipient, at);
  }
  return people;
}

function isSideFinished(ctx: QueryCtx, draw: SideDraw): Promise<boolean> {
  return questFinishOf(ctx, draw.member, rewardKeyOf(sideQuestOf(draw))).then((finish) => finish !== null);
}

function sideQuestOf({ week, side }: SideDraw): WeeklyQuest {
  return { kind: "weekly", week, slot: sideSlots[side] };
}

function sideDrawOf(ctx: QueryCtx, member: MemberId, week: WeekKey, side: Side) {
  return ctx.db
    .query("questSideDraws")
    .withIndex("by_member_week_side", (q) => q.eq("member", member).eq("week", week).eq("side", side))
    .unique();
}
