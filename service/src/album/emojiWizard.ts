// The module map's skeleton of convex/album/emojiWizard.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import { type SlackEmojiReach } from "../workspace/slackEmoji.ts";
import { type EarnedEmojiKind } from "./earnedEmojis.ts";
import { type EarnedEmojiId } from "./emojiNames.ts";
import type { EmojiMapper } from "./records.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type SlackEmojiMatch = { name: string; image: string; free: boolean };

export type AppEmojiKind = Exclude<EarnedEmojiKind, "random">;

export type EmojiInPlace = "admin" | "member" | null;

export type AppEmojiRow = { emoji: EarnedEmojiId; kind: AppEmojiKind; name: string; from: string; picture: string; holders: number; slack: { image: string; mappedBy: EmojiMapper | null } | null };

export const mostMatchesShown = 24;

export const mostHoldingsCounted = 5_000;

export const mostAppEmojisListed = 500;

export async function slackEmojisNear(ctx: QueryContext, workspace: string, near: string, search: string, reach: SlackEmojiReach): Promise<SlackEmojiMatch[]> {
  throw notPorted("album.emojiWizard.slackEmojisNear");
}

export async function mapHeldEmoji(ctx: MutationContext, workspace: string, member: MemberId, emoji: string, name: string): Promise<boolean> {
  throw notPorted("album.emojiWizard.mapHeldEmoji");
}

export async function emojiInPlaceFor(ctx: QueryContext, member: MemberId): Promise<EmojiInPlace> {
  throw notPorted("album.emojiWizard.emojiInPlaceFor");
}

export async function mapAppEmojiInPlace(ctx: MutationContext, workspace: string, maintainer: MemberId, emoji: string, name: string): Promise<boolean> {
  throw notPorted("album.emojiWizard.mapAppEmojiInPlace");
}

export type AppEmojiRows = { rows: AppEmojiRow[]; more: boolean };

export async function appEmojisIn(ctx: QueryContext, workspace: string, levels: readonly number[], everyHype: boolean): Promise<AppEmojiRows> {
  throw notPorted("album.emojiWizard.appEmojisIn");
}
