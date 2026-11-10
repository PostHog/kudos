// The hype reactions a member gave, each kept once by its message, and the nudges they answer: the teammates whose own
// messages the member reacted to with their hype emoji and whose emoji the member doesn't hold yet. Today's
// convex/album/hypeReactions.ts over the service's transaction; the bus's hypeReacted subscriber is a job under its
// Convex name.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { hypeReactedEventValidator, type HypeReactedEvent } from "../bus/events.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { hypeReactions, type Doc } from "../db/schema/index.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { isMember, type MemberId } from "../workspace/directory.ts";
import { hypeEarnedBy } from "./earnedEmojis.ts";
import { emojiNameOf } from "./emojiNames.ts";
import { collectByReactions } from "./hypeCollections.ts";
import { firstIn, insertInto } from "./rows.ts";

export type Nudge = { person: MemberId; emoji: string; reactions: number };

type HypeReaction = Doc<"hypeReactions">;

type ReactedOwner = { workspace: string; owner: MemberId; reactions: number };

export const mostHypeReactionsRead = 500;

export const mostOwnersChecked = 20;

const byGiverAt = indexOrder(hypeReactions, ["giver", "at"]);
const byGiverOwnerMessage = indexOrder(hypeReactions, ["giver", "owner", "conversation", "message"]);

export const keepHypeReactionArgs = z.strictObject({ event: hypeReactedEventValidator });
export async function keepHypeReaction(ctx: MutationContext, { event }: z.infer<typeof keepHypeReactionArgs>): Promise<void> {
  if (await isKept(ctx, event)) return;
  const { workspace, giver, owner, author, emoji, message, at } = event;
  await insertInto(ctx, hypeReactions, { workspace, giver, owner, author, emoji, conversation: message.conversation, message: message.message, at });
  await collectByReactions(ctx, event);
}
export const keepHypeReactionJob = mutationJob("album.hypeReactions.keepHypeReaction", keepHypeReactionArgs, keepHypeReaction);

export async function nudgesFor(ctx: QueryContext, member: MemberId, most: number): Promise<Nudge[]> {
  const nudges: Nudge[] = [];
  for (const reacted of reactedOwnersOf(await newestHypeReactionsBy(ctx, member)).slice(0, mostOwnersChecked)) {
    if (nudges.length === most) break;
    const nudge = await nudgeOf(ctx, member, reacted);
    if (nudge !== null) nudges.push(nudge);
  }
  return nudges;
}

async function isKept(ctx: MutationContext, { giver, owner, message }: HypeReactedEvent): Promise<boolean> {
  const where = and(eq(hypeReactions.giver, giver), eq(hypeReactions.owner, owner), eq(hypeReactions.conversation, message.conversation), eq(hypeReactions.message, message.message));
  return (await firstIn<HypeReaction>(ctx, hypeReactions, byGiverOwnerMessage, where)) !== null;
}

// `.order("desc").take(n)` over the giver's reactions: the newest first, by `at` and then by the index's tie-breakers.
async function newestHypeReactionsBy(ctx: QueryContext, giver: MemberId): Promise<HypeReaction[]> {
  const rows = await ctx.tx
    .select()
    .from(hypeReactions)
    .where(eq(hypeReactions.giver, giver))
    .orderBy(...byGiverAt.orderBy("desc"))
    .limit(mostHypeReactionsRead);
  return rows.map((row) => toDocument<HypeReaction>(hypeReactions, row));
}

function reactedOwnersOf(newestFirst: HypeReaction[]): ReactedOwner[] {
  const owners = new Map<MemberId, ReactedOwner>();
  for (const { workspace, owner, author } of newestFirst) {
    if (author !== owner) continue;
    const reacted = owners.get(owner) ?? { workspace, owner, reactions: 0 };
    owners.set(owner, { ...reacted, reactions: reacted.reactions + 1 });
  }
  return [...owners.values()].toSorted((a, b) => b.reactions - a.reactions);
}

async function nudgeOf(ctx: QueryContext, member: MemberId, { workspace, owner, reactions }: ReactedOwner): Promise<Nudge | null> {
  if (!(await isMember(ctx, owner))) return null;
  const emoji = await emojiNameOf(ctx, workspace, `hype:${owner}`);
  if (emoji === null || (await hypeEarnedBy(ctx, member, owner))) return null;
  return { person: owner, emoji, reactions };
}
