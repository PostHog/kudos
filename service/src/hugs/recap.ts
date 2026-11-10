// The module map's skeleton of convex/hugs/recap.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DayKey } from "../engine/allowance.ts";
import type { RecapEmojiLine } from "../feedback/albumRecap.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type RecapLine = string | { text: string; link: { url: string; label: string } };

export type HugsSection = { lines: RecapLine[]; closing: RecapLine[]; emojiLine: RecapEmojiLine | null };

const dayMs = 24 * 60 * 60 * 1000;

export async function hugsSectionFor(ctx: MutationContext, member: MemberId, monday: DayKey): Promise<HugsSection | null> {
  throw notPorted("hugs.recap.hugsSectionFor");
}

export async function hugsSentInTheMondayDm(ctx: MutationContext, member: MemberId, monday: DayKey): Promise<void> {
  throw notPorted("hugs.recap.hugsSentInTheMondayDm");
}

export function mondayAfter(week: DayKey): DayKey {
  return mondayShiftedBy(week, 7);
}

function mondayShiftedBy(monday: DayKey, days: number): DayKey {
  return new Date(Date.parse(`${monday}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
}
