// The module map's skeleton of convex/album/earnedEmojis.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type TeamCrestArt } from "../companyProfiles/teams.ts";
import { type MemberId } from "../workspace/directory.ts";
import { emojiArtPictureOf, teamEmblemPicture } from "./emojiCatalogue.ts";
import { type EarnedEmojiId } from "./emojiNames.ts";
import type { MilestoneAnswer, ReachedTier } from "./milestones.ts";
import { type Instants } from "./packs.ts";
import type { TeamSticker } from "./records.ts";
import { type RandomEmojiId } from "./randomEmojis.ts";
import type { PageOwner, TeamPage } from "./teamPages.ts";
import { type HypesHeld } from "./items/hypes.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type EarnedEmojiKind = "team" | "milestone" | "level" | "hype" | "random";

export type EmojiProgress = { have: number; need: number };

export type EarnedEmoji = { id: EarnedEmojiId | RandomEmojiId; kind: EarnedEmojiKind; name: string; from: string; picture: string; earned: boolean; earnedAt: number | null; seen: boolean; inSlack: boolean; progress: EmojiProgress | null; byReactions?: true };

export type SharedEmoji = Pick<EarnedEmoji, "id" | "kind" | "name" | "from" | "picture" | "inSlack">;

export type EmojiCauses = { pages: TeamPage[]; milestones: MilestoneAnswer[]; level: { level: number; xp: number }; hypesHeld?: HypesHeld; picked?: string[] };

export type EarnedEmojis = { emojis: EarnedEmoji[]; more: boolean };

export type ShownEmoji = Pick<EarnedEmoji, "name" | "picture" | "inSlack">;

export type HypeEmoji = ShownEmoji;

export const mostHypeEmojisShown = 200;

export const mostPeoplePackedRead = 500;

export const mostEmojisSeenAtOnce = 500;

export const mostEmojiCausesRead = 500;

export async function earnedEmojisOf(ctx: QueryContext, owner: PageOwner, causes: EmojiCauses): Promise<EarnedEmojis> {
  throw notPorted("album.earnedEmojis.earnedEmojisOf");
}

export type EmojiStack = { count: number; shown: ShownEmoji[] };

export async function earnedEmojiCountOf(ctx: QueryContext, workspace: string, member: MemberId): Promise<number> {
  throw notPorted("album.earnedEmojis.earnedEmojiCountOf");
}

export async function emojiStackOf(ctx: QueryContext, workspace: string, member: MemberId, most: number): Promise<EmojiStack> {
  throw notPorted("album.earnedEmojis.emojiStackOf");
}

export async function sharedEmojisOf(ctx: QueryContext, member: MemberId, { emojis }: EarnedEmojis): Promise<SharedEmoji[] | null> {
  throw notPorted("album.earnedEmojis.sharedEmojisOf");
}

export async function hypeEmojiOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<HypeEmoji | null> {
  throw notPorted("album.earnedEmojis.hypeEmojiOf");
}

export async function emojisEarnedBetween(ctx: QueryContext, { workspace, member }: PageOwner, instants: Instants): Promise<ShownEmoji[]> {
  throw notPorted("album.earnedEmojis.emojisEarnedBetween");
}

export type LevelsReached = { above: number; upTo: number; at: number };

export async function levelEmojisEarnedIn(ctx: QueryContext, { workspace, member }: PageOwner, { above, upTo, at }: LevelsReached): Promise<EarnedEmoji[]> {
  throw notPorted("album.earnedEmojis.levelEmojisEarnedIn");
}

export async function seenAtOf(ctx: QueryContext, member: MemberId, emoji: string): Promise<number | null> {
  throw notPorted("album.earnedEmojis.seenAtOf");
}

export async function teamEmojiOf(ctx: QueryContext, workspace: string, { team, art }: Pick<TeamSticker, "team" | "art">): Promise<ShownEmoji | null> {
  throw notPorted("album.earnedEmojis.teamEmojiOf");
}

export async function levelEmojiOf(ctx: QueryContext, workspace: string, level: number): Promise<ShownEmoji | null> {
  throw notPorted("album.earnedEmojis.levelEmojiOf");
}

export async function markEmojisSeenBy(ctx: MutationContext, member: MemberId, ids: string[], at: number): Promise<string[] | null> {
  throw notPorted("album.earnedEmojis.markEmojisSeenBy");
}

export async function unlockHypeEmojiOf(ctx: MutationContext, { workspace, member }: PageOwner, person: MemberId, at: number): Promise<HypeEmoji | null> {
  throw notPorted("album.earnedEmojis.unlockHypeEmojiOf");
}

export async function markEmojiSeen(ctx: MutationContext, member: MemberId, emoji: string, at: number): Promise<boolean> {
  throw notPorted("album.earnedEmojis.markEmojiSeen");
}

export async function tierUnlockedAt(ctx: QueryContext, member: MemberId, tier: ReachedTier, reachedAt: number): Promise<number | null> {
  throw notPorted("album.earnedEmojis.tierUnlockedAt");
}

export function tierEmojiIdOf({ milestone, tier }: ReachedTier): EarnedEmojiId {
  return `milestone:${milestone}:${tier}`;
}

export function teamPictureOf(art: TeamCrestArt): string {
  if (art === null) return teamEmblemPicture;
  return art.kind === "crest" ? emojiArtPictureOf("team", art.slug) : art.url;
}

export async function hypeEarnedBy(ctx: QueryContext, member: MemberId, person: MemberId | null): Promise<boolean> {
  throw notPorted("album.earnedEmojis.hypeEarnedBy");
}

export async function hypeUnlockedByReactions(ctx: QueryContext, member: MemberId, person: MemberId): Promise<boolean> {
  throw notPorted("album.earnedEmojis.hypeUnlockedByReactions");
}

export async function hypeFaceOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<{ name: string; picture: string }> {
  throw notPorted("album.earnedEmojis.hypeFaceOf");
}

export async function holdsEarnedEmojiNamed(ctx: QueryContext, workspace: string, member: MemberId, toned: string): Promise<boolean> {
  throw notPorted("album.earnedEmojis.holdsEarnedEmojiNamed");
}

export async function earnedEmojisAmong(ctx: QueryContext, workspace: string, member: MemberId, names: string[], counts: (emoji: string) => boolean | Promise<boolean>): Promise<{ name: string; emoji: string }[]> {
  throw notPorted("album.earnedEmojis.earnedEmojisAmong");
}

export async function holdsEarnedEmoji(ctx: QueryContext, member: MemberId, emoji: string): Promise<boolean> {
  throw notPorted("album.earnedEmojis.holdsEarnedEmoji");
}

export async function isEarnedBy(ctx: QueryContext, member: MemberId, id: string): Promise<boolean> {
  throw notPorted("album.earnedEmojis.isEarnedBy");
}
