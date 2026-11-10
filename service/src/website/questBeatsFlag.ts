// The quest-beats flag, as today's convex/website/questBeatsFlag.ts.
import { memberDecisionWithoutWriting, type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export const questBeatsFlag = { key: "quest-beats", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function questBeatsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, questBeatsFlag, member);
}
