// The module map's skeleton of convex/progression/hugXp.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DayKey } from "../engine/allowance.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type HugWeekXp = { given: number; givenXp: number; received: number; receivedXp: number };

export async function hugXpOf(ctx: QueryContext, member: MemberId, week: DayKey): Promise<HugWeekXp> {
  throw notPorted("progression.hugXp.hugXpOf");
}
