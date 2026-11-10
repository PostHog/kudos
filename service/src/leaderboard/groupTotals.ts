// The module map's skeleton of convex/leaderboard/groupTotals.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { awardsAttributedEventValidator } from "../bus/events.ts";
import type { GroupId } from "../groups/groups.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Compared, PeriodKey } from "./periods.ts";
import { z } from "zod";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type MemberTotals = { member: MemberId; totals: Array<Doc<"attributedTotals">> };

export const countAwardsAttributedArgs = z.strictObject({ event: awardsAttributedEventValidator });
export async function countAwardsAttributed(ctx: MutationContext, args: z.infer<typeof countAwardsAttributedArgs>): Promise<void> {
  throw notPorted("leaderboard.groupTotals.countAwardsAttributed");
}
export const countAwardsAttributedJob = mutationJob("leaderboard.groupTotals.countAwardsAttributed", countAwardsAttributedArgs, countAwardsAttributed);

export function groupPeriodTotalOf(ctx: QueryContext, group: GroupId, period: PeriodKey): Promise<null | Doc<"attributedGroupTotals">> {
  throw notPorted("leaderboard.groupTotals.groupPeriodTotalOf");
}

export async function memberTotalsOf(ctx: QueryContext, member: MemberId, group: GroupId, { now, before }: Compared): Promise<MemberTotals> {
  throw notPorted("leaderboard.groupTotals.memberTotalsOf");
}

export async function groupMemberTotalsOf(ctx: QueryContext, group: GroupId, members: MemberId[], { now, before }: Compared): Promise<MemberTotals[]> {
  throw notPorted("leaderboard.groupTotals.groupMemberTotalsOf");
}
