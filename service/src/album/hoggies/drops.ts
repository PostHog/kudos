// The module map's skeleton of convex/album/hoggies/drops.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Surface } from "../../commands/surface.ts";
import type { DecidedBelow } from "../../engine/awards.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { AppliedReward } from "../../progression/rewards.ts";
import { crestNamed, type Rarity } from "./catalogue.ts";
import type { Drawn } from "./draw.ts";
import type { CrateKey } from "./crateKey.ts";
import type { RarityRange, SourceRarities } from "./rarityCaps.ts";
import type { Doc } from "../../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export type HoggieArt = { kind: "hoggie"; slug: string };

export type CrestArt = { kind: "crest"; slug: string };

export type CompletedCrest = { crest: string; name: string; art: CrestArt };

export type Drop = { hoggie: string; name: string; rarity: Rarity; art: HoggieArt; copy: number; isNew: boolean; crest?: CompletedCrest | null };

export type CrestsShown = { crests: boolean };

export type DroppedAt = { at: number; n: number; decided: number; drop: Drop };

export type DropContext = RarityRange & { rarities?: SourceRarities; surface?: Surface; unowned?: boolean; waits?: boolean };

export type FindContext = { surface?: Surface; waits?: boolean };

export async function dropFor(ctx: MutationContext, member: MemberId, crate: CrateKey, at: number, { floor, cap, weights, rarities, unowned = false, ...context }: DropContext): Promise<void> {
  throw notPorted("album.hoggies.drops.dropFor");
}

export async function recordFind(ctx: MutationContext, member: MemberId, crate: CrateKey, { hoggie, rarity }: Drawn, at: number, { surface, waits = false }: FindContext): Promise<void> {
  throw notPorted("album.hoggies.drops.recordFind");
}

export async function putDropIn(ctx: MutationContext, member: MemberId, crate: CrateKey, at: number): Promise<void> {
  throw notPorted("album.hoggies.drops.putDropIn");
}

export async function lastFoundBy(ctx: QueryContext, member: MemberId): Promise<Drop | null> {
  throw notPorted("album.hoggies.drops.lastFoundBy");
}

export async function packOf(ctx: QueryContext, member: MemberId, crate: string): Promise<AppliedReward | null> {
  throw notPorted("album.hoggies.drops.packOf");
}

export async function droppedIn(ctx: QueryContext, member: MemberId, crate: CrateKey): Promise<boolean> {
  throw notPorted("album.hoggies.drops.droppedIn");
}

export async function dropOf(ctx: MutationContext, member: MemberId, crate: CrateKey): Promise<Drop | null> {
  throw notPorted("album.hoggies.drops.dropOf");
}

export async function foundIn(ctx: QueryContext, member: MemberId, crate: CrateKey, shown: CrestsShown): Promise<Drop | null> {
  throw notPorted("album.hoggies.drops.foundIn");
}

export async function* dropsByDecision(ctx: QueryContext, member: MemberId, below: DecidedBelow, shown: CrestsShown): AsyncGenerator<DroppedAt> {
  throw notPorted("album.hoggies.drops.dropsByDecision");
}

export function completedCrestOf(crest: string): CompletedCrest {
  return { crest, name: crestNamed(crest)?.name ?? crest, art: { kind: "crest", slug: crest } };
}

export function tallyOf(ctx: QueryContext, member: MemberId, hoggie: string): Promise<Doc<"hoggieTallies"> | null> {
  throw notPorted("album.hoggies.drops.tallyOf");
}

export function drawSecret() {
  return process.env.HOGGIE_DRAW_SECRET ?? "";
}
