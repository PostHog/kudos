// The welcome item, shown only beside hidden items. Today's convex/album/items/welcomeFlag.ts over the service's flag
// decisions.
import { memberDecisionWithoutWriting, type Flag } from "../../analytics/flags.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { hiddenItemsShownTo } from "./flag.ts";
import type { QueryContext } from "../../operations.ts";

export const welcomeItemFlag = { key: "welcome-item", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function welcomeItemShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await memberDecisionWithoutWriting(ctx, welcomeItemFlag, member)) && (await hiddenItemsShownTo(ctx, member));
}
