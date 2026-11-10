// The module map's skeleton of convex/album/hoggies/waitingPacks.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../../workspace/directory.ts";
import { type CrateKey, type CrateKind } from "./crateKey.ts";
import type { QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export type Pack = { crate: CrateKey; kind: CrateKind; n: number };

export type WaitingPacks = { packs: Pack[]; morePacks: boolean };

export async function waitingPacksOf(ctx: QueryContext, member: MemberId): Promise<WaitingPacks> {
  throw notPorted("album.hoggies.waitingPacks.waitingPacksOf");
}
