import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { allowanceDay, weekOf } from "../engine/allowance";
import { mondayAfter } from "../hugs/recap";
import { hugWeeksSince } from "../hugs/weeks";
import { ensureMondayDmOn } from "./mondayDm";

const weeksAPage = 100;
const weekMs = 7 * 24 * 60 * 60 * 1000;

export const ensureMondayDmsOfHugWeeks = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const { weeks, next } = await hugWeeksSince(ctx, lastWeek(), { numItems: weeksAPage, cursor: cursor ?? null });
    for (const { member, week } of weeks) await ensureMondayDmOn(ctx, member, mondayAfter(week));
    if (next !== null) await ctx.scheduler.runAfter(0, internal.mondayDm.hugWeeks.ensureMondayDmsOfHugWeeks, { cursor: next });
  },
});

function lastWeek() {
  return weekOf(allowanceDay(Date.now() - weekMs, undefined)).monday;
}
