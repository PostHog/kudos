// The module map's skeleton of convex/leaderboard/totals.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { kudosGivenEventValidator, type KudosGivenEvent } from "../bus/events.ts";
import type { AwardWithId, GivenMessage } from "../engine/awards.ts";
import type { BoardView } from "./board.ts";
import type { Improvement } from "./improvement.ts";
import type { Peer } from "./peer.ts";
import { periodValidator, type Period, type PeriodKey } from "./periods.ts";
import type { Ranked } from "./rankedBoard.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type { RankedRow, Standing } from "./rankedBoard.ts";

export type GivenMeasure = "kudosGiven" | "hugsGiven";

export const givenMeasureValidator = z.union([z.literal("kudosGiven"), z.literal("hugsGiven")]);

export type EveryoneBoardView = BoardView & { measure: GivenMeasure; improvement: Improvement | null; peer: Peer | null };

export type RankedBoard = Ranked & { improvement: Improvement | null; peer: Peer | null };

type Total = Doc<"givenTotals">;

export const countKudosGivenArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });
export async function countKudosGiven(ctx: MutationContext, args: z.infer<typeof countKudosGivenArgs>): Promise<void> {
  throw notPorted("leaderboard.totals.countKudosGiven");
}
export const countKudosGivenJob = mutationJob("leaderboard.totals.countKudosGiven", countKudosGivenArgs, countKudosGiven);

export async function countGiven(ctx: MutationContext, given: GivenMessage): Promise<boolean> {
  throw notPorted("leaderboard.totals.countGiven");
}

export async function countReceived(ctx: MutationContext, { workspace, giver, at }: Pick<KudosGivenEvent, "workspace" | "giver" | "at">, { award, recipient, kudos }: AwardWithId): Promise<boolean> {
  throw notPorted("leaderboard.totals.countReceived");
}

export const everyoneBoardArgs = z.strictObject({ workspace: z.string(), viewer: z.string(), period: z.optional(periodValidator), measure: z.optional(givenMeasureValidator) });
export async function everyoneBoard(ctx: QueryContext, args: z.infer<typeof everyoneBoardArgs>): Promise<import("./board.ts").BoardView & { measure: "kudosGiven" | "hugsGiven"; improvement: null | { gain: number; places?: number } | { best: number }; peer: null | import("./peer.ts").Peer }> {
  throw notPorted("leaderboard.totals.everyoneBoard");
}

export async function everyoneBoardOf(ctx: QueryContext, workspace: string, viewer: string, period: Period, measure: GivenMeasure): Promise<EveryoneBoardView> {
  throw notPorted("leaderboard.totals.everyoneBoardOf");
}

export async function rankedBoardOf(ctx: QueryContext, workspace: string, viewer: string, period: Period): Promise<RankedBoard> {
  throw notPorted("leaderboard.totals.rankedBoardOf");
}

export async function fillRunningTotal(ctx: MutationContext, total: Total): Promise<boolean> {
  throw notPorted("leaderboard.totals.fillRunningTotal");
}

export async function giversIn(ctx: QueryContext, workspace: string, period: PeriodKey): Promise<number> {
  throw notPorted("leaderboard.totals.giversIn");
}
