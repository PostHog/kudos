import { allowanceDay, wallClockAt, weekOf, type DayKey } from "../engine/allowance.ts";

export type WeekKey = DayKey;

const dayMs = 24 * 60 * 60 * 1000;

export function weekKeyOf(at: number, timeZone: string | undefined): WeekKey {
  return weekKeyOfDay(allowanceDay(at, timeZone));
}

export function weekKeyOfDay(day: DayKey): WeekKey {
  return weekOf(day).monday;
}

export function daysLeftInWeek(at: number, timeZone: string | undefined): number {
  const today = allowanceDay(at, timeZone);
  return (Date.parse(weekOf(today).sunday) - Date.parse(today)) / dayMs + 1;
}

export function weekStartOf(week: WeekKey, timeZone: string | undefined): number {
  return wallClockAt(week, 0, timeZone);
}
