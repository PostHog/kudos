// The module map's skeleton of convex/website/skillTree.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { PerkId } from "../progression/tree.ts";
import { type Denial, type VerifiedMember } from "./memberQuery.ts";
import { type PageWaits, type UnlockPath } from "./unlockPath.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type PerkNode = {
  perk: PerkId;
  name: string;
  copy: string;
  cost: { skillPoints: number; coins: number };
  requires: string | null;
  upgrades: PerkId | null;
  state: "owned" | "available" | "unavailable";
  reason: "level" | "requires" | "points" | "coins" | null;
  ownedAt: number | null;
};

export type TreeRow = { level: number; perks: PerkNode[] };

export type SkillTreeAnswer = { kind: "not-found" } | PageWaits | { kind: "tree"; skillPoints: number; coins: number | null; rows: TreeRow[]; chatUrl: string };

export type MySkillTree = Denial | SkillTreeAnswer;

export async function skillPointsOf(ctx: QueryContext, me: VerifiedMember, path: UnlockPath): Promise<number | null> {
  throw notPorted("website.skillTree.skillPointsOf");
}
