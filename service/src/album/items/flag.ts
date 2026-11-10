// The module map's skeleton of convex/album/items/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../../analytics/flags.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export const hiddenItemsFlag = { key: "hidden-items", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function hiddenItemsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.items.flag.hiddenItemsShownTo");
}

export const teasersFlag = { key: "teasers", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function teasersShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.items.flag.teasersShownTo");
}

export const itemShareFlag = { key: "item-share", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function itemShareAppliesToWorkspace(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("album.items.flag.itemShareAppliesToWorkspace");
}
