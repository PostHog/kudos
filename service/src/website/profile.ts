// The module map's skeleton of convex/website/profile.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Avatar } from "../album/hoggies/avatar.ts";
import { type Face } from "./faces.ts";
import { type MemberInventory } from "./inventory.ts";
import { type Denial } from "./memberQuery.ts";
import { type FeatureCard, type FeaturePage } from "./unlockPath.ts";

export type { Face } from "./faces.ts";
export type { Avatar } from "../album/hoggies/avatar.ts";
export type { FeatureCard, FeaturePage, PageWaits } from "./unlockPath.ts";
export type { InventoryItem, ItemSource, MemberInventory } from "./inventory.ts";

export type Kudos = { given: number; received: number };

export type Progression = { level: number; xp: number; levelStartsAt: number; nextLevelAt: number; xpToNextLevel: number };

export type MemberProfile = {
  kind: "member";
  name?: string;
  face: Face;
  kudosEmoji: string;
  allowance: { left: number; base: number; refillsAt: number };
  thisWeek: Kudos;
  lifetime: Kudos;
  chatUrl: string;
  leaderboard: FeaturePage;
  features: FeatureCard[] | null;
  progression: Progression | null;
  skillPoints: number | null;
  coins: number | null;
  inventory: MemberInventory | null;
  groups: boolean;
  settings: boolean;
  avatar?: Avatar | null;
  bookSpread?: true;
  album?: true;
};

export type MyProfile = Denial | MemberProfile;
