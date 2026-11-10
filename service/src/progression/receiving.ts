// The module map's skeleton of convex/progression/receiving.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { KudosGivenEvent } from "../bus/events.ts";
import type { DayKey } from "../engine/allowance.ts";
import type { MemberId } from "../workspace/directory.ts";
import { noReceiving, type EffectsRecord, type Receiving } from "./progress.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type ReceivingWeek = Receiving & { recipient: MemberId; week: DayKey };

export async function receivingWeekOf(ctx: QueryContext, { giver, at }: KudosGivenEvent, member: MemberId): Promise<ReceivingWeek | null> {
  throw notPorted("progression.receiving.receivingWeekOf");
}

export function receivingOf(week: ReceivingWeek | null): Receiving {
  return week === null ? noReceiving : { paidBy: week.paidBy };
}

export async function recordReceiving(ctx: MutationContext, week: ReceivingWeek | null, giver: MemberId, effects: EffectsRecord[]): Promise<void> {
  throw notPorted("progression.receiving.recordReceiving");
}
