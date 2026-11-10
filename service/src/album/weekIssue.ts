// The module map's skeleton of convex/album/weekIssue.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DayKey } from "../engine/allowance.ts";
import type { MemberId } from "../workspace/directory.ts";
import { type WeekTally } from "./tallies.ts";
import { type WeekKudosLists } from "./weekKudos.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const weeksShown = 52;

export type WeekTab = { week: DayKey; days: number[]; counted: number };

export type Issue = Required<WeekTally> & WeekKudosLists;

export type WeekEdition = { week: DayKey; thisWeek: DayKey; weeks: WeekTab[]; issue: Issue | null };

export async function weekEditionOf(ctx: QueryContext, member: MemberId, asked: DayKey | undefined, now: number): Promise<WeekEdition> {
  throw notPorted("album.weekIssue.weekEditionOf");
}
