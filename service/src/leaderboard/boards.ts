// The module map's skeleton of convex/leaderboard/boards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ViewedBoard } from "../analytics/projections.ts";
import type { CompanyFace } from "../companyProfiles/faces.ts";
import { type TeamCrestArt } from "../companyProfiles/teams.ts";
import { type DayKey } from "../engine/allowance.ts";
import { type RecognitionCounts } from "./counts.ts";
import { type Period } from "./periods.ts";
import { type MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Measure = keyof RecognitionCounts;

export type BoardViewer = { workspace: string; member: MemberId };

export type BoardReader = { workspace: string; member: MemberId | null };

export type BoardsAsked = { period: Period; team: string | null };

export type Standing = { rank: number; tied: boolean };

export type BoardPerson = { member: MemberId; name: string | undefined; picture: string | null; face: CompanyFace | null; teams: string[]; counts: RecognitionCounts; firstDay: DayKey | null; viewer: boolean };

export type BoardTeam = { team: string; name: string; art: TeamCrestArt; counts: RecognitionCounts; mine: boolean };

export type Boards = { people: Record<Measure, Array<BoardPerson & Standing>>; teams: Record<Measure, Array<BoardTeam & Standing>>; me: BoardPerson | null; onTheBoards: boolean };

export type BoardPlace = { rank: number; tied: boolean; kudosGiven: number };

export async function boardsShownTo(ctx: QueryContext, member: MemberId): Promise<ViewedBoard[]> {
  throw notPorted("leaderboard.boards.boardsShownTo");
}

export async function boardsOf(ctx: QueryContext, reader: BoardReader, { period, team }: BoardsAsked): Promise<Boards> {
  throw notPorted("leaderboard.boards.boardsOf");
}

export async function peopleIn(ctx: QueryContext, reader: BoardReader, period: Period, day: DayKey): Promise<BoardPerson[]> {
  throw notPorted("leaderboard.boards.peopleIn");
}

export async function boardPeopleOf(ctx: QueryContext, reader: BoardReader, members: MemberId[]): Promise<BoardPerson[]> {
  throw notPorted("leaderboard.boards.boardPeopleOf");
}

export async function placeOf(ctx: QueryContext, member: BoardViewer, period: Period): Promise<BoardPlace | null> {
  throw notPorted("leaderboard.boards.placeOf");
}
