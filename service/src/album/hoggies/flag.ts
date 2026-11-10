// The module map's skeleton of convex/album/hoggies/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../../analytics/flags.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export const collectionFlag = { key: "collection", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const crestsFlag = { key: "crests", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const crateStoreFlag = { key: "crate-store", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const packsFlag = { key: "packs", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const hoggieAvatarFlag = { key: "hoggie-avatar", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const petHoggieFlag = { key: "pet-hoggie", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const hoggieForgeFlag = { key: "hoggie-forge", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function hoggieForgeShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.hoggieForgeShownTo");
}

export function hoggiesShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.hoggiesShownTo");
}

export async function hoggiesDropFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.hoggiesDropFor");
}

export async function packsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.packsShownTo");
}

export async function packsPayFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.packsPayFor");
}

export function crateStoreShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.crateStoreShownTo");
}

export async function crateStoreOpenFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.crateStoreOpenFor");
}

export function crestsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.crestsShownTo");
}

export async function crestsShownFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.crestsShownFor");
}

export async function avatarShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.avatarShownTo");
}

export async function avatarOpenFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.avatarOpenFor");
}

export function petHoggieShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.flag.petHoggieShownTo");
}
