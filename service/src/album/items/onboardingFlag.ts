// Onboarding, shown only beside hidden items. Today's convex/album/items/onboardingFlag.ts over the service's flag
// decisions; S6's progression calls it with this signature.
import { memberDecisionWithoutWriting, type Flag } from "../../analytics/flags.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { hiddenItemsShownTo } from "./flag.ts";
import type { QueryContext } from "../../operations.ts";

export const onboardingFlag = { key: "onboarding", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function onboardingShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await memberDecisionWithoutWriting(ctx, onboardingFlag, member)) && (await hiddenItemsShownTo(ctx, member));
}
