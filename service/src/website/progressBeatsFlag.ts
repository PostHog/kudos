// The progress-beats flag, as today's convex/website/progressBeatsFlag.ts.
import { memberDecisionWithoutWriting, type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export const progressBeatsFlag = { key: "progress-beats", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function progressBeatsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, progressBeatsFlag, member);
}
