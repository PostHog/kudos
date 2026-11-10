// What a member progressed since a moment, as today's convex/website/progressed.ts: their two-day and Monday quests'
// moves, then their kudos-given milestones', each read over at most `mostAwardsRead` awards.
import { kudosGivenMovedSince } from "../album/milestones.ts";
import { twoDaysMovedSince } from "../quests/onboarding.ts";
import type { Moved } from "../quests/progress.ts";
import { mondayQuestsMovedSince } from "../quests/weekly.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export type Progressed = Moved & { kind: "quest" | "milestone" };

const mostAwardsRead = 50;

export async function progressedSince(ctx: QueryContext, member: MemberId, since: number, until: number): Promise<Progressed[]> {
  const read = { since, until, mostAwards: mostAwardsRead };
  const quests = [...(await twoDaysMovedSince(ctx, member, read)), ...(await mondayQuestsMovedSince(ctx, member, read))];
  const milestones = await kudosGivenMovedSince(ctx, member, read);
  return [...quests.map((moved) => ({ kind: "quest" as const, ...moved })), ...milestones.map((moved) => ({ kind: "milestone" as const, ...moved }))];
}
