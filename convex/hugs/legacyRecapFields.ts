import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

// One page of hug weeks a call, run by hand until `next` is null; the schema drops these fields once none is left.
export const clearLegacyRecapFields = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: v.object({ cleared: v.number(), next: v.union(v.string(), v.null()) }),
  handler: async (ctx, { cursor, numItems }) => {
    const { page, isDone, continueCursor } = await ctx.db.query("hugWeeks").paginate({ cursor, numItems });
    let cleared = 0;
    for (const { _id, _creationTime, recap, tries, dueAt, ...kept } of page) {
      if (recap === undefined && tries === undefined && dueAt === undefined) continue;
      await ctx.db.replace(_id, kept);
      cleared += 1;
    }
    return { cleared, next: isDone ? null : continueCursor };
  },
});
