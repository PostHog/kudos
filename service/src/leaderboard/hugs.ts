// The module map's skeleton of convex/leaderboard/hugs.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { hugGivenEventValidator, hugReceivedEventValidator, type HugGivenEvent, type HugReceivedEvent } from "../bus/events.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

type GivenHug = Pick<HugGivenEvent, "workspace" | "giver" | "message" | "day">;

type ReceivedHug = Pick<HugReceivedEvent, "workspace" | "giver" | "person" | "message" | "at">;

export const countHugGivenArgs = z.strictObject({ event: hugGivenEventValidator });
export async function countHugGiven(ctx: MutationContext, args: z.infer<typeof countHugGivenArgs>): Promise<void> {
  throw notPorted("leaderboard.hugs.countHugGiven");
}
export const countHugGivenJob = mutationJob("leaderboard.hugs.countHugGiven", countHugGivenArgs, countHugGiven);

export const countHugReceivedArgs = z.strictObject({ event: hugReceivedEventValidator });
export async function countHugReceived(ctx: MutationContext, args: z.infer<typeof countHugReceivedArgs>): Promise<void> {
  throw notPorted("leaderboard.hugs.countHugReceived");
}
export const countHugReceivedJob = mutationJob("leaderboard.hugs.countHugReceived", countHugReceivedArgs, countHugReceived);

export async function countGivenHug(ctx: MutationContext, { workspace, giver, message, day }: GivenHug): Promise<boolean> {
  throw notPorted("leaderboard.hugs.countGivenHug");
}

export async function countReceivedHug(ctx: MutationContext, { workspace, giver, person, message, at }: ReceivedHug): Promise<boolean> {
  throw notPorted("leaderboard.hugs.countReceivedHug");
}
