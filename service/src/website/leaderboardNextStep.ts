// The module map's skeleton of convex/website/leaderboardNextStep.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Nudge } from "../album/hypeReactions.ts";
import type { Week } from "../engine/allowance.ts";
import { type AlbumPersonFace } from "./albumPages.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type BoardsNextStep =
  | { kind: "lively"; teammate: AlbumPersonFace; collectsHype: boolean; epicHoggiesByKudos: boolean }
  | { kind: "quiet"; giver: AlbumPersonFace; permalink: string; at: number }
  | { kind: "empty"; firstHugPaysExtra: boolean };

export async function boardsNextStepOf(ctx: QueryContext, me: VerifiedMember, week: Week, nudge: Nudge | null): Promise<BoardsNextStep> {
  throw notPorted("website.leaderboardNextStep.boardsNextStepOf");
}
