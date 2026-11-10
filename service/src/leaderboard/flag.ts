// The module map's skeleton of convex/leaderboard/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { GivenMeasure } from "./totals.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const everyoneBoardFlag = { key: "everyone-board", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const leaderboardHugsFlag = { key: "leaderboard-hugs", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function leaderboardHugsShownTo(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("leaderboard.flag.leaderboardHugsShownTo");
}

export async function leaderboardHugsApplyTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("leaderboard.flag.leaderboardHugsApplyTo");
}

export async function everyoneMeasureFor(ctx: MutationContext, member: MemberId): Promise<GivenMeasure> {
  throw notPorted("leaderboard.flag.everyoneMeasureFor");
}

export function everyoneBoardShownIn(ctx: QueryContext | MutationContext, workspace: string): Promise<boolean> {
  throw notPorted("leaderboard.flag.everyoneBoardShownIn");
}

export function everyoneBoardOnFor(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("leaderboard.flag.everyoneBoardOnFor");
}

export async function isEveryoneBoardShownTo(ctx: MutationContext, workspace: string, member: MemberId | undefined): Promise<boolean> {
  throw notPorted("leaderboard.flag.isEveryoneBoardShownTo");
}

const viewerArgs = { workspace: z.string(), user: z.string() };

export const isEveryoneBoardShownArgs = z.strictObject(viewerArgs);
export async function isEveryoneBoardShown(ctx: MutationContext, args: z.infer<typeof isEveryoneBoardShownArgs>): Promise<{ shown: boolean; viewerKnown: boolean }> {
  throw notPorted("leaderboard.flag.isEveryoneBoardShown");
}

export const exposeEveryoneBoardArgs = z.strictObject({ ...viewerArgs, shown: z.boolean() });
export async function exposeEveryoneBoard(ctx: MutationContext, args: z.infer<typeof exposeEveryoneBoardArgs>): Promise<void> {
  throw notPorted("leaderboard.flag.exposeEveryoneBoard");
}
export const exposeEveryoneBoardJob = mutationJob("leaderboard.flag.exposeEveryoneBoard", exposeEveryoneBoardArgs, exposeEveryoneBoard);

export const everyoneMeasureArgs = z.strictObject(viewerArgs);
export async function everyoneMeasure(ctx: MutationContext, args: z.infer<typeof everyoneMeasureArgs>): Promise<"kudosGiven" | "hugsGiven"> {
  throw notPorted("leaderboard.flag.everyoneMeasure");
}
