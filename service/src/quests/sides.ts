// Two-quests' side quests: once a side's onboarding is finished (the kudos journey, or the hug ladder's last step), that
// side draws one quest a week from its own pool, which the side's own recognitions since the draw finish once.
// Today's convex/quests/sides.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import type { QuestsDrawnEvent } from "../bus/events.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { questSideDraws, type Doc } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import { lastThankedSince } from "../engine/awards.ts";
import { isSameMessage, type MessageRef } from "../engine/messageEvent.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import { rewardKeyOf } from "./crates.ts";
import { drawFactsOf, factsAtTheStartOf, hugDrawFactsOf, hugFactsAtTheStartOf, timeZoneOf } from "./drawFacts.ts";
import { finishMondayQuest } from "./finish.ts";
import { questFinishOf } from "./finishes.ts";
import { onTheMondayPath, twoQuestsOn } from "./flag.ts";
import { rewardValidator } from "./journey.ts";
import { onboardingFinishedAt } from "./onboarding.ts";
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
} from "./pool.ts";
import { isRecipient, notThankedForMs, questProgress, type CountedAward } from "./progress.ts";
import { drawRank } from "./rank.ts";
import { recognitionsOf, type RecognitionFact } from "./recognitions.ts";
import { questStartOf } from "./start.ts";
import type { WeeklyQuest } from "./step.ts";
import { weekKeyOf, weekKeyOfDay, weekStartOf, type WeekKey } from "./week.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const sides: Side[] = ["hug", "kudos"];

export type Side = RecognitionFact["source"];

const sideValidator = z.union([z.literal("hug"), z.literal("kudos")]);

export const questSideDrawValidator = z.strictObject({
  member: zv.id("members"),
  week: z.string(),
  side: sideValidator,
  quest: questIdValidator,
  reward: rewardValidator,
  catalogueVersion: z.string(),
  feasibleBecause: z.union([feasibleBecauseValidator, hugFeasibleBecauseValidator]),
  drawnAt: zv.number(),
});

type SideDraw = z.infer<typeof questSideDrawValidator>;

// A side quest finishes under the weekly reward key of its own slot. The three-quest draw holds slots 0 to 2, so a week
// drawn the old way before two-quests turned on never shares a key with a side quest of the same week.
const sideSlots: Record<Side, number> = { hug: 3, kudos: 4 };

const pools: Record<Side, typeof hugQuestPool | typeof mondayQuestPool> = { hug: hugQuestPool, kudos: mondayQuestPool };

const byMemberWeekSide = indexOrder(questSideDraws, ["member", "week", "side"]);

export async function drawSidesWhenDue(ctx: MutationContext, member: MemberId, at: number): Promise<boolean> {
  let drawn = false;
  for (const side of sides) drawn = (await drawSideWhenDue(ctx, member, side, at)) || drawn;
  return drawn;
}

export async function awaitsASideDraw(ctx: QueryContext, member: MemberId, at: number): Promise<boolean> {
  const week = weekKeyOf(at, await timeZoneOf(ctx, member));
  for (const side of sides) {
    const opensAt = await sideOpensAt(ctx, member, side);
    if (opensAt !== null && opensAt <= at && (await sideDrawOf(ctx, member, week, side)) === null) return true;
  }
  return false;
}

export type SideQuestOfTheWeek = { quest: WeeklyQuest; pooled: PoolQuest; xp: number; done: number; finished: boolean };

export type KudosQuestFinished = { goal: string; xp: number };

export async function advanceSide(ctx: MutationContext, fact: RecognitionFact): Promise<void> {
  const draw = await sideDrawOf(ctx, fact.giver, weekKeyOfDay(fact.day), fact.source);
  if (draw === null || fact.at < draw.drawnAt || (await isSideFinished(ctx, draw))) return;
  const reachedAt = await targetReachedAt(ctx, draw);
  if (reachedAt === null) return;
  const { workspace } = await chatUserOf(ctx, fact.giver);
  const cause = draw.side === "kudos" ? fact.message : undefined;
  await finishMondayQuest(ctx, workspace, fact.giver, sideQuestOf(draw), { reward: draw.reward, catalogueVersion: draw.catalogueVersion, poolQuest: draw.quest }, reachedAt, cause);
}

export async function sideQuestOfTheWeek(ctx: QueryContext, member: MemberId, side: Side, at: number): Promise<SideQuestOfTheWeek | null> {
  const draw = await sideDrawOf(ctx, member, weekKeyOf(at, await timeZoneOf(ctx, member)), side);
  if (draw === null) return null;
  const pooled = questOf(draw.quest);
  const target = pooled.progress.target;
  const finished = await isSideFinished(ctx, draw);
  const done = finished ? target : Math.min((await sideProgress(ctx, draw, pooled))(await countedFactsOf(ctx, draw)), target);
  return { quest: sideQuestOf(draw), pooled, xp: draw.reward.xp, done, finished };
}

