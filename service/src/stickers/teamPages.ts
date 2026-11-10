// The module map's skeleton of convex/stickers/teamPages.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type CompanyProfile } from "../companyProfiles/matcher.ts";
import { type TeamCrestArt } from "../companyProfiles/teams.ts";
import type { CollectedCrest } from "../album/hoggies/collection.ts";
import type { MemberId, MemberRows } from "../workspace/directory.ts";
import type { AlbumOwner } from "./albums.ts";
import type { HeldSticker } from "./records.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type { CollectedCrest };

export type RecordedCompletion = { team: string; name: string; crestImage?: string; at: number };

export type PageCrest = { collectedAt: number; by: "roster" | "page" };

export type PersonOnPage = { person: MemberId; profile: CompanyProfile; lead: boolean; held: boolean; heldAt: number | null };

export type UnmatchedPerson = { name: string; role: string | null };

export type TeamPageOf = {
  team: string;
  name: string;
  art: TeamCrestArt;
  mine: boolean;
  listed: boolean;
  leads: string[];
  held: number;
  total: number;
  unmatched: number;
  complete: boolean;
  people: PersonOnPage[];
  unmatchedPeople: UnmatchedPerson[];
  crest: PageCrest | null;
  completion?: { at: number } | null;
};

export type TeamPagesFrom = { members: MemberRows; stickers: HeldSticker[]; crests: CollectedCrest[]; completions?: RecordedCompletion[] };

export async function teamPagesOf(ctx: QueryContext, owner: AlbumOwner, { members, stickers, crests, completions }: TeamPagesFrom): Promise<TeamPageOf[]> {
  throw notPorted("stickers.teamPages.teamPagesOf");
}

export function isFull({ held, total }: Pick<TeamPageOf, "held" | "total">) {
  return total > 0 && held === total;
}
