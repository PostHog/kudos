// The module map's skeleton of convex/leaderboard/myGroupBoard.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type GroupRef } from "../groups/groups.ts";
import { type MemberId } from "../workspace/directory.ts";
import type { BoardView } from "./board.ts";
import { type MemberTotals } from "./groupTotals.ts";
import { periodValidator, type Compared } from "./periods.ts";
import { type Ranked } from "./rankedBoard.ts";
import { z } from "zod";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type MyGroupBoard = Ranked & { group: GroupRef };

export type MyGroupBoardView = { group: GroupRef; board: BoardView };

export type Viewer = { user: string; member: MemberId };

export type GroupKudos = { group: GroupRef; members: MemberTotals[] };

export const myGroupBoardViewOfArgs = z.strictObject({ workspace: z.string(), viewer: z.string(), period: periodValidator });
export async function myGroupBoardViewOf(ctx: QueryContext, args: z.infer<typeof myGroupBoardViewOfArgs>): Promise<null | MyGroupBoardView> {
  throw notPorted("leaderboard.myGroupBoard.myGroupBoardViewOf");
}

export async function myGroupBoardOf(ctx: QueryContext, viewer: Viewer, kudos: GroupKudos, compared: Compared): Promise<MyGroupBoard> {
  throw notPorted("leaderboard.myGroupBoard.myGroupBoardOf");
}

export async function myGroupBoardShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("leaderboard.myGroupBoard.myGroupBoardShownTo");
}
