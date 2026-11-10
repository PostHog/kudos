// The module map's skeleton of convex/progression/perks.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { PurchaseOutcome, Refusal } from "./purchases.ts";
import type { OwnedPerk } from "./skillTree.ts";
import type { Perk, PerkId } from "./tree.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type PerkState = "buyable" | Refusal;

export type MemberPerks = { skillPoints: number; owned: OwnedPerk[]; perks: Array<Perk & { state: PerkState; boughtAt: number | null }> };

export async function buyPerk(ctx: MutationContext, member: MemberId, perk: PerkId, idempotencyKey: string): Promise<PurchaseOutcome | null> {
  throw notPorted("progression.perks.buyPerk");
}

export async function treePerksOf(ctx: QueryContext, member: MemberId): Promise<MemberPerks | null> {
  throw notPorted("progression.perks.treePerksOf");
}

export async function memberPerksOf(ctx: QueryContext, member: MemberId): Promise<MemberPerks> {
  throw notPorted("progression.perks.memberPerksOf");
}

export function ownsEveryPerk({ owned, perks }: MemberPerks): boolean {
  return perks.every(({ perk, retired }) => retired === true || owned.some((each) => each.perk === perk));
}
