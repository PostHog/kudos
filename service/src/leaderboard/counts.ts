// The module map's skeleton of convex/leaderboard/counts.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type DayKey } from "../engine/allowance.ts";
import type { AwardId } from "../engine/awards.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { type MemberId } from "../workspace/directory.ts";
import { type PeriodKey } from "./periods.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type RecognitionCounts = { kudosGiven: number; kudosReceived: number; hugsGiven: number; hugsReceived: number };

export type PeriodTotals = RecognitionCounts & { firstDay: DayKey | null };

export type MemberTotals = PeriodTotals & { member: MemberId };

export type Landing = { workspace: string; member: MemberId; day: DayKey };

type Added = Partial<RecognitionCounts>;

export const countedKeys = {
  kudosReceived: (award: AwardId) => `kudos-received:${award}`,
  hugGiven: (giver: MemberId, { conversation, message }: MessageRef) => `hug-given:${giver}:${conversation}:${message}`,
  hugReceived: (person: MemberId, giver: MemberId, { conversation, message }: MessageRef) => `hug-received:${person}:${giver}:${conversation}:${message}`,
};

export async function countOnce(ctx: MutationContext, workspace: string, key: string): Promise<boolean> {
  throw notPorted("leaderboard.counts.countOnce");
}

export async function landingAt(ctx: QueryContext, workspace: string, member: MemberId, at: number): Promise<Landing> {
  throw notPorted("leaderboard.counts.landingAt");
}

export async function addCounts(ctx: MutationContext, landing: Landing, added: Added): Promise<void> {
  throw notPorted("leaderboard.counts.addCounts");
}

export async function noteGivingDay(ctx: MutationContext, { member, day }: Landing): Promise<void> {
  throw notPorted("leaderboard.counts.noteGivingDay");
}

export async function totalsOf(ctx: QueryContext, member: MemberId, period: PeriodKey): Promise<PeriodTotals> {
  throw notPorted("leaderboard.counts.totalsOf");
}

export async function firstCountedWeekOf(ctx: QueryContext, member: MemberId): Promise<DayKey | null> {
  throw notPorted("leaderboard.counts.firstCountedWeekOf");
}

export async function weekCountsBetween(ctx: QueryContext, member: MemberId, oldest: DayKey, newest: DayKey): Promise<Map<DayKey, RecognitionCounts>> {
  throw notPorted("leaderboard.counts.weekCountsBetween");
}

export async function weekCountsThrough(ctx: QueryContext, member: MemberId, newest: DayKey): Promise<Map<DayKey, RecognitionCounts>> {
  throw notPorted("leaderboard.counts.weekCountsThrough");
}

export async function totalsIn(ctx: QueryContext, workspace: string, period: PeriodKey): Promise<MemberTotals[]> {
  throw notPorted("leaderboard.counts.totalsIn");
}

export async function weekCountedBy(ctx: QueryContext, workspace: string, monday: DayKey): Promise<boolean> {
  throw notPorted("leaderboard.counts.weekCountedBy");
}
