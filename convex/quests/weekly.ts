import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { KudosGivenEvent } from "../bus/events";
import { publish } from "../bus/publish";
import { allowanceDay, allowanceLeft } from "../engine/allowance";
import { awardIdValidator, firstDecidedOf, lastThankedBefore, lastThankedSince, type AwardId } from "../engine/awards";
import { republish } from "../feedback/homes";
import { gateDecisionOf } from "../progression/gate";
import { chatUserOf, teammatesOf, type MemberId } from "../workspace/directory";
import { settingsOf } from "../workspace/settings";
import { questFinishOf } from "./finishes";
import { rewardKeyOf } from "./crates";
import { finishMondayQuest } from "./finish";
import { onTheMondayPath, twoQuestsOn } from "./flag";
import { rewardValidator } from "./journey";
import { isPaidOnTheMondayPath } from "./mondayCatalogue";
import { onboardingFinishedAt } from "./onboarding";
import { feasibility, feasibleBecauseValidator, mondayQuestPool, questIdValidator, questOf, withoutFullStop, type DrawFacts, type FeasibleBecause, type PoolQuest, type Recipient } from "./pool";
import { counts, isRecipient, notThankedForMs, progressUnitOf, questProgress, type Moved, type MovedQuest, type ProgressRead, type QuestAward } from "./progress";
import { drawRank } from "./rank";
import { questStartOf } from "./start";
import type { WeeklyQuest } from "./step";
import { daysLeftInWeek, weekKeyOf, weekKeyOfDay, weekStartOf, type WeekKey } from "./week";

const questsPerWeek = 3;

const slotValidator = v.object({
  slot: v.number(),
  quest: questIdValidator,
  reward: rewardValidator,
  catalogueVersion: v.string(),
  feasibleBecause: feasibleBecauseValidator,
});

export const questDrawValidator = v.object({ member: v.id("members"), week: v.string(), drawnAt: v.number(), slots: v.array(slotValidator) });

export const questProgressValidator = v.object({
  member: v.id("members"),
  week: v.string(),
  slot: v.number(),
  quest: questIdValidator,
  award: awardIdValidator,
  recipient: v.id("members"),
  day: v.string(),
  at: v.number(),
});

type Slot = Infer<typeof slotValidator>;

type Draw = Infer<typeof questDrawValidator>;

type FeasibleQuest = { quest: PoolQuest; feasibleBecause: FeasibleBecause };

export type WeeklySlot = Slot & { goal: string; progress: number; target: number; finishedAt: number | null };

export type DrawnWeek = Omit<WeeklyQuests, "slots"> & { slots: Array<WeeklySlot & { crate: WeeklyQuest }> };

type WeeklyQuests = { week: WeekKey; drawnAt: number; slots: WeeklySlot[] };

export type FinishedWeeklyQuest = { crate: WeeklyQuest; goal: string; reward: Slot["reward"] };

export type AdvancedWeeklyQuests = { finished: FinishedWeeklyQuest[]; moved: MovedQuest[] };

type SlotAdvance = { kind: "unchanged" } | { kind: "advanced"; done: number } | { kind: "finished" };

