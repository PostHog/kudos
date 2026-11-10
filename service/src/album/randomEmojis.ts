// Random emojis: a thoughtful pack opened sometimes drops one of the workspace's custom emoji the member doesn't hold,
// behind random-emojis, and the member holds it by its Slack name while Slack still has it. Today's
// convex/album/randomEmojis.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import { indexOrder } from "../db/indexOrder.ts";
import { randomEmojiDrops, thoughtfulPacks, type Doc } from "../db/schema/index.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import { slackEmojiImageOf } from "../workspace/slackEmoji.ts";
import { drawSecret } from "./hoggies/drops.ts";
import { mostRandomEmojis, randomEmojiNamesIn } from "./emojiClasses.ts";
import { emojiRollOf } from "./emojiRoll.ts";
import { randomEmojisShownTo } from "./flag.ts";
import { allIn, firstIn, insertInto } from "./rows.ts";
import type { Id } from "../db/columns.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export { mostRandomEmojis };

export const randomEmojiChance = 0.1;

export const mostRandomEmojisShown = 200;

export type RandomEmojiId = `random:${string}`;

const randomPrefix = "random:";

export type HeldRandomEmoji = { id: RandomEmojiId; name: string; image: string; from: MemberId; at: number };

type RandomEmojiDrop = Doc<"randomEmojiDrops">;

const dropsByMemberName = indexOrder(randomEmojiDrops, ["member", "name"]);

export async function dropRandomEmojiFrom(ctx: MutationContext, member: MemberId, pack: Id<"thoughtfulPacks">, crate: string, at: number): Promise<void> {
  if (!(await randomEmojisShownTo(ctx, member))) return;
  const { chance, pick } = await emojiRollOf({ secret: drawSecret(), member, crate });
  if (chance >= randomEmojiChance) return;
  const { workspace } = await chatUserOf(ctx, member);
  const offered: string[] = [];
  for (const name of await randomEmojiNamesIn(ctx, workspace)) if (!(await holdsRandomEmoji(ctx, member, name))) offered.push(name);
  const name = offered[Math.floor(pick * offered.length)];
  if (name === undefined || (await slackEmojiImageOf(ctx, workspace, name)) === undefined) return;
  await insertInto(ctx, randomEmojiDrops, { member, name, pack, at });
}

export async function randomEmojisHeldBy(ctx: QueryContext, workspace: string, member: MemberId, picked: string[] = []): Promise<HeldRandomEmoji[]> {
  const held: HeldRandomEmoji[] = [];
  if (!(await randomEmojisShownTo(ctx, member))) return held;
  for (const { name, pack, at } of await pickedDropsFirstOf(ctx, member, picked)) {
    const image = await slackEmojiImageOf(ctx, workspace, name);
    const packed = await packOf(ctx, pack);
    if (image !== undefined && packed !== null) held.push({ id: `random:${name}`, name, image, from: packed.recipient, at });
  }
  return held;
}

export async function holdsRandomEmoji(ctx: QueryContext, member: MemberId, name: string): Promise<boolean> {
  return (await dropNamed(ctx, member, name)) !== null;
}

export async function randomEmojiNamesHeldBy(ctx: QueryContext, member: MemberId): Promise<string[]> {
  const drops = await allIn<RandomEmojiDrop>(ctx, randomEmojiDrops, dropsByMemberName, eq(randomEmojiDrops.member, member));
  return drops.map(({ name }) => name);
}

async function pickedDropsFirstOf(ctx: QueryContext, member: MemberId, picked: string[]) {
  const pickedDrops: RandomEmojiDrop[] = [];
  for (const emoji of picked) {
    const drop = emoji.startsWith(randomPrefix) ? await dropNamed(ctx, member, emoji.slice(randomPrefix.length)) : null;
    if (drop !== null) pickedDrops.push(drop);
  }
  const pickedNames = new Set(pickedDrops.map(({ name }) => name));
  return [...pickedDrops, ...(await dropsOf(ctx, member)).filter(({ name }) => !pickedNames.has(name))].slice(0, mostRandomEmojisShown);
}

function dropNamed(ctx: QueryContext, member: MemberId, name: string) {
  return firstIn<RandomEmojiDrop>(ctx, randomEmojiDrops, dropsByMemberName, and(eq(randomEmojiDrops.member, member), eq(randomEmojiDrops.name, name)));
}

function dropsOf(ctx: QueryContext, member: MemberId) {
  return allIn<RandomEmojiDrop>(ctx, randomEmojiDrops, dropsByMemberName, eq(randomEmojiDrops.member, member), mostRandomEmojisShown);
}

// Convex's `ctx.db.get(pack)`.
async function packOf(ctx: QueryContext, pack: Id<"thoughtfulPacks">): Promise<Pick<Doc<"thoughtfulPacks">, "recipient"> | null> {
  const [row] = await ctx.tx.select({ recipient: thoughtfulPacks.recipient }).from(thoughtfulPacks).where(eq(thoughtfulPacks._id, pack)).limit(1);
  return row ?? null;
}
