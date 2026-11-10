// The skill tree page: the member's perks by row, what each costs, and why one they can't buy yet waits. Today's
// convex/website/skillTree.ts; getSkillTree is a plain handler the website platform's route table runs after the member
// check.
import { treePerksOf, type MemberPerks, type PerkState } from "../progression/perks.ts";
import type { PerkId } from "../progression/tree.ts";
import { workspaceLink } from "../slack/workspaceLink.ts";
import { visibleWalletOf } from "../wallet/wallet.ts";
import { type Denial, type VerifiedMember } from "./memberQuery.ts";
import { featurePageOf, unlockPathOf, type PageWaits, type UnlockPath } from "./unlockPath.ts";
import type { QueryContext } from "../operations.ts";

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

type CataloguePerk = MemberPerks["perks"][number];

const nodeStates = {
  owned: { state: "owned", reason: null },
  buyable: { state: "available", reason: null },
  "below-row": { state: "unavailable", reason: "level" },
  "needs-prerequisite": { state: "unavailable", reason: "requires" },
  "no-skill-points": { state: "unavailable", reason: "points" },
  "no-coins": { state: "unavailable", reason: "coins" },
} as const satisfies Partial<Record<PerkState, Pick<PerkNode, "state" | "reason">>>;

type ShownPerk = CataloguePerk & { state: keyof typeof nodeStates };

export const getSkillTreeArgs = {};

export async function getSkillTree(ctx: QueryContext, me: VerifiedMember): Promise<SkillTreeAnswer> {
  const page = featurePageOf(await unlockPathOf(ctx, me), "skillTree");
  if (page.kind === "off") return { kind: "not-found" };
  if (page.kind !== "open") return page;
  const perks = await treePerksOf(ctx, me.member);
  if (perks === null) return { kind: "not-found" };
  const coins = (await visibleWalletOf(ctx, me.member))?.balance ?? null;
  return { kind: "tree", skillPoints: perks.skillPoints, coins, rows: rowsOf(perks.perks), chatUrl: workspaceLink(me.workspace) };
}

export async function skillPointsOf(ctx: QueryContext, me: VerifiedMember, path: UnlockPath): Promise<number | null> {
  if (featurePageOf(path, "skillTree").kind !== "open") return null;
  return (await treePerksOf(ctx, me.member))?.skillPoints ?? null;
}

function rowsOf(catalogue: CataloguePerk[]): TreeRow[] {
  const shown = catalogue.filter(isShown);
  const levels = [...new Set(shown.map(({ row }) => row))].sort((a, b) => a - b);
  return levels.map((level) => ({ level, perks: shown.filter(({ row }) => row === level).map((perk) => nodeOf(perk, catalogue)) }));
}

function isShown(perk: CataloguePerk): perk is ShownPerk {
  return perk.state in nodeStates;
}

function nodeOf({ perk, name, copy, skillPoints, coins, requires, upgrades, state, boughtAt }: ShownPerk, catalogue: CataloguePerk[]): PerkNode {
  return {
    perk,
    name,
    copy,
    cost: { skillPoints, coins },
    requires: requires === null ? null : nameOf(requires, catalogue),
    upgrades,
    ...nodeStates[state],
    ownedAt: state === "owned" ? boughtAt : null,
  };
}

function nameOf(perk: PerkId, catalogue: CataloguePerk[]) {
  return catalogue.find((entry) => entry.perk === perk)!.name;
}
