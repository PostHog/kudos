// Which awards Quests has judged: a marker per award once its quests have moved, which the success reply waits on.
// Today's convex/quests/judged.ts over the service's transaction.
import { eq } from "drizzle-orm";
import { indexOrder } from "../db/indexOrder.ts";
import { questsJudged } from "../db/schema/index.ts";
import { awardIdValidator, type AwardId } from "../engine/awards.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";

export const questsJudgedValidator = z.strictObject({ award: awardIdValidator });

const byAward = indexOrder(questsJudged, ["award"]);

export async function judgeQuestsOf(ctx: MutationContext, awards: { award: AwardId }[]): Promise<void> {
  for (const { award } of awards) if (!(await isJudged(ctx, award))) await ctx.tx.insert(questsJudged).values({ ...ctx.newRow(), award });
}

export async function questsJudgedFor(ctx: QueryContext, awards: { award: AwardId }[]): Promise<boolean> {
  for (const { award } of awards) if (!(await isJudged(ctx, award))) return false;
  return true;
}

/** Reads the award's first marker, as `.first()` did. */
async function isJudged(ctx: QueryContext, award: AwardId): Promise<boolean> {
  const [marker] = await ctx.tx.select({ _id: questsJudged._id }).from(questsJudged).where(eq(questsJudged.award, award)).orderBy(...byAward.orderBy()).limit(1);
  return marker !== undefined;
}
