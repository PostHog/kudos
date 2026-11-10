// Reward records: XP and coins paid for something other than a kudos, one per member and key, written once.
// Today's convex/progression/rewards.ts over the service's transaction.
import { and, eq, gte, lt } from "drizzle-orm";
import { messageRefValidator, type MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import { paginate, type Page } from "../db/page.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { rewardRecords } from "../db/schema/index.ts";

export const rewardRecordValidator = z.strictObject({
  member: zv.id("members"),
  key: z.string(),
  xp: zv.number(),
  coins: zv.number(),
  item: z.union([z.string(), z.null()]),
  catalogueVersion: z.string(),
  at: zv.number(),
  cause: z.optional(messageRefValidator),
  held: z.optional(z.literal(true)),
});

export type RewardRecord = z.infer<typeof rewardRecordValidator>;

const standingWithCoinsValidator = z.strictObject({ xp: zv.number(), level: zv.number(), coins: zv.number(), skillPoints: zv.number() });

export const appliedRewardValidator = z.strictObject({ xp: zv.number(), coins: zv.number(), from: standingWithCoinsValidator, to: standingWithCoinsValidator });

export type AppliedReward = z.infer<typeof appliedRewardValidator>;

export type StandingWithCoins = AppliedReward["from"];

export async function insertReward(ctx: MutationContext, reward: RewardRecord): Promise<void> {
  await ctx.tx.insert(rewardRecords).values(fromDocument(rewardRecords, { ...ctx.newRow(), ...reward }) as typeof rewardRecords.$inferInsert);
}

const byMemberKey = indexOrder(rewardRecords, ["member", "key"]);
const byMemberCause = indexOrder(rewardRecords, ["member", "cause$workspace", "cause$conversation", "cause$message"]);
const byCreation = indexOrder(rewardRecords, []);

const asDocument = (row: Record<string, unknown>) => toDocument<Doc<"rewardRecords">>(rewardRecords, row);

/** The member's reward under the key, or `null`; two under one key fail, as `.unique()` did. */
export async function rewardOf(ctx: QueryContext, member: MemberId, key: string): Promise<null | Doc<"rewardRecords">> {
  const rows = await ctx.tx
    .select()
    .from(rewardRecords)
    .where(and(eq(rewardRecords.member, member), eq(rewardRecords.key, key)))
    .orderBy(...byMemberKey.orderBy())
    .limit(2);
  if (rows.length > 1) throw new Error(`The member has more than one reward under ${key}`);
  return rows[0] ? asDocument(rows[0]) : null;
}

/** One page of every reward, in creation order, through the service's shared keyset paging. */
export function rewardsPage(ctx: QueryContext, cursor: string | null, numItems: number): Promise<Page<Doc<"rewardRecords">>> {
  return paginate(ctx.tx, { table: rewardRecords, order: byCreation }, { cursor, numItems });
}

/** Every reward of the member whose key starts with the prefix, in key order. */
export async function rewardsKeyedFrom(ctx: QueryContext, member: MemberId, keyPrefix: string): Promise<Doc<"rewardRecords">[]> {
  const rows = await ctx.tx
    .select()
    .from(rewardRecords)
    .where(and(eq(rewardRecords.member, member), gte(rewardRecords.key, keyPrefix), lt(rewardRecords.key, `${keyPrefix}\uffff`)))
    .orderBy(...byMemberKey.orderBy());
  return rows.map(asDocument);
}

export async function rewardsCausedBy(ctx: QueryContext, member: MemberId, { workspace, conversation, message }: MessageRef): Promise<Doc<"rewardRecords">[]> {
  const rows = await ctx.tx
    .select()
    .from(rewardRecords)
    .where(and(eq(rewardRecords.member, member), eq(rewardRecords.cause$workspace, workspace), eq(rewardRecords.cause$conversation, conversation), eq(rewardRecords.cause$message, message)))
    .orderBy(...byMemberCause.orderBy());
  return rows.map(asDocument);
}
