// Books a Monday DM for each member who had a hug week last week, as today's convex/mondayDm/hugWeeks.ts: the hugs
// recap reaches members the quests sweep doesn't.
import { z } from "zod";
import { allowanceDay, weekOf } from "../engine/allowance.ts";
import { mondayAfter } from "../hugs/recap.ts";
import { hugWeeksSince } from "../hugs/weeks.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext } from "../operations.ts";
import { ensureMondayDmOn } from "./mondayDm.ts";

const weeksAPage = 100;
const weekMs = 7 * 24 * 60 * 60 * 1000;

export const ensureMondayDmsOfHugWeeksArgs = z.strictObject({ cursor: z.optional(z.string()) });
export async function ensureMondayDmsOfHugWeeks(ctx: MutationContext, { cursor }: z.infer<typeof ensureMondayDmsOfHugWeeksArgs>): Promise<void> {
  const { weeks, next } = await hugWeeksSince(ctx, lastWeek(ctx.now), { numItems: weeksAPage, cursor: cursor ?? null });
  for (const { member, week } of weeks) await ensureMondayDmOn(ctx, member, mondayAfter(week));
  if (next !== null) await ctx.jobs.enqueue(ensureMondayDmsOfHugWeeksJob, { cursor: next }, { after: 0 });
}
export const ensureMondayDmsOfHugWeeksJob = mutationJob("mondayDm.hugWeeks.ensureMondayDmsOfHugWeeks", ensureMondayDmsOfHugWeeksArgs, ensureMondayDmsOfHugWeeks);

function lastWeek(now: number) {
  return weekOf(allowanceDay(now - weekMs, undefined)).monday;
}
