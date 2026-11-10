// The hoggie flags, as today's convex/album/hoggies/flag.ts: a mutation's decision records the member's exposure, a
// query's only reads.
import { exposed, memberDecision, memberDecisionWithoutWriting, type Flag } from "../../analytics/flags.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import type { MemberId } from "../../workspace/directory.ts";

export const collectionFlag = { key: "collection", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const crestsFlag = { key: "crests", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const crateStoreFlag = { key: "crate-store", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const packsFlag = { key: "packs", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const hoggieAvatarFlag = { key: "hoggie-avatar", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const petHoggieFlag = { key: "pet-hoggie", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const hoggieForgeFlag = { key: "hoggie-forge", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function hoggieForgeShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, hoggieForgeFlag, member);
}

export function hoggiesShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecision(ctx, collectionFlag, member);
}

export async function hoggiesDropFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const drops = await memberDecision(ctx, collectionFlag, member);
  await exposed(ctx, collectionFlag, member, drops);
  return drops;
}

export async function packsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await hoggiesShownTo(ctx, member)) && (await memberDecision(ctx, packsFlag, member));
}

export async function packsPayFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const pays = await memberDecision(ctx, packsFlag, member);
  await exposed(ctx, packsFlag, member, pays);
  return pays;
}

export function crateStoreShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecision(ctx, crateStoreFlag, member);
}

export async function crateStoreOpenFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const open = await memberDecision(ctx, crateStoreFlag, member);
  await exposed(ctx, crateStoreFlag, member, open);
  return open;
}

export function crestsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecision(ctx, crestsFlag, member);
}

export async function crestsShownFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const shown = await memberDecision(ctx, crestsFlag, member);
  await exposed(ctx, crestsFlag, member, shown);
  return shown;
}

export async function avatarShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await memberDecisionWithoutWriting(ctx, hoggieAvatarFlag, member)) && (await memberDecisionWithoutWriting(ctx, collectionFlag, member));
}

export async function avatarOpenFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  if (!(await hoggiesShownTo(ctx, member))) return false;
  const open = await memberDecision(ctx, hoggieAvatarFlag, member);
  await exposed(ctx, hoggieAvatarFlag, member, open);
  return open;
}

export function petHoggieShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, petHoggieFlag, member);
}
