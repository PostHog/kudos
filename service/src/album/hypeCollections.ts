// A teammate's hype emoji collected by reactions: the tenth of their own messages a member reacts on with it puts their
// card in the member's album, once, behind hype-by-reactions. Today's convex/album/hypeCollections.ts over the
// service's transaction.
import { and, eq } from "drizzle-orm";
import type { HypeReactedEvent } from "../bus/events.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { hypeReactions, hypesCollected, type Doc } from "../db/schema/index.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { reactionsToCollect } from "./emojiCatalogue.ts";
import { hypeByReactionsCollectFor } from "./flag.ts";
import { recordMilestonesOf } from "./milestones.ts";
import { allIn, insertInto, uniqueIn } from "./rows.ts";
import { recordReactionsSticker } from "./stickers.ts";

export type ReactionsToward = { have: number; need: number };

type HypeCollected = Doc<"hypesCollected">;

const reactionsByGiverOwnerAuthor = indexOrder(hypeReactions, ["giver", "owner", "author"]);
const collectedByMemberPerson = indexOrder(hypesCollected, ["member", "person"]);

export async function collectByReactions(ctx: MutationContext, { workspace, giver, owner, author, at }: HypeReactedEvent): Promise<void> {
  if (giver === owner || author !== owner) return;
  if ((await collectedBy(ctx, giver, owner)) !== null || !(await hypeByReactionsCollectFor(ctx, giver))) return;
  if ((await reactionsToward(ctx, giver, owner)).have < reactionsToCollect) return;
  await insertInto(ctx, hypesCollected, { workspace, member: giver, person: owner, at });
  await recordReactionsSticker(ctx, giver, owner, at);
  await recordMilestonesOf(ctx, { workspace, member: giver }, at);
}

export async function reactionsToward(ctx: QueryContext, giver: MemberId, owner: MemberId): Promise<ReactionsToward> {
  const where = and(eq(hypeReactions.giver, giver), eq(hypeReactions.owner, owner), eq(hypeReactions.author, owner));
  const onOwnMessages = await allIn<Doc<"hypeReactions">>(ctx, hypeReactions, reactionsByGiverOwnerAuthor, where, reactionsToCollect);
  return { have: onOwnMessages.length, need: reactionsToCollect };
}

export function collectedBy(ctx: QueryContext, member: MemberId, person: MemberId): Promise<HypeCollected | null> {
  return uniqueIn<HypeCollected>(ctx, hypesCollected, collectedByMemberPerson, and(eq(hypesCollected.member, member), eq(hypesCollected.person, person)));
}

export function peopleCollectedBy(ctx: QueryContext, member: MemberId, most: number): Promise<HypeCollected[]> {
  return allIn<HypeCollected>(ctx, hypesCollected, collectedByMemberPerson, eq(hypesCollected.member, member), most);
}
