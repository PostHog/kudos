import { z } from "zod";
import { weekOf, type DayKey } from "../engine/allowance.ts";

export const periodValidator = z.union([z.literal("week"), z.literal("month"), z.literal("all")]);

export type Period = z.infer<typeof periodValidator>;

export type ComparedPeriod = Exclude<Period, "all">;

export type PeriodKey = string;

export type Days = { first: DayKey; last: DayKey };

export type SameDay = { key: PeriodKey; day: number };

export type PeriodOfKey = { period: ComparedPeriod; days: Days };

export type Compared = { now: PeriodKey; before: SameDay | null };

export const periods: Period[] = ["week", "month", "all"];

export const allTimeKey: PeriodKey = "all";

const dayMs = 24 * 60 * 60 * 1000;

export function keyOf(period: Period, day: DayKey): PeriodKey {
  switch (period) {
    case "week":
      return `week:${weekOf(day).monday}`;
    case "month":
      return `month:${day.slice(0, 7)}`;
    case "all":
      return allTimeKey;
  }
}

export function comparedOn(period: Period, today: DayKey): Compared {
  return { now: keyOf(period, today), before: period === "all" ? null : sameDayLastPeriod(period, today) };
}

export function wholeWeekBefore(monday: DayKey): Compared {
  const lastMonday = dayKeyOf(utcMidnightOf(monday) - 7 * dayMs);
  return { now: keyOf("week", lastMonday), before: { key: keyOf("week", dayKeyOf(utcMidnightOf(lastMonday) - 7 * dayMs)), day: 6 } };
}

export function lastPeriodUpToTheSameDay(period: ComparedPeriod, today: DayKey): Days {
  return period === "week" ? lastWeekUpTo(today) : lastMonthUpTo(today);
}

export function sameDayLastPeriod(period: ComparedPeriod, today: DayKey): SameDay {
  const { first, last } = lastPeriodUpToTheSameDay(period, today);
  return { key: keyOf(period, first), day: dayOfPeriod(period, last) };
}

export function dayOfPeriod(period: ComparedPeriod, day: DayKey): number {
  if (period === "month") return Number(day.slice(8, 10)) - 1;
  return (utcMidnightOf(day) - utcMidnightOf(weekOf(day).monday)) / dayMs;
}

export function periodOfKey(key: PeriodKey): PeriodOfKey | null {
  const [period, start] = key.split(":");
  if (period === "week" && start !== undefined) return { period, days: { first: start, last: dayKeyOf(utcMidnightOf(start) + 6 * dayMs) } };
  if (period === "month" && start !== undefined) return { period, days: { first: `${start}-01`, last: lastDayOfMonth(start) } };
  return null;
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return dayKeyOf(Date.UTC(year!, monthNumber!, 0));
}

function utcMidnightOf(day: DayKey) {
  return Date.parse(`${day}T00:00:00Z`);
}

function lastWeekUpTo(day: DayKey): Days {
  const sameWeekdayLastWeek = dayKeyOf(utcMidnightOf(day) - 7 * dayMs);
  return { first: weekOf(sameWeekdayLastWeek).monday, last: sameWeekdayLastWeek };
}

function lastMonthUpTo(day: DayKey): Days {
  const today = new Date(`${day}T00:00:00Z`);
  const [year, month] = [today.getUTCFullYear(), today.getUTCMonth()];
  const daysInLastMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { first: dayKeyOf(Date.UTC(year, month - 1, 1)), last: dayKeyOf(Date.UTC(year, month - 1, Math.min(today.getUTCDate(), daysInLastMonth))) };
}

function dayKeyOf(utcMidnight: number): DayKey {
  return new Date(utcMidnight).toISOString().slice(0, 10);
}
