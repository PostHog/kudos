// The module map's skeleton of convex/leaderboard/topKudos.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Instants } from "../album/packs.ts";
import { type UnlockedTeam } from "../album/teamStickers.ts";
import type { Segment } from "../activity/entries.ts";
import type { DayKey } from "../engine/allowance.ts";
import { type Find } from "../album/items/finds.ts";
import { type MemberId } from "../workspace/directory.ts";
import { type NewGiver } from "./newGivers.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const kudosQuoted = 3;
export const topKudosHighlighted = 1;
export const mostKudosRanked = 500;
export const mostKudosChecked = 200;
export const mostTeamStickersRead = 500;
export const wordedSegmentsQuotedAtMost = 200;
export const recipientsNamed = 3;

export type QuotedPerson = { member: MemberId; name: string };

export type QuotedKudos = { giver: QuotedPerson; recipients: QuotedPerson[]; moreRecipients: number; words: Segment[]; permalink: string | null; find: Find | null };

export type TopKudosPost = { kind: "topKudos"; kudos: QuotedKudos[]; teams: UnlockedTeam[]; origin: string | null; newGivers?: NewGiver[] };

export async function topKudosPostOf(ctx: QueryContext, workspace: string, week: Instants, postWeek: DayKey): Promise<TopKudosPost> {
  throw notPorted("leaderboard.topKudos.topKudosPostOf");
}
