// The module map's skeleton of convex/album/items/turn.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type HypeEmoji } from "../earnedEmojis.ts";
import type { TeamSticker } from "../records.ts";
import { type PageOwner } from "../teamPages.ts";
import { type Drop } from "../hoggies/drops.ts";
import type { AppliedReward } from "../../progression/rewards.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { UnlockedTier } from "../milestoneXp.ts";
import type { Id } from "../../db/columns.ts";
import type { MutationContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export type TurnedFace = { kind: "hoggie"; drop: Drop } | { kind: "sticker"; person: MemberId; isNew: boolean };

export type LandingPage = { kind: "hoggies" } | { kind: "team"; team: string } | { kind: "person"; person: MemberId };

export type UnlockedHype = HypeEmoji & { from: string };

export type Unlocked = { teamStickers: TeamSticker[]; hype: UnlockedHype | null; milestones: UnlockedTier[] };

export type Turned = { face: TurnedFace; applied: AppliedReward | null; page: LandingPage; unlocked: Unlocked; again: boolean };

export async function turn(ctx: MutationContext, owner: PageOwner, item: Id<"items">, at: number): Promise<Turned | null> {
  throw notPorted("album.items.turn.turn");
}
