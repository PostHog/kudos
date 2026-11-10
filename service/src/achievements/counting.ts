// The module map's skeleton of convex/achievements/counting.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { AwardId, AwardWithId, GivenAward } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { AwardLadderId, CompletionLadderId, LadderId, Tier, TierRef } from "./ladders.ts";
import type { BatchId } from "./replay.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Counting = { member: MemberId; ladder: LadderId };

export type AwardCounting = { member: MemberId; ladder: AwardLadderId };

export type CompletionCounting = { workspace: string; member: MemberId; ladder: CompletionLadderId };

export type Completion = { award: AwardId; at: number; told: boolean };

export type CompletionTier = { tier: TierRef; reaching: Completion };

export type CompletionsCounted = { changed: boolean; told: CompletionTier[] };

export type DatedAward = GivenAward & { at: number };

const givenBy = ({ giver }: AwardWithId) => giver;

const countedMember: Record<AwardLadderId, (award: AwardWithId) => MemberId> = {
  generosity: givenBy,
  recognition: ({ recipient }) => recipient,
  connections: givenBy,
  dependability: givenBy,
  applause: givenBy,
  seasons: givenBy,
  "old-friends": givenBy,
};

export function countingOf(ladder: AwardLadderId, award: AwardWithId): AwardCounting {
  return { member: countedMember[ladder](award), ladder };
}

export type Earning = { tiers: Tier[]; batch?: BatchId; hidden?: true };

export async function countAward(ctx: MutationContext, workspace: string, counting: AwardCounting, award: DatedAward, { tiers, batch, hidden }: Earning): Promise<TierRef[] | null> {
  throw notPorted("achievements.counting.countAward");
}

export async function countCompletions(ctx: MutationContext, { workspace, member, ladder }: CompletionCounting, completions: Completion[], { hidden }: Pick<Earning, "hidden">): Promise<CompletionsCounted> {
  throw notPorted("achievements.counting.countCompletions");
}

export async function awardReaching(ctx: QueryContext, { member, ladder }: AwardCounting, count: number): Promise<{ award: AwardId; at: number } | null> {
  throw notPorted("achievements.counting.awardReaching");
}

export async function countOf(ctx: QueryContext, counting: Counting): Promise<number> {
  throw notPorted("achievements.counting.countOf");
}