export async function advanceWeeklyQuests(ctx: MutationCtx, event: KudosGivenEvent): Promise<AdvancedWeeklyQuests> {
  let shownChanged = (await drawWhenDue(ctx, event.giver, event.at)) === "drawn";
  const finished: FinishedWeeklyQuest[] = [];
  const moved: MovedQuest[] = [];
  const draw = await drawOf(ctx, event.giver, weekKeyOfDay(event.day));
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

export const drawNewWeek = internalMutation({
  args: { member: v.id("members") },
  handler: async (ctx, { member }): Promise<void> => {
    if (!(await onTheMondayPath(ctx, member))) return;
    if ((await drawWhenDue(ctx, member, Date.now())) === "drawn") await republish(ctx, member);
  },
});

export async function thisWeeksQuestsOf(ctx: MutationCtx, member: MemberId, at: number): Promise<WeeklyQuests | null> {
  await drawWhenDue(ctx, member, at);
  return weeklyQuestsOf(ctx, member, at);
}

export async function awaitsThisWeeksDraw(ctx: QueryCtx, { _id: member, timeZone }: Doc<"members">, at: number): Promise<boolean> {
  return (await drawsOpenAt(ctx, member)) !== null && (await drawOf(ctx, member, weekKeyOf(at, timeZone))) === null;
}

export async function weeklyQuestsOf(ctx: QueryCtx, member: MemberId, at: number): Promise<WeeklyQuests | null> {
  const draw = await thisWeeksDrawOf(ctx, member, at);
  if (draw === null) return null;
  const { week, drawnAt } = draw;
  return { week, drawnAt, slots: await weeklySlotsOf(ctx, draw) };
}

export async function mondayQuestsMovedSince(ctx: QueryCtx, member: MemberId, { since, until, mostAwards }: ProgressRead): Promise<Moved[]> {
  const draw = await thisWeeksDrawOf(ctx, member, Date.now());
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

export async function drawnWeekOf(ctx: QueryCtx, member: MemberId, at: number): Promise<DrawnWeek | null> {
  const draw = await thisWeeksDrawOf(ctx, member, at);
  if (draw === null) return null;
  const { week, drawnAt } = draw;
  const slots = await weeklySlotsOf(ctx, draw);
  return { week, drawnAt, slots: slots.map((slot) => ({ ...slot, crate: weeklyQuest(week, slot) })) };
}

async function thisWeeksDrawOf(ctx: QueryCtx, member: MemberId, at: number) {
  const draw = await drawOf(ctx, member, weekKeyOf(at, await timeZoneOf(ctx, member)));
  return draw !== null && isMondayDraw(draw) ? draw : null;
}

async function weeklySlotsOf(ctx: QueryCtx, draw: Draw): Promise<WeeklySlot[]> {
  const slots: WeeklySlot[] = [];
  for (const slot of draw.slots) slots.push(await weeklySlotOf(ctx, draw, slot));
  return slots;
}

export async function weeklyGoalOf(ctx: QueryCtx, member: MemberId, { week, slot }: WeeklyQuest): Promise<string> {
  const draw = (await drawOf(ctx, member, week))!;
  const finished = draw.slots.find((drawn) => drawn.slot === slot)!;
  return questOf(finished.quest).goal;
}

async function weeklySlotOf(ctx: QueryCtx, draw: Draw, slot: Slot): Promise<WeeklySlot> {
  const { member, week } = draw;
  const pooled = questOf(slot.quest);
  const finish = await finishOfSlot(ctx, draw, slot);
  const progress = questProgress(pooled, await countedFor(ctx, member, week, slot));
  return { ...slot, goal: pooled.goal, progress, target: pooled.progress.target, finishedAt: finish?.at ?? null };
}

async function unfinishedSlotsOf(ctx: QueryCtx, draw: Draw): Promise<Slot[]> {
  const open: Slot[] = [];
  for (const slot of draw.slots) if (!(await isFinished(ctx, draw, slot))) open.push(slot);
  return open;
}

async function isFinished(ctx: QueryCtx, draw: Draw, slot: Slot): Promise<boolean> {
  return (await finishOfSlot(ctx, draw, slot)) !== null;
}

function finishOfSlot(ctx: QueryCtx, { member, week }: Draw, slot: Slot) {
  return questFinishOf(ctx, member, rewardKeyOf(weeklyQuest(week, slot)));
}

async function advanceSlot(ctx: MutationCtx, event: KudosGivenEvent, { member, week }: Draw, slot: Slot, awards: QuestAward[]): Promise<SlotAdvance> {
  const quest = weeklyQuest(week, slot);
  const pooled = questOf(slot.quest);
  const counted = await countedFor(ctx, member, week, slot);
  const fresh = awards.filter((award) => counts(pooled, award) && !counted.some((earlier) => earlier.award === award.award));
  if (fresh.length === 0) return { kind: "unchanged" };
  for (const { award, recipient, day, at } of fresh) await ctx.db.insert("questProgress", { member, week, slot: slot.slot, quest: slot.quest, award, recipient, day, at });
  const before = questProgress(pooled, counted);
  const after = questProgress(pooled, [...counted, ...fresh]);
  if (after === pooled.progress.target && (await finishMondayQuest(ctx, event.workspace, member, quest, { ...slot, poolQuest: slot.quest }, event.at, event.message))) return { kind: "finished" };
  return after === before ? { kind: "unchanged" } : { kind: "advanced", done: after };
}

export function isMondayDraw({ slots }: { slots: Array<{ catalogueVersion: string }> }): boolean {
  return slots.some(isPaidOnTheMondayPath);
}

async function questAwardsOf(ctx: QueryCtx, { awards, annotations, day, at }: KudosGivenEvent): Promise<QuestAward[]> {
  const saysWhy = gateDecisionOf(annotations)?.thoughtful === true;
  const lastThanked = await lastThankedBefore(ctx, awards);
  return awards.flatMap(({ award, recipient }) => {
    const before = lastThanked.get(award);
    return before === undefined ? [] : [{ award, recipient, day, at, saysWhy, lastThankedBefore: before }];
  });
}

async function countedFor(ctx: QueryCtx, member: MemberId, week: WeekKey, { slot, quest }: Slot): Promise<Doc<"questProgress">[]> {
  const rows = await ctx.db
    .query("questProgress")
    .withIndex("by_member_week_slot", (q) => q.eq("member", member).eq("week", week).eq("slot", slot))
    .collect();
  return rows.filter((row) => row.quest === quest);
}

async function countedWithin(ctx: QueryCtx, member: MemberId, week: WeekKey, { slot, quest }: Slot, mostAwards: number): Promise<Doc<"questProgress">[] | null> {
  const rows = await ctx.db
    .query("questProgress")
    .withIndex("by_member_week_slot", (q) => q.eq("member", member).eq("week", week).eq("slot", slot))
    .take(mostAwards + 1);
  return rows.length > mostAwards ? null : rows.filter((row) => row.quest === quest);
}

async function withDecided(ctx: QueryCtx, counted: Doc<"questProgress">[]): Promise<Array<Doc<"questProgress"> & { decided: number }>> {
  return Promise.all(counted.map(async (row) => ({ ...row, decided: (await decidedOf(ctx, row.award)) ?? row.at })));
}

async function decidedOf(ctx: QueryCtx, award: AwardId): Promise<number | null> {
  const row = await ctx.db.get(award);
  return row === null ? null : firstDecidedOf(ctx, row);
}

function weeklyQuest(week: WeekKey, { slot }: Slot): WeeklyQuest {
  return { kind: "weekly", week, slot };
}

async function drawFactsOf(ctx: QueryCtx, member: MemberId, at: number): Promise<DrawFacts> {
  return factsWithTheDaySpent(ctx, member, at, await lastThankedAsOf(ctx, member, at, at));
}

async function factsWithTheDaySpent(ctx: QueryCtx, member: MemberId, at: number, lastThanked: LastThanked): Promise<DrawFacts> {
  const facts = await factsWithTheDayUnspent(ctx, member, at, lastThanked);
  const kudosLeftToday = await allowanceLeft(ctx, member, allowanceDay(at, await timeZoneOf(ctx, member)), facts.dailyAllowance);
  return { ...facts, kudosLeftToday };
}

async function factsAtTheStartOf(ctx: QueryCtx, member: MemberId, weekStart: number): Promise<DrawFacts> {
  return factsWithTheDayUnspent(ctx, member, weekStart, await lastThankedAsOf(ctx, member, weekStart, weekStart - 1));
}

type LastThanked = Map<MemberId, number>;

function lastThankedAsOf(ctx: QueryCtx, member: MemberId, at: number, atOrBefore: number): Promise<LastThanked> {
  return lastThankedSince(ctx, member, at - notThankedForMs, atOrBefore);
}

async function factsWithTheDayUnspent(ctx: QueryCtx, member: MemberId, at: number, lastThanked: LastThanked): Promise<DrawFacts> {
  const { workspace } = await chatUserOf(ctx, member);
  const { baseAllowance } = await settingsOf(ctx, workspace);
  const teammates = await teammatesOf(ctx, workspace, member);
  const left = (to: Recipient) => teammates.filter((teammate) => isRecipient(to, lastThanked.get(teammate) ?? null, at)).length;
  return {
    daysLeft: daysLeftInWeek(at, await timeZoneOf(ctx, member)),
    kudosLeftToday: baseAllowance,
    dailyAllowance: baseAllowance,
    peopleLeft: { anyone: left("anyone"), "someone-new": left("someone-new"), "someone-not-thanked-in-30-days": left("someone-not-thanked-in-30-days") },
  };
}

async function drawWhenDue(ctx: MutationCtx, member: MemberId, at: number): Promise<"drawn" | "nothing to draw"> {
  const opensAt = await drawsOpenAt(ctx, member);
  if (opensAt === null) return "nothing to draw";
  const timeZone = await timeZoneOf(ctx, member);
  const week = weekKeyOf(at, timeZone);
  if (weekKeyOf(opensAt, timeZone) === week) return drawFor(ctx, member, Math.max(at, opensAt));
  return at < opensAt ? "nothing to draw" : drawFor(ctx, member, weekStartOf(week, timeZone), factsAtTheStartOf);
}

async function drawsOpenAt(ctx: QueryCtx, member: MemberId): Promise<number | null> {
  return (await onTheMondayPath(ctx, member)) && !(await twoQuestsOn(ctx, member)) ? mondayDrawsOpenAt(ctx, member) : null;
}

async function mondayDrawsOpenAt(ctx: QueryCtx, member: MemberId): Promise<number | null> {
  const start = await questStartOf(ctx, member);
  const onboardingFinished = start === null ? null : await onboardingFinishedAt(ctx, member);
  return start === null || onboardingFinished === null ? null : Math.max(start, onboardingFinished + 1);
}

async function drawFor(ctx: MutationCtx, member: MemberId, at: number, factsOf = drawFactsOf): Promise<"drawn" | "nothing to draw"> {
  const week = weekKeyOf(at, await timeZoneOf(ctx, member));
  if ((await drawOf(ctx, member, week)) !== null) return "nothing to draw";
  const slots = drawFrom(member, week, await factsOf(ctx, member, at));
  if (slots.length === 0) return "nothing to draw";
  await ctx.db.insert("questDraws", { member, week, drawnAt: at, slots });
  const { workspace } = await chatUserOf(ctx, member);
  await publish(ctx, { type: "questsDrawn", workspace, member, week, quests: slots.map(({ quest }) => quest), at });
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

async function timeZoneOf(ctx: QueryCtx, member: MemberId) {
  return (await ctx.db.get(member))?.timeZone;
}

function drawOf(ctx: QueryCtx, member: MemberId, week: WeekKey) {
  return ctx.db
    .query("questDraws")
    .withIndex("by_member_week", (q) => q.eq("member", member).eq("week", week))
    .unique();
}
