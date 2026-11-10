// The module map's skeleton of convex/album/hoggies/boughtCrates.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Surface } from "../../commands/surface.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { CrateKey } from "./crateKey.ts";
import type { Drop } from "./drops.ts";
import type { CratePurchaseOutcome } from "./records.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export type CrateStore = { price: number; next: number };

export async function buyCrate(ctx: MutationContext, member: MemberId, next: number, at: number): Promise<CratePurchaseOutcome | null> {
  throw notPorted("album.hoggies.boughtCrates.buyCrate");
}

export async function openCrate(ctx: MutationContext, member: MemberId, crate: string, at: number, surface: Surface): Promise<void> {
  throw notPorted("album.hoggies.boughtCrates.openCrate");
}

export async function openedCrateDropOf(ctx: MutationContext, member: MemberId, crate: string): Promise<Drop | null> {
  throw notPorted("album.hoggies.boughtCrates.openedCrateDropOf");
}

export async function crateStoreOf(ctx: QueryContext, member: MemberId): Promise<CrateStore | null> {
  throw notPorted("album.hoggies.boughtCrates.crateStoreOf");
}

export async function waitingCratesOf(ctx: QueryContext, member: MemberId): Promise<string[]> {
  throw notPorted("album.hoggies.boughtCrates.waitingCratesOf");
}

export type BoughtCrateWaiting = { crate: string; at: number };

export async function boughtCratesWaitingFor(ctx: QueryContext, member: MemberId, limit: number): Promise<BoughtCrateWaiting[]> {
  throw notPorted("album.hoggies.boughtCrates.boughtCratesWaitingFor");
}

export async function boughtCrateOpened(ctx: QueryContext, member: MemberId, crate: string): Promise<boolean> {
  throw notPorted("album.hoggies.boughtCrates.boughtCrateOpened");
}

export function boughtCrateKeyOf(next: number): CrateKey {
  return `bought:${next}`;
}
