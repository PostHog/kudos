// The activity flag, as today's convex/activity/activityFlag.ts.
import { memberDecision, type Flag } from "../analytics/flags.ts";
import type { QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";

export const activityFlag = { key: "activity", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function activityShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecision(ctx, activityFlag, member);
}
