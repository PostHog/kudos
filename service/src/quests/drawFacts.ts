// The module map's skeleton of convex/quests/drawFacts.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import type { DrawFacts, HugDrawFacts } from "./pool.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function drawFactsOf(ctx: QueryContext, member: MemberId, at: number): Promise<DrawFacts> {
  throw notPorted("quests.drawFacts.drawFactsOf");
}

export async function factsAtTheStartOf(ctx: QueryContext, member: MemberId, weekStart: number): Promise<DrawFacts> {
  throw notPorted("quests.drawFacts.factsAtTheStartOf");
}

export async function hugDrawFactsOf(ctx: QueryContext, member: MemberId, at: number): Promise<HugDrawFacts> {
  throw notPorted("quests.drawFacts.hugDrawFactsOf");
}

export async function hugFactsAtTheStartOf(ctx: QueryContext, member: MemberId, weekStart: number): Promise<HugDrawFacts> {
  throw notPorted("quests.drawFacts.hugFactsAtTheStartOf");
}

export async function timeZoneOf(ctx: QueryContext, member: MemberId): Promise<undefined | string> {
  throw notPorted("quests.drawFacts.timeZoneOf");
}
