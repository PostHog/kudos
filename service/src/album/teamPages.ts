// The module map's skeleton of convex/album/teamPages.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { CompanyFace } from "../companyProfiles/faces.ts";
import { type TeamCrestArt } from "../companyProfiles/teams.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { TeamSticker } from "./records.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type TeamState = "progress" | "ready" | "unlocked";

export type TeamPage = {
  team: string;
  name: string;
  art: TeamCrestArt;
  mine: boolean;
  people: MemberId[];
  unmatched: number[];
  held: number;
  total: number;
  state: TeamState;
  unlockedAt: number | null;
};

export type PageOwner = { workspace: string; member: MemberId };

export type StoredMatch = { profile: number; face: CompanyFace | null };

export type TeamPagesAndPeople = { pages: TeamPage[]; held: Set<MemberId>; matchOf: Map<MemberId, StoredMatch> };

export type TeamProgress = Pick<TeamPage, "name" | "held" | "total">;

export async function teamPagesOf(ctx: QueryContext, owner: PageOwner): Promise<TeamPage[]> {
  throw notPorted("album.teamPages.teamPagesOf");
}

export async function teamPagesAndPeopleOf(ctx: QueryContext, { workspace, member }: PageOwner): Promise<TeamPagesAndPeople> {
  throw notPorted("album.teamPages.teamPagesAndPeopleOf");
}

export async function teamStickersOf(ctx: QueryContext, member: MemberId): Promise<Map<string, TeamSticker>> {
  throw notPorted("album.teamPages.teamStickersOf");
}

export function teamProgressWith({ pages, held }: TeamPagesAndPeople, person: MemberId, arriving: ReadonlySet<MemberId>): TeamProgress[] {
  const isArriving = (someone: MemberId) => arriving.has(someone) && !held.has(someone);
  return pages.filter(({ people }) => people.includes(person)).map(({ name, people, held: counted, total }) => ({ name, held: counted + people.filter(isArriving).length, total }));
}

export function isComplete({ held, total }: Pick<TeamPage, "held" | "total">) {
  return total > 0 && held === total;
}
