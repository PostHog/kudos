// The hugs flags: hugs themselves, and their rewards. Today's convex/hugs/flag.ts.
import { exposed, memberDecision, memberDecisionWithoutWriting, type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const hugsFlag = { key: "hugs", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function hugsOnAndExposedFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const on = await memberDecision(ctx, hugsFlag, member);
  await exposed(ctx, hugsFlag, member, on);
  return on;
}

export const hugRewardsFlag = { key: "hug-rewards", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function hugRewardsOnAndExposedFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const on = await memberDecision(ctx, hugRewardsFlag, member);
  await exposed(ctx, hugRewardsFlag, member, on);
  return on;
}

export function hugRewardsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, hugRewardsFlag, member);
}

export function hugsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecision(ctx, hugsFlag, member);
}
