// The XP moments flag, as today's convex/website/xpMomentsFlag.ts: moments show only where the album shows.
import { memberDecisionWithoutWriting, type Flag } from "../analytics/flags.ts";
import { albumShownTo } from "../album/flag.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export const xpMomentsFlag = { key: "xp-moments", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function xpMomentsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await albumShownTo(ctx, member)) && (await memberDecisionWithoutWriting(ctx, xpMomentsFlag, member));
}
