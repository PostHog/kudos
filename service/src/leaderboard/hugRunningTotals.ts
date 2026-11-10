// The module map's skeleton of convex/leaderboard/hugRunningTotals.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DayKey } from "../engine/allowance.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { ComparedPeriod, PeriodKey } from "./periods.ts";
import type { RunningTotal } from "./runningTotal.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type HugsCounted = { workspace: string; member: MemberId; day: DayKey; hugsBefore: number; hugs: number };

export type PeriodOfMember = { workspace: string; member: MemberId; period: PeriodKey };

export async function addHugsToRunningTotal(ctx: MutationContext, period: ComparedPeriod, { workspace, member, day, hugsBefore, hugs }: HugsCounted): Promise<void> {
  throw notPorted("leaderboard.hugRunningTotals.addHugsToRunningTotal");
}

export async function hugRunningTotalsIn(ctx: QueryContext, workspace: string, period: PeriodKey): Promise<Map<MemberId, RunningTotal>> {
  throw notPorted("leaderboard.hugRunningTotals.hugRunningTotalsIn");
}

export async function hugRunningTotalOf(ctx: QueryContext, member: MemberId, period: PeriodKey): Promise<RunningTotal | null> {
  throw notPorted("leaderboard.hugRunningTotals.hugRunningTotalOf");
}

export async function recordHugRunningTotal(ctx: MutationContext, { workspace, member, period }: PeriodOfMember, runningTotal: RunningTotal): Promise<void> {
  throw notPorted("leaderboard.hugRunningTotals.recordHugRunningTotal");
}
