// The module map's skeleton of convex/progression/progression.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { kudosGivenEventValidator } from "../bus/events.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { catalogue } from "./catalogue.ts";
import type { Award, AwardWithId } from "../engine/awards.ts";
import { baseXpOf, type BonusLine, type MemberProgress, type Progressed, type Standing } from "./progress.ts";
import type { AppliedReward, RewardRecord } from "./rewards.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const recordEffectsArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });
export async function recordEffects(ctx: MutationContext, args: z.infer<typeof recordEffectsArgs>): Promise<void> {
  throw notPorted("progression.progression.recordEffects");
}
export const recordEffectsJob = mutationJob("progression.progression.recordEffects", recordEffectsArgs, recordEffects);

export type GiverLines = { bonus: BonusLine[]; coins: number };

export async function giverLinesOf(ctx: QueryContext, giver: MemberId, message: MessageRef): Promise<GiverLines> {
  throw notPorted("progression.progression.giverLinesOf");
}

export function giverXpOf(awards: Pick<Award, "kudos">[]): number {
  return awards.reduce((sum, award) => sum + baseXpOf("giver", award, catalogue), 0);
}

export async function recordReward(ctx: MutationContext, workspace: string, reward: RewardRecord): Promise<"recorded" | "already recorded"> {
  throw notPorted("progression.progression.recordReward");
}

export type Gain = Pick<RewardRecord, "member" | "xp" | "coins">;

export async function applyGain(ctx: MutationContext, workspace: string, gain: Gain, at: number): Promise<AppliedReward> {
  throw notPorted("progression.progression.applyGain");
}

export async function unrecordedAwardsOf<A extends AwardWithId>(ctx: QueryContext, member: MemberId, awards: A[]): Promise<A[]> {
  throw notPorted("progression.progression.unrecordedAwardsOf");
}

export async function record(ctx: MutationContext, { state, effects }: Pick<Progressed, "state" | "effects">): Promise<void> {
  throw notPorted("progression.progression.record");
}

export async function standingOf(ctx: QueryContext, member: MemberId): Promise<Standing> {
  throw notPorted("progression.progression.standingOf");
}

export type ProgressionHome = Standing & { xpToNextLevel: number };

export async function progressionHomeOf(ctx: QueryContext, member: MemberId): Promise<ProgressionHome> {
  throw notPorted("progression.progression.progressionHomeOf");
}

export async function spendSkillPoints(ctx: MutationContext, member: MemberId, points: number): Promise<void> {
  throw notPorted("progression.progression.spendSkillPoints");
}

export async function progressOf(ctx: QueryContext, member: MemberId): Promise<MemberProgress> {
  throw notPorted("progression.progression.progressOf");
}
