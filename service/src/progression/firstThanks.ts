// The module map's skeleton of convex/progression/firstThanks.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { KudosGivenEvent } from "../bus/events.ts";
import type { AwardWithId } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { RewardRecord } from "./rewards.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type FirstThanksTopUp = { xp: number; decided: number };

export async function firstThanksTopUpFor(ctx: QueryContext, { giver, message, at }: KudosGivenEvent, recorded: AwardWithId[], xpAfter: number): Promise<RewardRecord | null> {
  throw notPorted("progression.firstThanks.firstThanksTopUpFor");
}

export async function firstThanksTopUpPaidTo(ctx: QueryContext, member: MemberId): Promise<FirstThanksTopUp | null> {
  throw notPorted("progression.firstThanks.firstThanksTopUpPaidTo");
}

export async function firstThanksAwaitsItsMoment(ctx: QueryContext, member: MemberId, now: number): Promise<boolean> {
  throw notPorted("progression.firstThanks.firstThanksAwaitsItsMoment");
}
