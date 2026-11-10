// The week's three quests on the Monday path: drawn once per member and week, from their week's start where they live,
// and moved by each kudos that counts toward them until each finishes once. Today's convex/quests/weekly.ts over the
// service's transaction.
import { and, eq } from "drizzle-orm";
import type { KudosGivenEvent, QuestsDrawnEvent } from "../bus/events.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { awards, questDraws, questProgress as questProgressRows } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import { awardIdValidator, firstDecidedOf, lastThankedBefore, type AwardId } from "../engine/awards.ts";
import { republish } from "../feedback/homes.ts";
import { gateDecisionOf } from "../progression/gate.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import { questFinishOf } from "./finishes.ts";
import { rewardKeyOf } from "./crates.ts";
import { drawFactsOf, factsAtTheStartOf, timeZoneOf } from "./drawFacts.ts";
import { finishMondayQuest } from "./finish.ts";
import { onTheMondayPath, twoQuestsOn } from "./flag.ts";
import { rewardValidator } from "./journey.ts";
import { isPaidOnTheMondayPath } from "./mondayCatalogue.ts";
import { onboardingFinishedAt } from "./onboarding.ts";
import { feasibility, feasibleBecauseValidator, mondayQuestPool, questIdValidator, questOf, withoutFullStop, type DrawFacts, type FeasibleBecause, type PoolQuest } from "./pool.ts";
import { counts, progressUnitOf, questProgress, type Moved, type MovedQuest, type ProgressRead, type QuestAward } from "./progress.ts";
import { drawRank } from "./rank.ts";
import { drawSidesWhenDue, sideGoalOf } from "./sides.ts";
import { questStartOf } from "./start.ts";
import type { WeeklyQuest } from "./step.ts";
import { weekKeyOf, weekKeyOfDay, weekStartOf, type WeekKey } from "./week.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

const questsPerWeek = 3;

const slotValidator = z.strictObject({
  slot: zv.number(),
  quest: questIdValidator,
  reward: rewardValidator,
  catalogueVersion: z.string(),
  feasibleBecause: feasibleBecauseValidator,
});

export const questDrawValidator = z.strictObject({ member: zv.id("members"), week: z.string(), drawnAt: zv.number(), slots: z.array(slotValidator) });

export const questProgressValidator = z.strictObject({
  member: zv.id("members"),
  week: z.string(),
  slot: zv.number(),
  quest: questIdValidator,
  award: awardIdValidator,
  recipient: zv.id("members"),
  day: z.string(),
  at: zv.number(),
});

type Slot = z.infer<typeof slotValidator>;

type Draw = z.infer<typeof questDrawValidator>;

type FeasibleQuest = { quest: PoolQuest; feasibleBecause: FeasibleBecause };

export type WeeklySlot = Slot & { goal: string; progress: number; target: number; finishedAt: number | null };

export type DrawnWeek = Omit<WeeklyQuests, "slots"> & { slots: Array<WeeklySlot & { crate: WeeklyQuest }> };

type WeeklyQuests = { week: WeekKey; drawnAt: number; slots: WeeklySlot[] };

export type FinishedWeeklyQuest = { crate: WeeklyQuest; goal: string; reward: Slot["reward"] };

export type AdvancedWeeklyQuests = { finished: FinishedWeeklyQuest[]; moved: MovedQuest[] };

type SlotAdvance = { kind: "unchanged" } | { kind: "advanced"; done: number } | { kind: "finished" };

const byMemberWeek = indexOrder(questDraws, ["member", "week"]);
const byMemberWeekSlot = indexOrder(questProgressRows, ["member", "week", "slot"]);

export async function advanceWeeklyQuests(ctx: MutationContext, event: KudosGivenEvent): Promise<AdvancedWeeklyQuests> {
  let shownChanged = (await drawWhenDue(ctx, event.giver, event.at)) === "drawn";
  const finished: FinishedWeeklyQuest[] = [];
  const moved: MovedQuest[] = [];
  const draw = (await twoQuestsOn(ctx, event.giver)) ? null : await drawOf(ctx, event.giver, weekKeyOfDay(event.day));
  if (draw !== null && isMondayDraw(draw)) {
    const open = event.at < draw.drawnAt ? [] : await unfinishedSlotsOf(ctx, draw);
    const awards = open.length === 0 ? [] : await questAwardsOf(ctx, event);
    for (const slot of open) {
      const advanced = await advanceSlot(ctx, event, draw, slot, awards);
      if (advanced.kind === "finished") finished.push({ crate: weeklyQuest(draw.week, slot), goal: questOf(slot.quest).goal, reward: slot.reward });
      if (advanced.kind === "advanced") moved.push(movedQuestOf(slot, advanced.done));
      shownChanged = advanced.kind !== "unchanged" || shownChanged;
    }
  }
  if (shownChanged) await republish(ctx, event.giver);
  return { finished, moved };
}

