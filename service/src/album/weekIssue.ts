// The album's week issue: the weeks a member can open, newest first and at most a year of them, and the one asked for,
// with its tallies, counts and kudos. Today's convex/album/weekIssue.ts over the service's transaction.
import { and, eq, gte, lte } from "drizzle-orm";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { weekTallies, type Doc } from "../db/schema/index.ts";
import type { DayKey } from "../engine/allowance.ts";
import { firstCountedWeekOf, totalsOf, weekCountsBetween, type RecognitionCounts } from "../leaderboard/counts.ts";
import { keyOf } from "../leaderboard/periods.ts";
import { givingWeekOf } from "../progression/progress.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { anEmptyWeek, weekAt, weekRowOf, weekTallyIn, type WeekTally } from "./tallies.ts";
import { weekKudosOf, type WeekKudosLists } from "./weekKudos.ts";

export const weeksShown = 52;

const weekMs = 7 * 24 * 60 * 60 * 1000;
const dayKeyShape = /^\d{4}-\d{2}-\d{2}$/;

export type WeekTab = { week: DayKey; days: number[]; counted: number };

export type Issue = Required<WeekTally> & WeekKudosLists;

export type WeekEdition = { week: DayKey; thisWeek: DayKey; weeks: WeekTab[]; issue: Issue | null };

type WeekRow = Doc<"weekTallies">;

export async function weekEditionOf(ctx: QueryContext, member: MemberId, asked: DayKey | undefined, now: number): Promise<WeekEdition> {
  const thisWeek = await weekAt(ctx, member, now);
  const week = asked ?? thisWeek;
  const [first, newest] = [await endWeekRow(ctx, member, "asc"), await endWeekRow(ctx, member, "desc")];
  if (first === null || newest === null) return { week, thisWeek, weeks: [], issue: null };
  const firstWeek = earlierOf(first.week, (await firstCountedWeekOf(ctx, member)) ?? first.week);
  const newestShown = laterOf(thisWeek, newest.week);
  const oldestShown = laterOf(firstWeek, weeksBefore(newestShown, weeksShown - 1));
  const shown = new Map((await weekRowsBetween(ctx, member, oldestShown, newestShown)).map((row) => [row.week, row]));
  const counted = await weekCountsBetween(ctx, member, oldestShown, newestShown);
  const weeks = weeksBetween(oldestShown, newestShown).map((each) => ({ week: each, days: shown.get(each)?.days ?? anEmptyWeek().days, counted: sumOf(counted.get(each)) }));
  const hasAnIssue = isAWeek(week) && week >= firstWeek && week <= newestShown;
  return { week, thisWeek, weeks, issue: hasAnIssue ? await issueOf(ctx, member, week, shown.get(week) ?? (await weekRowOf(ctx, member, week))) : null };
}

async function issueOf(ctx: QueryContext, member: MemberId, week: DayKey, row: WeekRow | null): Promise<Issue> {
  const { packsOpened = 0, newFaces = { people: [], more: 0 }, hoggiesFound = { hoggies: [], more: 0 }, ...tally } = row === null ? anEmptyWeek() : weekTallyIn(row);
  return { ...tally, ...(await countsOf(ctx, member, week)), packsOpened, newFaces, hoggiesFound, ...(await weekKudosOf(ctx, member, week, tally.kudosOfWeek?.message ?? null)) };
}

async function countsOf(ctx: QueryContext, member: MemberId, week: DayKey): Promise<RecognitionCounts> {
  const { kudosGiven, kudosReceived, hugsGiven, hugsReceived } = await totalsOf(ctx, member, keyOf("week", week));
  return { kudosGiven, kudosReceived, hugsGiven, hugsReceived };
}

function sumOf(counts: RecognitionCounts | undefined) {
  return counts === undefined ? 0 : counts.kudosGiven + counts.kudosReceived + counts.hugsGiven + counts.hugsReceived;
}

function isAWeek(day: DayKey) {
  return dayKeyShape.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && givingWeekOf(day) === day;
}

function laterOf(one: DayKey, other: DayKey) {
  return one > other ? one : other;
}

function earlierOf(one: DayKey, other: DayKey) {
  return one < other ? one : other;
}

function weeksBefore(week: DayKey, weeks: number): DayKey {
  return new Date(Date.parse(`${week}T00:00:00Z`) - weeks * weekMs).toISOString().slice(0, 10);
}

function weeksBetween(oldest: DayKey, newest: DayKey): DayKey[] {
  const weeks: DayKey[] = [];
  for (let week = newest; week >= oldest; week = weeksBefore(week, 1)) weeks.push(week);
  return weeks;
}

const byMemberWeek = indexOrder(weekTallies, ["member", "week"]);

/** The member's first row by week, or with `desc` the last, as `by_member_week` orders them. */
async function endWeekRow(ctx: QueryContext, member: MemberId, direction: "asc" | "desc"): Promise<WeekRow | null> {
  const [row] = await ctx.tx.select().from(weekTallies).where(eq(weekTallies.member, member)).orderBy(...byMemberWeek.orderBy(direction)).limit(1);
  return row === undefined ? null : toDocument<WeekRow>(weekTallies, row);
}

async function weekRowsBetween(ctx: QueryContext, member: MemberId, oldest: DayKey, newest: DayKey): Promise<WeekRow[]> {
  const rows = await ctx.tx
    .select()
    .from(weekTallies)
    .where(and(eq(weekTallies.member, member), gte(weekTallies.week, oldest), lte(weekTallies.week, newest)))
    .orderBy(...byMemberWeek.orderBy());
  return rows.map((row) => toDocument<WeekRow>(weekTallies, row));
}
