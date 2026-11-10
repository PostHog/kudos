// The module map's skeleton of convex/progression/effects.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type DayKey } from "../engine/allowance.ts";
import { type AwardId } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { GateDecision } from "./gate.ts";
import { type BonusLine, type EffectsRecord, type Side, type EarlierAward } from "./progress.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const progressionWaitedFor = 10 * 60_000;

export async function insertEffects(ctx: MutationContext, effects: EffectsRecord[]): Promise<void> {
  throw notPorted("progression.effects.insertEffects");
}

export async function isRecorded(ctx: QueryContext, award: AwardId, side: Side): Promise<boolean> {
  throw notPorted("progression.effects.isRecorded");
}

export async function xpRecordedFor(ctx: QueryContext, award: AwardId, side: Side): Promise<number | null> {
  throw notPorted("progression.effects.xpRecordedFor");
}

export async function gateRecordedWith(ctx: QueryContext, award: AwardId): Promise<GateDecision | null> {
  throw notPorted("progression.effects.gateRecordedWith");
}

export async function bonusRecordedWith(ctx: QueryContext, awards: AwardId[]): Promise<BonusLine[]> {
  throw notPorted("progression.effects.bonusRecordedWith");
}

export function awardsBefore(ctx: QueryContext, giver: MemberId, day: DayKey, award: AwardId): Promise<EarlierAward[]> {
  throw notPorted("progression.effects.awardsBefore");
}

export async function gaveThoughtfulKudos(ctx: QueryContext, giver: MemberId, atOrBefore: number): Promise<boolean> {
  throw notPorted("progression.effects.gaveThoughtfulKudos");
}
