import type { DayKey } from "../engine/allowance.ts";

const daysToBecomeOldFriends = 30;

const dayMs = 24 * 60 * 60 * 1000;

export function thanksAnOldFriend(lastThanked: DayKey | null, day: DayKey): boolean {
  return lastThanked !== null && daysBetween(lastThanked, day) >= daysToBecomeOldFriends;
}

function daysBetween(earlier: DayKey, later: DayKey) {
  return (utcMidnightOf(later) - utcMidnightOf(earlier)) / dayMs;
}

function utcMidnightOf(day: DayKey) {
  return Date.parse(`${day}T00:00:00Z`);
}
