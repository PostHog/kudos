// The module map's skeleton of convex/album/personPage.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { TeamCrestArt } from "../companyProfiles/teams.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { ReactionsToward } from "./hypeCollections.ts";
import type { PageOwner } from "./teamPages.ts";
import type { PairTally } from "./tallies.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type PersonTeam = { team: string; name: string; art: TeamCrestArt };

export type HypeEmoji = { earned: boolean; name: string | null; picture: string | null; inSlack: boolean; reactions?: ReactionsToward; byReactions?: true };

export type PersonPage = PairTally & { held: boolean; teams: PersonTeam[]; hype: HypeEmoji };

export async function personPageOf(ctx: QueryContext, owner: PageOwner, person: MemberId): Promise<PersonPage | null> {
  throw notPorted("album.personPage.personPageOf");
}

export async function personTeamsOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<PersonTeam[]> {
  throw notPorted("album.personPage.personTeamsOf");
}