function movedQuestOf({ quest }: Slot, done: number): MovedQuest {
  const pooled = questOf(quest);
  return { goal: withoutFullStop(pooled.goal), progress: { done, of: pooled.progress.target, unit: progressUnitOf(pooled) } };
}

export const drawNewWeekArgs = z.strictObject({ member: zv.id("members") });
export async function drawNewWeek(ctx: MutationContext, { member }: z.infer<typeof drawNewWeekArgs>): Promise<void> {
  if (!(await onTheMondayPath(ctx, member))) return;
  const at = ctx.now;
  const drawn = (await drawWhenDue(ctx, member, at)) === "drawn";
  if ((await drawSidesWhenDue(ctx, member, at)) || drawn) await republish(ctx, member);
}
export const drawNewWeekJob = mutationJob("quests.weekly.drawNewWeek", drawNewWeekArgs, drawNewWeek);

export async function thisWeeksQuestsOf(ctx: MutationContext, member: MemberId, at: number): Promise<WeeklyQuests | null> {
  await drawWhenDue(ctx, member, at);
  return weeklyQuestsOf(ctx, member, at);
}

export async function awaitsThisWeeksDraw(ctx: QueryContext, { _id: member, timeZone }: Doc<"members">, at: number): Promise<boolean> {
  return (await drawsOpenAt(ctx, member)) !== null && (await drawOf(ctx, member, weekKeyOf(at, timeZone))) === null;
}

export async function weeklyQuestsOf(ctx: QueryContext, member: MemberId, at: number): Promise<WeeklyQuests | null> {
  const draw = await thisWeeksDrawOf(ctx, member, at);
  if (draw === null) return null;
  const { week, drawnAt } = draw;
  return { week, drawnAt, slots: await weeklySlotsOf(ctx, draw) };
}

export async function mondayQuestsMovedSince(ctx: QueryContext, member: MemberId, { since, until, mostAwards }: ProgressRead): Promise<Moved[]> {
  const draw = await thisWeeksDrawOf(ctx, member, ctx.now);
  if (draw === null) return [];
  const moved: Moved[] = [];
  for (const slot of draw.slots) {
    const pooled = questOf(slot.quest);
    const rows = await countedWithin(ctx, member, draw.week, slot, mostAwards);
    if (rows === null) continue;
    const counted = await withDecided(ctx, rows);
    const from = questProgress(pooled, counted.filter(({ decided }) => decided <= since));
    const to = questProgress(pooled, counted.filter(({ decided }) => decided <= until));
    if (from < to && to < pooled.progress.target) moved.push({ name: withoutFullStop(pooled.goal), from, to, of: pooled.progress.target });
  }
  return moved;
}

export async function drawnWeekOf(ctx: QueryContext, member: MemberId, at: number): Promise<DrawnWeek | null> {
  const draw = await thisWeeksDrawOf(ctx, member, at);
  if (draw === null) return null;
  const { week, drawnAt } = draw;
  const slots = await weeklySlotsOf(ctx, draw);
  return { week, drawnAt, slots: slots.map((slot) => ({ ...slot, crate: weeklyQuest(week, slot) })) };
}

async function thisWeeksDrawOf(ctx: QueryContext, member: MemberId, at: number): Promise<Draw | null> {
  if (await twoQuestsOn(ctx, member)) return null;
  const draw = await drawOf(ctx, member, weekKeyOf(at, await timeZoneOf(ctx, member)));
  return draw !== null && isMondayDraw(draw) ? draw : null;
}

async function weeklySlotsOf(ctx: QueryContext, draw: Draw): Promise<WeeklySlot[]> {
  const slots: WeeklySlot[] = [];
  for (const slot of draw.slots) slots.push(await weeklySlotOf(ctx, draw, slot));
  return slots;
}

export async function weeklyGoalOf(ctx: QueryContext, member: MemberId, { week, slot }: WeeklyQuest): Promise<string> {
  const sideGoal = await sideGoalOf(ctx, member, { kind: "weekly", week, slot });
  if (sideGoal !== null) return sideGoal;
  const draw = (await drawOf(ctx, member, week))!;
  const finished = draw.slots.find((drawn) => drawn.slot === slot)!;
  return questOf(finished.quest).goal;
}

