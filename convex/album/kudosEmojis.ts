import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Mention } from "../engine/messageEvent";
import type { ParseHook } from "../parser/parser";
import type { MemberId } from "../workspace/directory";
import { earnedEmojiNamesAmong, holdsEarnedEmoji } from "./earnedEmojis";
import { firstThankYouEmoji, mostKudosEmojiPicks } from "./emojiCatalogue";
import { kudosEmojiPicksCountFor } from "./flag";

const hypePrefix = "hype:";

export type KudosEmojiPick = { kind: "picked"; picks: string[] } | { kind: "full" } | { kind: "refused" };

export const earnedEmojiHook: ParseHook = {
  name: "earned emoji",
  kudosEmoji: async (ctx, { workspace, giver }, { emoji, mentions }) => {
    if (giver === undefined) return [];
    const counts = (await kudosEmojiPicksCountFor(ctx, giver)) ? await pickedOrMentioned(ctx, giver, mentions) : everyEarnedEmoji;
    return earnedEmojiNamesAmong(ctx, workspace, giver, emoji, counts);
  },
};

const everyEarnedEmoji = () => true;

async function pickedOrMentioned(ctx: QueryCtx, giver: MemberId, mentions: Mention[]) {
  const picked = new Set([firstThankYouEmoji, ...(await pickRowsOf(ctx, giver)).map(({ emoji }) => emoji)]);
  const mentioned = mentionedPeopleIn(mentions);
  return async (earned: string) => (isHype(earned) ? isHypeEmojiOfOneOf(ctx, earned, mentioned) : picked.has(earned));
}

function isHype(emoji: string): boolean {
  return emoji.startsWith(hypePrefix);
}

function mentionedPeopleIn(mentions: Mention[]): Set<string> {
  return new Set(mentions.flatMap((mention) => (mention.kind === "person" ? [mention.user] : [])));
}

async function isHypeEmojiOfOneOf(ctx: QueryCtx, emoji: string, users: Set<string>): Promise<boolean> {
  const person = ctx.db.normalizeId("members", emoji.slice(hypePrefix.length));
  const row = person === null ? null : await ctx.db.get(person);
  return row !== null && users.has(row.user);
}

export async function kudosEmojiPicksOf(ctx: QueryCtx, member: MemberId): Promise<string[]> {
  const held: string[] = [];
  for (const { emoji } of await pickRowsOf(ctx, member)) if (await isPickableBy(ctx, member, emoji)) held.push(emoji);
  return held;
}

async function isPickableBy(ctx: QueryCtx, member: MemberId, emoji: string): Promise<boolean> {
  return emoji !== firstThankYouEmoji && !isHype(emoji) && (await holdsEarnedEmoji(ctx, member, emoji));
}

export async function pickKudosEmoji(ctx: MutationCtx, member: MemberId, emoji: string, picked: boolean): Promise<KudosEmojiPick> {
  const existing = (await pickRowsOf(ctx, member)).find((pick) => pick.emoji === emoji);
  if (!picked) {
    if (existing !== undefined) await ctx.db.delete(existing._id);
    return { kind: "picked", picks: await kudosEmojiPicksOf(ctx, member) };
  }
  if (!(await isPickableBy(ctx, member, emoji))) return { kind: "refused" };
  if (existing === undefined) {
    if ((await stillPickableOf(ctx, member)).length >= mostKudosEmojiPicks) return { kind: "full" };
    await ctx.db.insert("kudosEmojiPicks", { member, emoji });
  }
  return { kind: "picked", picks: await kudosEmojiPicksOf(ctx, member) };
}

async function stillPickableOf(ctx: MutationCtx, member: MemberId) {
  const kept = [];
  for (const pick of await pickRowsOf(ctx, member)) {
    if (await isPickableBy(ctx, member, pick.emoji)) kept.push(pick);
    else await ctx.db.delete(pick._id);
  }
  return kept;
}

function pickRowsOf(ctx: QueryCtx, member: MemberId) {
  return ctx.db
    .query("kudosEmojiPicks")
    .withIndex("by_member_emoji", (q) => q.eq("member", member))
    .take(mostKudosEmojiPicks);
}
