// The hype nudge a Monday DM carries under its quests, as today's convex/mondayDm/hypeNudge.ts: the first person
// waiting on the member's hype, for members the hype-nudge flag decides in, and the line kept with the DM so a later
// redraw of the message shows the same one.
import { eq } from "drizzle-orm";
import { nudgesFor } from "../album/hypeReactions.ts";
import { exposedApart, memberDecision, type Flag } from "../analytics/flags.ts";
import type { Id } from "../db/columns.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import type { Doc } from "../db/schema/index.ts";
import { mondayDmNudges } from "../db/schema/mondayDm.ts";
import { hypeNudgeLineOf } from "../feedback/hypeNudge.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";

export const hypeNudgeFlag = { key: "hype-nudge", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function hypeNudgeFor(ctx: MutationContext, member: MemberId): Promise<string | null> {
  const [nudge] = await nudgesFor(ctx, member, 1);
  if (nudge === undefined || !(await isNudgedWithExposure(ctx, member))) return null;
  return hypeNudgeLineOf(ctx, nudge);
}

async function isNudgedWithExposure(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const nudged = await memberDecision(ctx, hypeNudgeFlag, member);
  await exposedApart(ctx, hypeNudgeFlag, member, nudged);
  return nudged;
}

export async function keepHypeNudge(ctx: MutationContext, dm: Id<"mondayDms">, line: string | null): Promise<void> {
  const kept = await keptNudgeOf(ctx.tx, dm);
  if (kept !== null) await ctx.tx.delete(mondayDmNudges).where(eq(mondayDmNudges._id, kept._id));
  if (line !== null) await ctx.tx.insert(mondayDmNudges).values(fromDocument(mondayDmNudges, { ...ctx.newRow(), dm, line }) as typeof mondayDmNudges.$inferInsert);
}

export async function hypeNudgeOf(ctx: QueryContext, dm: Id<"mondayDms">): Promise<string | null> {
  return (await keptNudgeOf(ctx.tx, dm))?.line ?? null;
}

// One nudge per DM, as Convex's `unique()` asked.
async function keptNudgeOf(tx: Transaction, dm: Id<"mondayDms">): Promise<Doc<"mondayDmNudges"> | null> {
  const rows = await tx.select().from(mondayDmNudges).where(eq(mondayDmNudges.dm, dm)).limit(2);
  if (rows.length > 1) throw new Error(`More than one hype nudge is kept for the Monday DM ${dm}`);
  return rows[0] ? toDocument<Doc<"mondayDmNudges">>(mondayDmNudges, rows[0]) : null;
}
