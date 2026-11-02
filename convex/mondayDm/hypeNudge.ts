import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { nudgesFor } from "../album/hypeReactions";
import { exposedApart, memberDecision, type Flag } from "../analytics/flags";
import { hypeNudgeLineOf } from "../feedback/hypeNudge";
import type { MemberId } from "../workspace/directory";

export const hypeNudgeFlag = { key: "hype-nudge", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function hypeNudgeFor(ctx: MutationCtx, member: MemberId): Promise<string | null> {
  const [nudge] = await nudgesFor(ctx, member, 1);
  if (nudge === undefined || !(await isNudgedWithExposure(ctx, member))) return null;
  return hypeNudgeLineOf(ctx, nudge);
}

async function isNudgedWithExposure(ctx: MutationCtx, member: MemberId): Promise<boolean> {
  const nudged = await memberDecision(ctx, hypeNudgeFlag, member);
  await exposedApart(ctx, hypeNudgeFlag, member, nudged);
  return nudged;
}

export async function keepHypeNudge(ctx: MutationCtx, dm: Id<"mondayDms">, line: string | null): Promise<void> {
  const kept = await keptNudgeOf(ctx, dm);
  if (kept !== null) await ctx.db.delete(kept._id);
  if (line !== null) await ctx.db.insert("mondayDmNudges", { dm, line });
}

export async function hypeNudgeOf(ctx: QueryCtx, dm: Id<"mondayDms">): Promise<string | null> {
  return (await keptNudgeOf(ctx, dm))?.line ?? null;
}

function keptNudgeOf(ctx: QueryCtx, dm: Id<"mondayDms">) {
  return ctx.db
    .query("mondayDmNudges")
    .withIndex("by_dm", (q) => q.eq("dm", dm))
    .unique();
}
