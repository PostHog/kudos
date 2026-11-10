// The module map's skeleton of convex/album/hoggies/pet.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../../workspace/directory.ts";
import { type Rarity } from "./catalogue.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export type Pet = { person: MemberId; hoggie: string; name: string; rarity: Rarity };

export type PetOwner = { workspace: string; member: MemberId };

export async function makePetOf(ctx: MutationContext, { workspace, member }: PetOwner, hoggie: string): Promise<string | null> {
  throw notPorted("album.hoggies.pet.makePetOf");
}

export async function petOf(ctx: QueryContext, { workspace, member }: PetOwner): Promise<string | null> {
  throw notPorted("album.hoggies.pet.petOf");
}

export async function petsIn(ctx: QueryContext, workspace: string): Promise<Pet[]> {
  throw notPorted("album.hoggies.pet.petsIn");
}
