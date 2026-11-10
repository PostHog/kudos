// Achievement hoggies: the items a team or a milestone earns, shown only beside hidden items.
// Today's convex/album/items/achievementFlag.ts over the service's flag decisions.
import { memberDecisionWithoutWriting, type Flag } from "../../analytics/flags.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { hiddenItemsShownTo } from "./flag.ts";
import type { ItemReason } from "./records.ts";
import type { QueryContext } from "../../operations.ts";

export const achievementHoggiesFlag = { key: "achievement-hoggies", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function achievementHoggiesShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await memberDecisionWithoutWriting(ctx, achievementHoggiesFlag, member)) && (await hiddenItemsShownTo(ctx, member));
}

export function isAnAchievement(reason: ItemReason): boolean {
  return reason.kind === "team" || reason.kind === "milestone";
}
