import type { DayKey } from "../engine/allowance.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { LadderId } from "./ladders.ts";

export type MeasuredAward = { recipient: MemberId; day: DayKey };

export type Mark = { group: string; key: string; distinct: number };

export type Step = { adds: number; keeps: boolean };

const marks = {
  connections: ({ recipient }) => ({ group: recipient, key: recipient, distinct: 1 }),
  dependability: ({ day }) => ({ group: day, key: day, distinct: 1 }),
  applause: ({ day, recipient }) => ({ group: day, key: recipient, distinct: 3 }),
  seasons: ({ day }) => ({ group: monthOf(day), key: monthOf(day), distinct: 1 }),
} satisfies Partial<Record<LadderId, (award: MeasuredAward) => Mark>>;

export type MarkedLadder = keyof typeof marks;

export function markOf(ladder: MarkedLadder, award: MeasuredAward): Mark {
  return marks[ladder](award);
}

export function stepOf(mark: Mark, marked: readonly string[]): Step {
  if (marked.length >= mark.distinct || marked.includes(mark.key)) return { adds: 0, keeps: false };
  return { adds: marked.length + 1 === mark.distinct ? 1 : 0, keeps: true };
}

function monthOf(day: DayKey): string {
  return day.slice(0, "yyyy-mm".length);
}
