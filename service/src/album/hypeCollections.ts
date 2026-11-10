// The module map's skeleton of convex/album/hypeCollections.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { HypeReactedEvent } from "../bus/events.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type ReactionsToward = { have: number; need: number };

type HypeCollected = Doc<"hypesCollected">;

export async function collectByReactions(ctx: MutationContext, { workspace, giver, owner, author, at }: HypeReactedEvent): Promise<void> {
  throw notPorted("album.hypeCollections.collectByReactions");
}

export async function reactionsToward(ctx: QueryContext, giver: MemberId, owner: MemberId): Promise<ReactionsToward> {
  throw notPorted("album.hypeCollections.reactionsToward");
}

export function collectedBy(ctx: QueryContext, member: MemberId, person: MemberId): Promise<HypeCollected | null> {
  throw notPorted("album.hypeCollections.collectedBy");
}

export function peopleCollectedBy(ctx: QueryContext, member: MemberId, most: number): Promise<HypeCollected[]> {
  throw notPorted("album.hypeCollections.peopleCollectedBy");
}
