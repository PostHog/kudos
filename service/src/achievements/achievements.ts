// The module map's skeleton of convex/achievements/achievements.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { kudosGivenEventValidator } from "../bus/events.ts";
import type { CompletedTeam } from "../feedback/notify.ts";
import type { AwardId } from "../engine/awards.ts";
import type { CatalogueItem } from "../store/catalogue.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Completion } from "./counting.ts";
import { tierRefValidator, type LadderId, type TierId } from "./ladders.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type TierItemFacts = Pick<CatalogueItem, "item" | "name" | "emoji" | "art">;

export type RewardFacts =
  | { kind: "hedgehog"; reward: string }
  | { kind: "kudosEmoji"; reward: string; item: TierItemFacts; recordedAt?: number | null }
  | { kind: "coins"; reward: string; coins: number; recordedAt?: number | null };

export type TierFacts = { tier: TierId; name: string; count: number; earnedAt: number | null; catalogueVersion: string | null; rewards: RewardFacts[] };

export type LadderFacts = { ladder: LadderId; name: string; counts: string; count: number; tiers: TierFacts[]; next: TierId | null };

export type AchievementFacts = { ladders: LadderFacts[] };

const untoldValidator = z.array(z.strictObject({ member: zv.id("members"), earned: z.array(tierRefValidator) }));

export type CompletionsRecorded = { workspace: string; member: MemberId };

export const countKudosGivenArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()), untold: z.optional(untoldValidator) });
export async function countKudosGiven(ctx: MutationContext, args: z.infer<typeof countKudosGivenArgs>): Promise<void> {
  throw notPorted("achievements.achievements.countKudosGiven");
}
export const countKudosGivenJob = mutationJob("achievements.achievements.countKudosGiven", countKudosGivenArgs, countKudosGiven);

export type CompletedUnder = Map<AwardId, { at: number; teams: CompletedTeam[] }>;

export async function countTeamPagesCompleted(ctx: MutationContext, recorded: CompletionsRecorded, completions: Completion[], completed: CompletedUnder): Promise<void> {
  throw notPorted("achievements.achievements.countTeamPagesCompleted");
}

export async function achievementFactsOf(ctx: QueryContext, member: MemberId): Promise<AchievementFacts | null> {
  throw notPorted("achievements.achievements.achievementFactsOf");
}

export async function bookFactsOf(ctx: QueryContext, member: MemberId): Promise<AchievementFacts> {
  throw notPorted("achievements.achievements.bookFactsOf");
}
