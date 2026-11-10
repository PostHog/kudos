// The module map's skeleton of convex/album/hoggies/forge.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { PageOwner } from "../teamPages.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { CrateKey } from "./crateKey.ts";
import type { Id } from "../../db/columns.ts";
import type { MutationContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export async function forge(ctx: MutationContext, owner: PageOwner, hoggie: string, request: string, at: number): Promise<Id<"items"> | null> {
  throw notPorted("album.hoggies.forge.forge");
}

export async function dropForged(ctx: MutationContext, member: MemberId, crate: CrateKey, from: string, at: number): Promise<void> {
  throw notPorted("album.hoggies.forge.dropForged");
}
