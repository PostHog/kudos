// The module map's skeleton of convex/leaderboard/groupBoards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type GroupId } from "../groups/groups.ts";
import { type MemberId } from "../workspace/directory.ts";
import { type GroupsBoard } from "./groupsBoard.ts";
import { type MyGroupBoard } from "./myGroupBoard.ts";
import { periodValidator, type Compared, type Period } from "./periods.ts";
import { z } from "zod";
import type { Id } from "../db/columns.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type GroupBoards = { groups: GroupsBoard<GroupId> | null; myGroup: MyGroupBoard | null };

export const groupsBoardOfArgs = z.strictObject({ workspace: z.string(), viewer: z.string(), period: periodValidator });
export async function groupsBoardOf(ctx: QueryContext, args: z.infer<typeof groupsBoardOfArgs>): Promise<null | import("./groupsBoard.ts").GroupsBoard<Id<"userGroups">>> {
  throw notPorted("leaderboard.groupBoards.groupsBoardOf");
}

export async function groupBoardsOf(ctx: QueryContext, workspace: string, viewer: string, period: Period): Promise<GroupBoards> {
  throw notPorted("leaderboard.groupBoards.groupBoardsOf");
}

export async function workspaceGroupsBoardOf(ctx: QueryContext, workspace: string, compared: Compared): Promise<GroupsBoard<GroupId>> {
  throw notPorted("leaderboard.groupBoards.workspaceGroupsBoardOf");
}

export async function groupsBoardShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("leaderboard.groupBoards.groupsBoardShownTo");
}
