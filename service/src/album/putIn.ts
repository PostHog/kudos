// The module map's skeleton of convex/album/putIn.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { TrayItem } from "./opening.ts";
import type { PageOwner } from "./teamPages.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const mostPutInACall = 25;

export type PutIn = { items: TrayItem[]; more: boolean };

type Stored = Doc<"trayItems">;

export async function putItemIn(ctx: MutationContext, owner: PageOwner, item: Id<"trayItems">, at: number): Promise<TrayItem | null> {
  throw notPorted("album.putIn.putItemIn");
}

export async function putEveryItemIn(ctx: MutationContext, owner: PageOwner, at: number): Promise<PutIn> {
  throw notPorted("album.putIn.putEveryItemIn");
}

export async function placeFromTheTray(ctx: MutationContext, workspace: string, item: Stored, at: number): Promise<void> {
  throw notPorted("album.putIn.placeFromTheTray");
}

export async function putStickerIn(ctx: MutationContext, { workspace, member }: PageOwner, person: MemberId, pack: Id<"thoughtfulPacks">, at: number): Promise<boolean> {
  throw notPorted("album.putIn.putStickerIn");
}

export async function markTrayStickerPutIn(ctx: MutationContext, pack: Id<"thoughtfulPacks">, at: number): Promise<void> {
  throw notPorted("album.putIn.markTrayStickerPutIn");
}
