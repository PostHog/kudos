// The module map's skeleton of convex/album/boards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { CompanyFace } from "../companyProfiles/faces.ts";
import { type TeamCrestArt } from "../companyProfiles/teams.ts";
import { type DayKey } from "../engine/allowance.ts";
import { type MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const boardPeriodValidator = z.union([z.literal("week"), z.literal("last-week"), z.literal("month"), z.literal("all")]);

export type BoardPeriod = z.infer<typeof boardPeriodValidator>;

export type Standing = { rank: number; tied: boolean } | { rank: null; tied: false };

export type BoardPerson = { member: MemberId; name: string | undefined; picture: string | null; face: CompanyFace | null; teams: string[]; thoughtful: number; viewer: boolean };

export type BoardTeam = { team: string; name: string; art: TeamCrestArt; thoughtful: number; mine: boolean };

export type ThoughtfulBoards = {
  people: Array<BoardPerson & Standing>;
  teams: Array<BoardTeam & Standing>;
  pinned: { me: (BoardPerson & Standing) | null; teams: Array<BoardTeam & Standing> };
  onTheBoards: boolean;
};

export type BoardViewer = { workspace: string; member: MemberId };

export type BoardPlace = { rank: number; tied: boolean; thoughtful: number };

export type AllTimeBoards = Pick<ThoughtfulBoards, "people" | "teams">;

export type BoardsAsked = { whoGave: string | null; period: BoardPeriod };

export type ThoughtfulAward = { workspace: string; giver: MemberId; day: DayKey };

export async function countOnTheBoards(ctx: MutationContext, { workspace, giver, day }: ThoughtfulAward): Promise<void> {
  throw notPorted("album.boards.countOnTheBoards");
}

export async function hasGivenAThoughtfulAward(ctx: QueryContext, workspace: string, giver: MemberId): Promise<boolean> {
  throw notPorted("album.boards.hasGivenAThoughtfulAward");
}

export async function thoughtfulBoardsOf(ctx: QueryContext, viewer: BoardViewer, { whoGave, period }: BoardsAsked): Promise<ThoughtfulBoards> {
  throw notPorted("album.boards.thoughtfulBoardsOf");
}

export async function weekPlaceOf(ctx: QueryContext, member: BoardViewer): Promise<BoardPlace | null> {
  throw notPorted("album.boards.weekPlaceOf");
}

export async function allTimeBoardsIn(ctx: QueryContext, workspace: string): Promise<AllTimeBoards> {
  throw notPorted("album.boards.allTimeBoardsIn");
}
