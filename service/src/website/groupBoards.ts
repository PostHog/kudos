// The module map's skeleton of convex/website/groupBoards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { GroupId, GroupRef } from "../groups/groups.ts";
import type { GroupsBoard } from "../leaderboard/groupsBoard.ts";
import type { Standing } from "../leaderboard/totals.ts";
import type { LeaderboardRow } from "./leaderboard.ts";
import type { Denial } from "./memberQuery.ts";

export type GroupsBoardShown = GroupsBoard<GroupId>;

export type MyGroupBoardShown = { group: GroupRef; rows: LeaderboardRow[]; window: number[]; standing: Standing };

export type GroupBoards = { kind: "boards"; groups: GroupsBoardShown | null; myGroup: MyGroupBoardShown | null };

export type MyGroupBoards = Denial | GroupBoards;
