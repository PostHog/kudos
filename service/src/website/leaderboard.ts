// The module map's skeleton of convex/website/leaderboard.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { LoopLesson } from "../album/items/welcome.ts";
import type { Improvement } from "../leaderboard/improvement.ts";
import type { Peer } from "../leaderboard/peer.ts";
import type { Period } from "../leaderboard/periods.ts";
import type { RankedRow, Standing } from "../leaderboard/totals.ts";
import { teammateOf, type Face } from "./faces.ts";
import type { BoardsNextStep } from "./leaderboardNextStep.ts";
import type { Denial } from "./memberQuery.ts";
import type { PeopleBoards } from "./peopleBoards.ts";
import type { TeamsJoiningIn } from "./teamsJoiningIn.ts";
import type { PageWaits } from "./unlockPath.ts";
import type { WithinReach } from "./withinReach.ts";
import { z } from "zod";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type LeaderboardRow = { position: number; rank: number; tied: boolean; name: string; face: Face; kudos: number; you: boolean; climbed: number | null };

export type Leaderboard = {
  kind: "board";
  period: Period;
  chatUrl: string;
  rows: LeaderboardRow[];
  window: number[];
  standing: Standing;
  improvement: Improvement | null;
  peer: Peer | null;
  onTheBoards: boolean;
};

export type LeaderboardAnswer = { kind: "not-found" } | PageWaits | Leaderboard;

export type MyLeaderboard = Denial | LeaderboardAnswer;

export type Tallies = { hugsGiven: number; hugsReceived: number; kudosReceived: number; hoggiesFound: number };

export type Highlight =
  | { kind: "best-week"; hugsGiven: number; more: number; hoggiesFound: number }
  | { kind: "more-hugs"; hugsGiven: number; more: number }
  | { kind: "thanked"; teammates: number; reach: number }
  | { kind: "last-week"; hugs: number; best: boolean; reach: number }
  | { kind: "reach"; teammates: number };

export type YouThisWeek = { tallies: Tallies; lastWeek: Tallies; highlight: Highlight };

export type { HugMeasure, PersonRow } from "./peopleBoards.ts";

export type { JoiningTeam, TeamsJoiningIn } from "./teamsJoiningIn.ts";

export type { BoardsNextStep } from "./leaderboardNextStep.ts";

export type { WithinReach } from "./withinReach.ts";

export type HugBoards = { kind: "boards"; you: YouThisWeek; kudosEmoji: LoopLesson; joiningIn: TeamsJoiningIn | null; next: BoardsNextStep; withinReach: WithinReach; slack: string } & PeopleBoards;

export type HugBoardsAnswer = { kind: "off" } | HugBoards;

export type HugBoardsRead = Denial | HugBoardsAnswer;

export const teamsJoiningInForArgs = z.strictObject({ workspace: z.string(), user: z.string() });
export async function teamsJoiningInFor(ctx: QueryContext, args: z.infer<typeof teamsJoiningInForArgs>): Promise<null | import("./teamsJoiningIn.ts").TeamsJoiningIn> {
  throw notPorted("website.leaderboard.teamsJoiningInFor");
}

export function leaderboardRowOf({ position, rank, tied, name, picture, kudos, viewer, climbed }: RankedRow, myFace: Face): LeaderboardRow {
  const teammate = teammateOf(name, picture);
  return { position, rank, tied, name: teammate.name, face: viewer ? myFace : teammate.face, kudos, you: viewer, climbed };
}
