// The sticker book's flags, as today's convex/stickers/flag.ts: the book by `sticker-book`, and Team Spirit by
// `team-spirit` where the book and its team pages show.
import { exposed, memberDecision, type Flag } from "../analytics/flags.ts";
import { teamPagesShownTo } from "../companyProfiles/flag.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";

export const stickerBookFlag = { key: "sticker-book", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const teamSpiritFlag = { key: "team-spirit", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function stickersShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecision(ctx, stickerBookFlag, member);
}

export async function teamSpiritShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await memberDecision(ctx, teamSpiritFlag, member)) && (await teamPagesInTheBookShownTo(ctx, member));
}

export async function teamSpiritAppliesTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const applies = await memberDecision(ctx, teamSpiritFlag, member);
  await exposed(ctx, teamSpiritFlag, member, applies);
  return applies && (await teamPagesInTheBookShownTo(ctx, member));
}

async function teamPagesInTheBookShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await stickersShownTo(ctx, member)) && (await teamPagesShownTo(ctx, member));
}
