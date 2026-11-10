// The module map's skeleton of convex/website/teamsJoiningIn.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { TeamCrestArt } from "../companyProfiles/teams.ts";
import type { DayKey } from "../engine/allowance.ts";
import type { GroupId } from "../groups/groups.ts";
import type { BoardViewer } from "../leaderboard/boards.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type JoiningStanding = { rank: number; gain: number };

export type JoiningTeam = { group: GroupId; name: string; team: string | null; art: TeamCrestArt; joined: number; of: number; standing: JoiningStanding | null; mine: boolean };

export type TeamsJoiningIn = { teams: JoiningTeam[] };

export type JoiningWeeks = { today: DayKey; thisWeek: DayKey; lastWeek: DayKey };

export async function teamsJoiningInOf(ctx: QueryContext, viewer: BoardViewer, weeks: JoiningWeeks): Promise<TeamsJoiningIn | null> {
  throw notPorted("website.teamsJoiningIn.teamsJoiningInOf");
}
