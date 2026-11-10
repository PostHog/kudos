// The module map's skeleton of convex/hugs/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const hugsFlag = { key: "hugs", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function hugsOnAndExposedFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("hugs.flag.hugsOnAndExposedFor");
}

export const hugRewardsFlag = { key: "hug-rewards", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function hugRewardsOnAndExposedFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("hugs.flag.hugRewardsOnAndExposedFor");
}

export function hugRewardsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("hugs.flag.hugRewardsShownTo");
}

export function hugsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("hugs.flag.hugsShownTo");
}