export async function kudosQuestFinishedBy(ctx: QueryContext, member: MemberId, day: string, message: MessageRef): Promise<KudosQuestFinished[]> {
  const draw = await sideDrawOf(ctx, member, weekKeyOfDay(day), "kudos");
  if (draw === null) return [];
  const finish = await questFinishOf(ctx, member, rewardKeyOf(sideQuestOf(draw)));
  return finish?.cause !== undefined && isSameMessage(finish.cause, message) ? [{ goal: questOf(draw.quest).goal, xp: finish.xp }] : [];
}

export async function sideGoalOf(ctx: QueryContext, member: MemberId, { week, slot }: WeeklyQuest): Promise<string | null> {
  const side = sides.find((candidate) => sideSlots[candidate] === slot);
  const draw = side === undefined ? null : await sideDrawOf(ctx, member, week, side);
  return draw === null ? null : questOf(draw.quest).goal;
}

async function drawSideWhenDue(ctx: MutationContext, member: MemberId, side: Side, at: number): Promise<boolean> {
  const opensAt = await sideOpensAt(ctx, member, side);
  if (opensAt === null || at < opensAt) return false;
  const timeZone = await timeZoneOf(ctx, member);
  const week = weekKeyOf(at, timeZone);
  if (weekKeyOf(opensAt, timeZone) === week) return drawSide(ctx, member, side, week, at, false);
  return drawSide(ctx, member, side, week, weekStartOf(week, timeZone), true);
}

async function sideOpensAt(ctx: QueryContext, member: MemberId, side: Side): Promise<number | null> {
  if (!(await onTheMondayPath(ctx, member)) || !(await twoQuestsOn(ctx, member)) || (await questStartOf(ctx, member)) === null) return null;
  const onboardingFinished = side === "kudos" ? await onboardingFinishedAt(ctx, member) : await hugLadderFinishedAt(ctx, member);
  return onboardingFinished === null ? null : onboardingFinished + 1;
}

async function hugLadderFinishedAt(ctx: QueryContext, member: MemberId): Promise<number | null> {
  return (await questFinishOf(ctx, member, rewardKeyOf({ kind: "journey", step: "hugs-10" })))?.at ?? null;
}

// Drawn once per member, week and side: S18's recovery restarts the sweep from the start and relies on this check.
async function drawSide(ctx: MutationContext, member: MemberId, side: Side, week: WeekKey, at: number, atTheWeeksStart: boolean): Promise<boolean> {
  if ((await sideDrawOf(ctx, member, week, side)) !== null) return false;
  const drawn = await firstFeasible(ctx, member, side, week, at, atTheWeeksStart);
  if (drawn === null) return false;
  const pool = pools[side];
  const draw: SideDraw = { member, week, side, quest: drawn.quest.quest, reward: drawn.quest.reward, catalogueVersion: pool.version, feasibleBecause: drawn.feasibleBecause, drawnAt: at };
  await ctx.tx.insert(questSideDraws).values(fromDocument(questSideDraws, { ...ctx.newRow(), ...draw }) as typeof questSideDraws.$inferInsert);
  const { workspace } = await chatUserOf(ctx, member);
  const announced: QuestsDrawnEvent = { type: "questsDrawn", workspace, member, week, quests: [drawn.quest.quest], at };
  await ctx.publish(announced);
  return true;
}

async function firstFeasible(ctx: QueryContext, member: MemberId, side: Side, week: WeekKey, at: number, atTheWeeksStart: boolean) {
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
async function targetReachedAt(ctx: QueryContext, draw: SideDraw): Promise<number | null> {
  const pooled = questOf(draw.quest);
  const facts = await countedFactsOf(ctx, draw);
  const progressOf = await sideProgress(ctx, draw, pooled);
  for (let reached = 1; reached <= facts.length; reached += 1) if (progressOf(facts.slice(0, reached)) >= pooled.progress.target) return facts[reached - 1]!.at;
  return null;
}

async function countedFactsOf(ctx: QueryContext, draw: SideDraw): Promise<RecognitionFact[]> {
  return (await recognitionsOf(ctx, draw.member, draw.week)).filter(({ source, at }) => source === draw.side && at >= draw.drawnAt).sort((one, other) => one.at - other.at);
}

async function sideProgress(ctx: QueryContext, draw: SideDraw, pooled: PoolQuest): Promise<(facts: RecognitionFact[]) => number> {
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

function isSideFinished(ctx: QueryContext, draw: SideDraw): Promise<boolean> {
  return questFinishOf(ctx, draw.member, rewardKeyOf(sideQuestOf(draw))).then((finish) => finish !== null);
}

function sideQuestOf({ week, side }: SideDraw): WeeklyQuest {
  return { kind: "weekly", week, slot: sideSlots[side] };
}

/** The member's draw for the week's side, or `null`; two fail, as `.unique()` did. */
async function sideDrawOf(ctx: QueryContext, member: MemberId, week: WeekKey, side: Side): Promise<Doc<"questSideDraws"> | null> {
  const rows = await ctx.tx
    .select()
    .from(questSideDraws)
    .where(and(eq(questSideDraws.member, member), eq(questSideDraws.week, week), eq(questSideDraws.side, side)))
    .orderBy(...byMemberWeekSide.orderBy())
    .limit(2);
  const row = unique("questSideDraws", rows);
  return row === null ? null : toDocument<Doc<"questSideDraws">>(questSideDraws, row);
}
