// A member's recorded level-ups: when they first reached a level, and the level before one.
// Today's convex/unlocks/levelUps.ts over the service's transaction.
import { and, eq, gte, lt } from "drizzle-orm";
import { indexOrder } from "../db/indexOrder.ts";
import { levelUps } from "../db/schema/index.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

const byMemberLevel = indexOrder(levelUps, ["member", "level"]);

export async function levelFirstReachedAt(ctx: QueryContext, member: MemberId, level: number): Promise<number | null> {
  const [reached] = await ctx.tx.select({ at: levelUps.at }).from(levelUps).where(and(eq(levelUps.member, member), gte(levelUps.level, level))).orderBy(...byMemberLevel.orderBy()).limit(1);
  return reached?.at ?? null;
}

export async function levelUpAt(ctx: QueryContext, member: MemberId, level: number): Promise<number | null> {
  return (await levelUpRowOf(ctx, member, level))?.at ?? null;
}

export async function levelUpRecordedAt(ctx: QueryContext, member: MemberId, level: number): Promise<number | null> {
  return (await levelUpRowOf(ctx, member, level))?._creationTime ?? null;
}

async function levelUpRowOf(ctx: QueryContext, member: MemberId, level: number) {
  const [row] = await ctx.tx.select({ at: levelUps.at, _creationTime: levelUps._creationTime }).from(levelUps).where(and(eq(levelUps.member, member), eq(levelUps.level, level))).orderBy(...byMemberLevel.orderBy()).limit(1);
  return row ?? null;
}

export async function levelUpBefore(ctx: QueryContext, member: MemberId, level: number): Promise<number> {
  const [previous] = await ctx.tx.select({ level: levelUps.level }).from(levelUps).where(and(eq(levelUps.member, member), lt(levelUps.level, level))).orderBy(...byMemberLevel.orderBy("desc")).limit(1);
  return previous?.level ?? 1;
}
