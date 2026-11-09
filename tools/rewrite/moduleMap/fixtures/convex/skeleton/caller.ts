import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

// What a cron table or the bus holds: references the scheduler runs later.
export const scheduled = [internal.skeleton.awards.sweepAwards];

export const kickOff = internalAction({
  args: {},
  handler: async (ctx) => {
    const member = await ctx.runQuery(internal.skeleton.awards.memberOf, { member: "m" as never });
    if (member) await ctx.runMutation(internal.skeleton.awards.recordAward, { member: member._id, award: "first" });
  },
});
