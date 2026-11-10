// The album's level-up reveal: whether a member sees it, what one level's reveal shows, and how long the website waits
// for the hoggies a level-up drops. Today's convex/album/levelUp.ts over the service's transaction.
import type { Drop } from "./hoggies/drops.ts";
import { hiddenItemsShownTo } from "./items/flag.ts";
import { levelUpEarned, levelUpHoggiesOf, levelUpRevealOnFor } from "./levelUpHoggies.ts";
import { levelUpAt, levelUpBefore, levelUpRecordedAt } from "../unlocks/levelUps.ts";
import type { MemberId } from "../workspace/directory.ts";
import { levelEmojisEarnedIn, type EarnedEmoji } from "./earnedEmojis.ts";
import { albumShownTo } from "./flag.ts";
import type { PageOwner } from "./teamPages.ts";
import type { QueryContext } from "../operations.ts";

export type LevelUpAnswer = { kind: "levelUp"; level: number; at: number; hoggies: Drop[]; emojis: EarnedEmoji[] };

export async function levelUpRevealShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await albumShownTo(ctx, member)) && (await levelUpRevealOnFor(ctx, member)) && !(await hiddenItemsShownTo(ctx, member));
}

export async function levelUpRevealOf(ctx: QueryContext, owner: PageOwner, level: number): Promise<LevelUpAnswer | null> {
  const at = await levelUpAt(ctx, owner.member, level);
  if (at === null) return null;
  const hoggies = await levelUpHoggiesOf(ctx, owner.member, level);
  if (hoggies.length === 0) return null;
  const above = await levelUpBefore(ctx, owner.member, level);
  return { kind: "levelUp", level, at, hoggies, emojis: await levelEmojisEarnedIn(ctx, owner, { above, upTo: level, at }) };
}

export async function levelUpRevealedTo(ctx: QueryContext, member: MemberId, level: number): Promise<boolean> {
  return (await levelUpRevealShownTo(ctx, member)) && (await levelUpHoggiesOf(ctx, member, level)).length > 0;
}

const followerAwaitedMs = 5000;

export async function levelUpFollowerAwaitedUntil(ctx: QueryContext, member: MemberId, level: number): Promise<number | null> {
  const recordedAt = await levelUpRecordedAt(ctx, member, level);
  if (recordedAt === null || (await levelUpEarned(ctx, member, level))) return null;
  return recordedAt + followerAwaitedMs;
}
