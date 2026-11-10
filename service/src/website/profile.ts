// The signed-in member's home page: their allowance, kudos, path of features, progression, coins, inventory and the
// sections they see. Today's convex/website/profile.ts; its member query is a handler the website platform's route table
// runs once the member check has passed.
import { albumOnProfileOf } from "../album/flag.ts";
import { homeFacts } from "../engine/home.ts";
import { avatarShownOn, type Avatar } from "../album/hoggies/avatar.ts";
import { groupsShownTo } from "../groups/groups.ts";
import { xpToReach } from "../progression/levels.ts";
import { progressionHomeOf } from "../progression/progression.ts";
import { xpLevelsOnFor } from "../progression/xpLevels.ts";
import { workspaceLink } from "../slack/workspaceLink.ts";
import { visibleWalletOf } from "../wallet/wallet.ts";
import type { QueryContext } from "../operations.ts";
import { bookSpreadShownTo } from "./bookSpread.ts";
import { followTheClock } from "./clock.ts";
import { signInFaceOf, type Face } from "./faces.ts";
import { inventoryShownTo, type MemberInventory } from "./inventory.ts";
import type { Denial, VerifiedMember } from "./memberQuery.ts";
import { settingsShownTo } from "./settings.ts";
import { skillPointsOf } from "./skillTree.ts";
import { featureCardsOf, leaderboardStateOf, unlockPathOf, type FeatureCard, type FeaturePage } from "./unlockPath.ts";

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

export async function getMyProfile(ctx: QueryContext, me: VerifiedMember): Promise<MemberProfile | Denial> {
  await followTheClock(ctx);
  const facts = await homeFacts(ctx, me.workspace, me.user);
  if (facts?.kind !== "member") return { kind: "not-a-member" };
  const path = await unlockPathOf(ctx, me);
  const leaderboard = await leaderboardStateOf(ctx, me, path);
  return {
    kind: "member",
    ...(me.name !== undefined && { name: me.name }),
    face: signInFaceOf(me),
    kudosEmoji: facts.kudosEmoji,
    allowance: { left: facts.left, base: facts.base, refillsAt: facts.refillsAt },
    thisWeek: { given: facts.givenWeek, received: facts.receivedWeek },
    lifetime: { given: facts.given, received: facts.received },
    chatUrl: workspaceLink(me.workspace),
    leaderboard,
    features: await featureCardsOf(ctx, me, path),
    progression: await progressionOf(ctx, me),
    skillPoints: await skillPointsOf(ctx, me, path),
    coins: (await visibleWalletOf(ctx, me.member))?.balance ?? null,
    inventory: await inventoryShownTo(ctx, me.member),
    groups: await groupsShownTo(ctx, me.member),
    settings: await settingsShownTo(ctx, me, leaderboard),
    ...(await avatarShownOn(ctx, me.member, me.member)),
    ...(await bookSpreadShownTo(ctx, me.member)),
    ...(await albumOnProfileOf(ctx, me.member)),
  };
}

async function progressionOf(ctx: QueryContext, me: VerifiedMember): Promise<Progression | null> {
  if (!(await xpLevelsOnFor(ctx, me.member))) return null;
  const { level, xp, xpToNextLevel } = await progressionHomeOf(ctx, me.member);
  return { level, xp, levelStartsAt: xpToReach(level), nextLevelAt: xpToReach(level + 1), xpToNextLevel };
}
