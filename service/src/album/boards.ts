// The module map's skeleton of convex/album/boards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
// S9 ported the boards' counting (countOnTheBoards, hasGivenAThoughtfulAward); the boards' reads are still stubs.
import type { CompanyFace } from "../companyProfiles/faces.ts";
import { type TeamCrestArt } from "../companyProfiles/teams.ts";
import { type DayKey } from "../engine/allowance.ts";
import { type MemberId } from "../workspace/directory.ts";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { indexOrder } from "../db/indexOrder.ts";
import { thoughtfulBoardTallies, type Doc } from "../db/schema/index.ts";
import { allTimeKey, keyOf, periods, type Period, type PeriodKey } from "../leaderboard/periods.ts";
import { insertInto, uniqueIn } from "./rows.ts";
import { countThoughtfulGiver } from "./thoughtfulGivers.ts";
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
  for (const period of periods) {
    const key = keyOf(period, day);
    const tally = await tallyOf(ctx, workspace, key, giver);
    if (tally === null) await firstTallyOf(ctx, { workspace, period, key, giver });
    else await ctx.tx.update(thoughtfulBoardTallies).set({ awards: tally.awards + 1 }).where(eq(thoughtfulBoardTallies._id, tally._id));
  }
}

async function firstTallyOf(ctx: MutationContext, { workspace, period, key, giver }: { workspace: string; period: Period; key: PeriodKey; giver: MemberId }) {
  await insertInto(ctx, thoughtfulBoardTallies, { workspace, period: key, giver, awards: 1 });
  if (period === "week") await countThoughtfulGiver(ctx, workspace, key);
}

export async function hasGivenAThoughtfulAward(ctx: QueryContext, workspace: string, giver: MemberId): Promise<boolean> {
  return (await tallyOf(ctx, workspace, allTimeKey, giver)) !== null;
}

const byWorkspacePeriodGiver = indexOrder(thoughtfulBoardTallies, ["workspace", "period", "giver"]);

function tallyOf(ctx: QueryContext, workspace: string, period: PeriodKey, giver: MemberId) {
  const where = and(eq(thoughtfulBoardTallies.workspace, workspace), eq(thoughtfulBoardTallies.period, period), eq(thoughtfulBoardTallies.giver, giver));
  return uniqueIn<Doc<"thoughtfulBoardTallies">>(ctx, thoughtfulBoardTallies, byWorkspacePeriodGiver, where);
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