async function weeklySlotOf(ctx: QueryContext, draw: Draw, slot: Slot): Promise<WeeklySlot> {
  const { member, week } = draw;
  const pooled = questOf(slot.quest);
  const finish = await finishOfSlot(ctx, draw, slot);
  const progress = questProgress(pooled, await countedFor(ctx, member, week, slot));
  return { ...slot, goal: pooled.goal, progress, target: pooled.progress.target, finishedAt: finish?.at ?? null };
}

async function unfinishedSlotsOf(ctx: QueryContext, draw: Draw): Promise<Slot[]> {
  const open: Slot[] = [];
  for (const slot of draw.slots) if (!(await isFinished(ctx, draw, slot))) open.push(slot);
  return open;
}

async function isFinished(ctx: QueryContext, draw: Draw, slot: Slot): Promise<boolean> {
  return (await finishOfSlot(ctx, draw, slot)) !== null;
}

function finishOfSlot(ctx: QueryContext, { member, week }: Draw, slot: Slot) {
  return questFinishOf(ctx, member, rewardKeyOf(weeklyQuest(week, slot)));
}

// An award counts toward a slot once: one already counted is not fresh, so a kudos followed twice moves nothing twice.
async function advanceSlot(ctx: MutationContext, event: KudosGivenEvent, { member, week }: Draw, slot: Slot, awards: QuestAward[]): Promise<SlotAdvance> {
  const quest = weeklyQuest(week, slot);
  const pooled = questOf(slot.quest);
  const counted = await countedFor(ctx, member, week, slot);
  const fresh = awards.filter((award) => counts(pooled, award) && !counted.some((earlier) => earlier.award === award.award));
  if (fresh.length === 0) return { kind: "unchanged" };
  for (const { award, recipient, day, at } of fresh) await ctx.tx.insert(questProgressRows).values({ ...ctx.newRow(), member, week, slot: slot.slot, quest: slot.quest, award, recipient, day, at });
  const before = questProgress(pooled, counted);
  const after = questProgress(pooled, [...counted, ...fresh]);
  if (after === pooled.progress.target && (await finishMondayQuest(ctx, event.workspace, member, quest, { ...slot, poolQuest: slot.quest }, event.at, event.message))) return { kind: "finished" };
  return after === before ? { kind: "unchanged" } : { kind: "advanced", done: after };
}

export function isMondayDraw({ slots }: { slots: Array<{ catalogueVersion: string }> }): boolean {
  return slots.some(isPaidOnTheMondayPath);
}

async function questAwardsOf(ctx: QueryContext, { awards, annotations, day, at }: KudosGivenEvent): Promise<QuestAward[]> {
  const saysWhy = gateDecisionOf(annotations)?.thoughtful === true;
  const lastThanked = await lastThankedBefore(ctx, awards);
  return awards.flatMap(({ award, recipient }) => {
    const before = lastThanked.get(award);
    return before === undefined ? [] : [{ award, recipient, day, at, saysWhy, lastThankedBefore: before }];
  });
}

/** The slot's counted awards, in the index's order, as `.collect()` read them. */
async function countedFor(ctx: QueryContext, member: MemberId, week: WeekKey, { slot, quest }: Slot): Promise<Array<Doc<"questProgress">>> {
  const rows = await ctx.tx
    .select()
    .from(questProgressRows)
    .where(and(eq(questProgressRows.member, member), eq(questProgressRows.week, week), eq(questProgressRows.slot, slot)))
    .orderBy(...byMemberWeekSlot.orderBy());
  return rows.map((row) => toDocument<Doc<"questProgress">>(questProgressRows, row)).filter((row) => row.quest === quest);
}

/** The slot's first `mostAwards + 1` counted awards in the index's order, as `.take` read them; `null` past `mostAwards`. */
async function countedWithin(ctx: QueryContext, member: MemberId, week: WeekKey, { slot, quest }: Slot, mostAwards: number): Promise<Array<Doc<"questProgress">> | null> {
  const rows = await ctx.tx
    .select()
    .from(questProgressRows)
    .where(and(eq(questProgressRows.member, member), eq(questProgressRows.week, week), eq(questProgressRows.slot, slot)))
    .orderBy(...byMemberWeekSlot.orderBy())
    .limit(mostAwards + 1);
  return rows.length > mostAwards ? null : rows.map((row) => toDocument<Doc<"questProgress">>(questProgressRows, row)).filter((row) => row.quest === quest);
}

