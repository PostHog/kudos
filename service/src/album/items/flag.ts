// The item flags: hidden items (the board of face-down items), the teasers, and the share of a turned item.
// Today's convex/album/items/flag.ts over the service's flag decisions.
import { memberDecisionWithoutWriting, workspaceDecisionWithoutWriting, type Flag } from "../../analytics/flags.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { QueryContext } from "../../operations.ts";

export const hiddenItemsFlag = { key: "hidden-items", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function hiddenItemsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, hiddenItemsFlag, member);
}

export const teasersFlag = { key: "teasers", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function teasersShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, teasersFlag, member);
}

export const itemShareFlag = { key: "item-share", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function itemShareAppliesToWorkspace(ctx: QueryContext, workspace: string): Promise<boolean> {
  return workspaceDecisionWithoutWriting(ctx, itemShareFlag, workspace);
}
