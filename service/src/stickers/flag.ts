// The module map's skeleton of convex/stickers/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const stickerBookFlag = { key: "sticker-book", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const teamSpiritFlag = { key: "team-spirit", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function stickersShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("stickers.flag.stickersShownTo");
}

export async function teamSpiritShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("stickers.flag.teamSpiritShownTo");
}

export async function teamSpiritAppliesTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("stickers.flag.teamSpiritAppliesTo");
}