async function withDecided(ctx: QueryContext, counted: Array<Doc<"questProgress">>): Promise<Array<Doc<"questProgress"> & { decided: number }>> {
  return Promise.all(counted.map(async (row) => ({ ...row, decided: (await decidedOf(ctx, row.award)) ?? row.at })));
}

async function decidedOf(ctx: QueryContext, award: AwardId): Promise<number | null> {
  const [row] = await ctx.tx.select({ workspace: awards.workspace, conversation: awards.conversation, message: awards.message }).from(awards).where(eq(awards._id, award));
  return row === undefined ? null : firstDecidedOf(ctx, row);
}

function weeklyQuest(week: WeekKey, { slot }: Slot): WeeklyQuest {
  return { kind: "weekly", week, slot };
}

async function drawWhenDue(ctx: MutationContext, member: MemberId, at: number): Promise<"drawn" | "nothing to draw"> {
  const opensAt = await drawsOpenAt(ctx, member);
  if (opensAt === null) return "nothing to draw";
  const timeZone = await timeZoneOf(ctx, member);
  const week = weekKeyOf(at, timeZone);
  if (weekKeyOf(opensAt, timeZone) === week) return drawFor(ctx, member, Math.max(at, opensAt));
  return at < opensAt ? "nothing to draw" : drawFor(ctx, member, weekStartOf(week, timeZone), factsAtTheStartOf);
}

async function drawsOpenAt(ctx: QueryContext, member: MemberId): Promise<number | null> {
  return (await onTheMondayPath(ctx, member)) && !(await twoQuestsOn(ctx, member)) ? mondayDrawsOpenAt(ctx, member) : null;
}

async function mondayDrawsOpenAt(ctx: QueryContext, member: MemberId): Promise<number | null> {
  const start = await questStartOf(ctx, member);
  const onboardingFinished = start === null ? null : await onboardingFinishedAt(ctx, member);
  return start === null || onboardingFinished === null ? null : Math.max(start, onboardingFinished + 1);
}

// Drawn once per member and week: S18's recovery restarts the sweep from the start and relies on this check.
async function drawFor(ctx: MutationContext, member: MemberId, at: number, factsOf = drawFactsOf): Promise<"drawn" | "nothing to draw"> {
  const week = weekKeyOf(at, await timeZoneOf(ctx, member));
  if ((await drawOf(ctx, member, week)) !== null) return "nothing to draw";
  const slots = drawFrom(member, week, await factsOf(ctx, member, at));
  if (slots.length === 0) return "nothing to draw";
  const draw: Draw = { member, week, drawnAt: at, slots };
  await ctx.tx.insert(questDraws).values(fromDocument(questDraws, { ...ctx.newRow(), ...draw }) as typeof questDraws.$inferInsert);
  const { workspace } = await chatUserOf(ctx, member);
  const announced: QuestsDrawnEvent = { type: "questsDrawn", workspace, member, week, quests: slots.map(({ quest }) => quest), at };
  await ctx.publish(announced);
  return "drawn";
}

function drawFrom(member: MemberId, week: WeekKey, facts: DrawFacts): Slot[] {
  return rankedFeasible(member, week, facts)
    .slice(0, questsPerWeek)
    .map((feasible, slot) => slotOf(slot, feasible));
}

function rankedFeasible(member: MemberId, week: WeekKey, facts: DrawFacts): FeasibleQuest[] {
  const ranked = [...mondayQuestPool.quests].sort((one, other) => rankOf(member, week, one) - rankOf(member, week, other));
  return ranked.flatMap((quest) => {
    const feasibleBecause = feasibility(quest, facts);
    return feasibleBecause === null ? [] : [{ quest, feasibleBecause }];
  });
}

function slotOf(slot: number, { quest: { quest, reward }, feasibleBecause }: FeasibleQuest): Slot {
  return { slot, quest, reward, catalogueVersion: mondayQuestPool.version, feasibleBecause };
}

function rankOf(member: MemberId, week: WeekKey, { quest }: PoolQuest) {
  return drawRank(`${member}:${week}:${quest}`);
}

/** The member's draw for the week, or `null`; two fail, as `.unique()` did. */
async function drawOf(ctx: QueryContext, member: MemberId, week: WeekKey): Promise<Doc<"questDraws"> | null> {
  const rows = await ctx.tx
    .select()
    .from(questDraws)
    .where(and(eq(questDraws.member, member), eq(questDraws.week, week)))
    .orderBy(...byMemberWeek.orderBy())
    .limit(2);
  const row = unique("questDraws", rows);
  return row === null ? null : toDocument<Doc<"questDraws">>(questDraws, row);
}
