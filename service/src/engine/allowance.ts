// The module map's skeleton of convex/engine/allowance.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type DayKey = string;

export type Week = { monday: DayKey; sunday: DayKey };

export type DailyAllowance = { opening: number; left: number; spend(kudos: number): Promise<void> };

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

export function allowanceDay(at: number, timeZone: string | undefined): DayKey {
  return new Intl.DateTimeFormat("en-CA", { timeZone: dayZoneOf(timeZone) }).format(at);
}

export function dayZoneOf(timeZone: string | undefined): string {
  return timeZone ?? "UTC";
}

export function nextAllowanceDayStart(at: number, timeZone: string | undefined) {
  const today = allowanceDay(at, timeZone);
  let stillToday = at;
  let tomorrow = at + 2 * dayMs;
  while (tomorrow - stillToday > 1) {
    const middle = Math.floor((stillToday + tomorrow) / 2);
    if (allowanceDay(middle, timeZone) === today) stillToday = middle;
    else tomorrow = middle;
  }
  return tomorrow;
}

export function wallClockAt(day: DayKey, hour: number, timeZone: string | undefined): number {
  const asIfUtc = Date.parse(`${day}T00:00:00Z`) + hour * hourMs;
  const firstGuess = asIfUtc - offsetAt(asIfUtc, timeZone);
  return asIfUtc - offsetAt(firstGuess, timeZone);
}

function offsetAt(at: number, timeZone: string | undefined): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: dayZoneOf(timeZone), hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)!.value);
  const wallClock = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wallClock - (at - (at % 1000));
}

export function weekOf(day: DayKey): Week {
  const date = Date.parse(`${day}T00:00:00Z`);
  const daysSinceMonday = (new Date(date).getUTCDay() + 6) % 7;
  const monday = date - daysSinceMonday * dayMs;
  return { monday: dayKeyOf(monday), sunday: dayKeyOf(monday + 6 * dayMs) };
}

export async function allowanceLeft(ctx: QueryContext, giver: MemberId, day: DayKey, base: number): Promise<number> {
  throw notPorted("engine.allowance.allowanceLeft");
}

export async function dailyAllowance(ctx: MutationContext, giver: MemberId, day: DayKey, base: number): Promise<DailyAllowance> {
  throw notPorted("engine.allowance.dailyAllowance");
}

function dayKeyOf(utcMidnight: number): DayKey {
  return new Date(utcMidnight).toISOString().slice(0, 10);
}
