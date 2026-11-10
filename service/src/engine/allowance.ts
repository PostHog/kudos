// The daily allowance, as today's convex/engine/allowance.ts: the allowance day turns at the giver's local midnight,
// and one row per giver and day keeps what they spent of it.
import { and, eq } from "drizzle-orm";
import { unique } from "../db/unique.ts";
import { allowanceSpending } from "../db/schema/engine.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";

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

export async function allowanceLeft({ tx }: QueryContext, giver: MemberId, day: DayKey, base: number): Promise<number> {
  const spending = await spendingOn(tx, giver, day);
  return leftOf(base, spending?.spent ?? 0);
}

export async function dailyAllowance({ tx, newRow }: MutationContext, giver: MemberId, day: DayKey, base: number): Promise<DailyAllowance> {
  const spending = await spendingOn(tx, giver, day);
  const spent = spending?.spent ?? 0;
  return {
    opening: base,
    left: leftOf(base, spent),
    async spend(kudos) {
      if (spending === null) await tx.insert(allowanceSpending).values({ ...newRow(), giver, day, spent: kudos });
      else await tx.update(allowanceSpending).set({ spent: spent + kudos }).where(eq(allowanceSpending._id, spending._id));
    },
  };
}

function leftOf(base: number, spent: number) {
  return Math.max(0, base - spent);
}

async function spendingOn(tx: Transaction, giver: MemberId, day: DayKey) {
  const rows = await tx
    .select({ _id: allowanceSpending._id, spent: allowanceSpending.spent })
    .from(allowanceSpending)
    .where(and(eq(allowanceSpending.giver, giver), eq(allowanceSpending.day, day)))
    .limit(2);
  return unique("allowanceSpending", rows);
}

function dayKeyOf(utcMidnight: number): DayKey {
  return new Date(utcMidnight).toISOString().slice(0, 10);
}
