import { v, type Infer } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { publish } from "../bus/publish";
import { lastThankedSince } from "../engine/awards";
import type { MessageRef } from "../engine/messageEvent";
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
  withoutFullStop,
  type PoolQuest,
  type Recipient,
} from "./pool";
import { isRecipient, notThankedForMs, progressUnitOf, questProgress, type CountedAward, type MovedQuest } from "./progress";
import { drawRank } from "./rank";
import { recognitionsOf, type RecognitionFact } from "./recognitions";
import { questStartOf } from "./start";
import type { WeeklyQuest } from "./step";
import { weekKeyOf, weekKeyOfDay, weekStartOf, type WeekKey } from "./week";

export const sides = ["hug", "kudos"] as const;

export type Side = (typeof sides)[number];

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

const sideOfSource: Record<RecognitionFact["source"], Side> = { hug: "hug", kudos: "kudos" };

const pools: Record<Side, typeof hugQuestPool | typeof mondayQuestPool> = { hug: hugQuestPool, kudos: mondayQuestPool };

export type SideFinished = { goal: string; xp: number };

export type SideAdvance = { finished: SideFinished[]; moved: MovedQuest[] };

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

export async function advanceSide(ctx: MutationCtx, member: MemberId, fact: RecognitionFact, cause?: MessageRef): Promise<SideAdvance> {
  const nothing: SideAdvance = { finished: [], moved: [] };
  const draw = await sideDrawOf(ctx, member, weekKeyOfDay(fact.day), sideOfSource[fact.source]);
  if (draw === null || fact.at < draw.drawnAt || (await isSideFinished(ctx, draw))) return nothing;
  const pooled = questOf(draw.quest);
  const progress = await sideProgressReadOf(ctx, draw, pooled);
  const done = progress(fact.at);
  const before = progress(fact.at - 1);
  const target = pooled.progress.target;
  if (done < target) return done > before && draw.side === "kudos" ? { finished: [], moved: [{ goal: withoutFullStop(pooled.goal), progress: { done, of: target, unit: progressUnitOf(pooled) } }] } : nothing;
  const { workspace } = await chatUserOf(ctx, member);
  const finished = await finishMondayQuest(ctx, workspace, member, sideQuestOf(draw), { reward: draw.reward, catalogueVersion: draw.catalogueVersion, poolQuest: draw.quest }, fact.at, cause);
  return finished ? { finished: [{ goal: pooled.goal, xp: draw.reward.xp }], moved: [] } : nothing;
}

export async function sideGoalOf(ctx: QueryCtx, member: MemberId, { week, slot }: WeeklyQuest): Promise<string | null> {
  const side = sides.find((candidate) => sideSlots[candidate] === slot);
  if (side === undefined) return null;
  const draw = await sideDrawOf(ctx, member, week, side);
  return draw === null ? null : questOf(draw.quest).goal;
}

async function drawSideWhenDue(ctx: MutationCtx, member: MemberId, side: Side, at: number): Promise<boolean> {
  const opensAt = await sideOpensAt(ctx, member, side);
  if (opensAt === null) return false;
  const timeZone = await timeZoneOf(ctx, member);
  const week = weekKeyOf(at, timeZone);
  if (weekKeyOf(opensAt, timeZone) === week) return drawSide(ctx, member, side, week, Math.max(at, opensAt), false);
  return at < opensAt ? false : drawSide(ctx, member, side, week, weekStartOf(week, timeZone), true);
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

async function sideProgressReadOf(ctx: QueryCtx, draw: SideDraw, pooled: PoolQuest): Promise<(until: number) => number> {
  const facts = (await recognitionsOf(ctx, draw.member, draw.week)).filter(({ source, at }) => sideOfSource[source] === draw.side && at >= draw.drawnAt).sort((one, other) => one.at - other.at);
  const { counts, target, given } = pooled.progress;
  if (draw.side === "hug") return (until) => Math.min(counted(facts, until, ({ day }) => day, counts === "days"), target);
  const lastThanked = given.to === "anyone" ? new Map<MemberId, number>() : await lastThankedSince(ctx, draw.member, draw.drawnAt - notThankedForMs, draw.drawnAt - 1);
  return (until) => questProgress(pooled, peopleCounted(facts.filter(({ at }) => at <= until), given.to, new Map(lastThanked)));
}

function counted(facts: RecognitionFact[], until: number, dayOf: (fact: RecognitionFact) => string, distinctDays: boolean): number {
  const upTo = facts.filter(({ at }) => at <= until);
  return distinctDays ? new Set(upTo.map(dayOf)).size : upTo.length;
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
