// The module map's skeleton of convex/album/levelUp.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Drop } from "./hoggies/drops.ts";
import type { MemberId } from "../workspace/directory.ts";
import { type EarnedEmoji } from "./earnedEmojis.ts";
import type { PageOwner } from "./teamPages.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type LevelUpAnswer = { kind: "levelUp"; level: number; at: number; hoggies: Drop[]; emojis: EarnedEmoji[] };

export async function levelUpRevealShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.levelUp.levelUpRevealShownTo");
}

export async function levelUpRevealOf(ctx: QueryContext, owner: PageOwner, level: number): Promise<LevelUpAnswer | null> {
  throw notPorted("album.levelUp.levelUpRevealOf");
}

export async function levelUpRevealedTo(ctx: QueryContext, member: MemberId, level: number): Promise<boolean> {
  throw notPorted("album.levelUp.levelUpRevealedTo");
}

export async function levelUpFollowerAwaitedUntil(ctx: QueryContext, member: MemberId, level: number): Promise<number | null> {
  throw notPorted("album.levelUp.levelUpFollowerAwaitedUntil");
}
