// The earned emoji a member picks to count in their kudos, and the parse hook that claims a kudos message's earned
// emoji. Today's convex/album/kudosEmojis.ts over the service's transaction.
import { eq } from "drizzle-orm";
import { indexOrder } from "../db/indexOrder.ts";
import { kudosEmojiPicks, members, type Doc } from "../db/schema/index.ts";
import type { ChatUserId, Mention } from "../engine/messageEvent.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { KudosEmojiClaim, ParseHook } from "../parser/parser.ts";
import type { MemberId } from "../workspace/directory.ts";
import { earnedEmojisAmong, holdsEarnedEmoji } from "./earnedEmojis.ts";
import { firstThankYouEmoji, mostKudosEmojiPicks } from "./emojiCatalogue.ts";
import { kudosEmojiPicksCountFor } from "./flag.ts";
import { allIn, deleteIn, insertInto } from "./rows.ts";

const hypePrefix = "hype:";

export type KudosEmojiPick = { kind: "picked"; picks: string[] } | { kind: "full" } | { kind: "refused" };

type CountsFor = Omit<KudosEmojiClaim, "name">;

export const earnedEmojiHook: ParseHook = {
  name: "earned emoji",
  kudosEmoji: async (ctx, { workspace, giver }, { emoji, mentions }) => {
    if (giver === undefined) return [];
    const countsFor = (await kudosEmojiPicksCountFor(ctx, giver)) ? await pickedOrMentioned(ctx, giver, mentions) : everyone;
    const counting = new Map<string, CountsFor>();
    const earned = await earnedEmojisAmong(ctx, workspace, giver, emoji, async (id) => {
      const whom = await countsFor(id);
      if (whom !== null) counting.set(id, whom);
      return whom !== null;
    });
    return earned.map(({ name, emoji: id }) => ({ name, ...counting.get(id) }));
  },
};

const everyone = async (): Promise<CountsFor> => ({});

async function pickedOrMentioned(ctx: QueryContext, giver: MemberId, mentions: Mention[]) {
  const picked = new Set([firstThankYouEmoji, ...(await pickRowsOf(ctx, giver)).map(({ emoji }) => emoji)]);
  const mentioned = mentionedPeopleIn(mentions);
  return async (earned: string): Promise<CountsFor | null> => {
    if (!isHype(earned)) return picked.has(earned) ? {} : null;
    const person = await mentionedPersonOf(ctx, earned, mentioned);
    return person === null ? null : { onlyFor: person };
  };
}

function isHype(emoji: string): boolean {
  return emoji.startsWith(hypePrefix);
}

function mentionedPeopleIn(mentions: Mention[]): Set<ChatUserId> {
  return new Set(mentions.flatMap((mention) => (mention.kind === "person" ? [mention.user] : [])));
}

async function mentionedPersonOf(ctx: QueryContext, hypeEmoji: string, mentioned: Set<ChatUserId>): Promise<ChatUserId | null> {
  const row = await memberRowOf(ctx, hypeEmoji.slice(hypePrefix.length));
  return row !== null && mentioned.has(row.user) ? row.user : null;
}

// Convex's `normalizeId` then `get`: a key that is no member's ID finds no row, whatever its shape.
async function memberRowOf(ctx: QueryContext, member: string): Promise<{ user: ChatUserId } | null> {
  const [row] = await ctx.tx.select({ user: members.user }).from(members).where(eq(members._id, member)).limit(1);
  return row ?? null;
}

export async function kudosEmojiPicksOf(ctx: QueryContext, member: MemberId): Promise<string[]> {
  const held: string[] = [];
  for (const { emoji } of await pickRowsOf(ctx, member)) if (await isPickableBy(ctx, member, emoji)) held.push(emoji);
  return held;
}

async function isPickableBy(ctx: QueryContext, member: MemberId, emoji: string): Promise<boolean> {
  return emoji !== firstThankYouEmoji && !isHype(emoji) && (await holdsEarnedEmoji(ctx, member, emoji));
}

export async function pickKudosEmoji(ctx: MutationContext, member: MemberId, emoji: string, picked: boolean): Promise<KudosEmojiPick> {
  const existing = (await pickRowsOf(ctx, member)).find((pick) => pick.emoji === emoji);
  if (!picked) {
    if (existing !== undefined) await deleteIn(ctx, kudosEmojiPicks, existing);
    return { kind: "picked", picks: await kudosEmojiPicksOf(ctx, member) };
  }
  if (!(await isPickableBy(ctx, member, emoji))) return { kind: "refused" };
  if (existing === undefined) {
    if ((await stillPickableOf(ctx, member)).length >= mostKudosEmojiPicks) return { kind: "full" };
    await insertInto(ctx, kudosEmojiPicks, { member, emoji });
  }
  return { kind: "picked", picks: await kudosEmojiPicksOf(ctx, member) };
}

async function stillPickableOf(ctx: MutationContext, member: MemberId) {
  const kept = [];
  for (const pick of await pickRowsOf(ctx, member)) {
    if (await isPickableBy(ctx, member, pick.emoji)) kept.push(pick);
    else await deleteIn(ctx, kudosEmojiPicks, pick);
  }
  return kept;
}

const picksByMemberEmoji = indexOrder(kudosEmojiPicks, ["member", "emoji"]);

function pickRowsOf(ctx: QueryContext, member: MemberId) {
  return allIn<Doc<"kudosEmojiPicks">>(ctx, kudosEmojiPicks, picksByMemberEmoji, eq(kudosEmojiPicks.member, member), mostKudosEmojiPicks);
}
