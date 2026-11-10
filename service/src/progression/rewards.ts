// Reward records: XP and coins paid for something other than a kudos, one per member and key, written once.
// Today's convex/progression/rewards.ts over the service's transaction.
import { and, eq, gte, lt } from "drizzle-orm";
import { messageRefValidator, type MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Page } from "../db/page.ts";
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

/** One page of every reward, in creation order; the cursor is the last document's place, opaque to the caller. */
export async function rewardsPage(ctx: QueryContext, cursor: string | null, numItems: number): Promise<Page<Doc<"rewardRecords">>> {
  const after = cursor === null ? undefined : cursorPlace(cursor);
  const rows = await ctx.tx
    .select()
    .from(rewardRecords)
    .where(after && byCreation.after(after))
    .orderBy(...byCreation.orderBy())
    .limit(numItems + 1);
  const page = rows.slice(0, numItems).map(asDocument);
  const last = page.at(-1);
  return { page, isDone: rows.length <= numItems, continueCursor: last ? placeCursor(last) : (cursor ?? placeCursor(null)) };
}

// A cursor is the last document's `_creationTime` and `_id`, the default order's keys; the first page's end, when it is
// empty, is the start.
function placeCursor(document: Pick<Doc<"rewardRecords">, "_creationTime" | "_id"> | null): string {
  return Buffer.from(JSON.stringify(document === null ? [] : [document._creationTime, document._id])).toString("base64url");
}

function cursorPlace(cursor: string): { _creationTime: number; _id: string } | undefined {
  const keys: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
  if (!Array.isArray(keys)) throw new Error("Not a cursor of rewardsPage");
  if (keys.length === 0) return undefined;
  const [_creationTime, _id] = keys;
  if (typeof _creationTime !== "number" || typeof _id !== "string") throw new Error("Not a cursor of rewardsPage");
  return { _creationTime, _id };
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
