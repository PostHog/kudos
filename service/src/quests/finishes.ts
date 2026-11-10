// The record of finished Monday-path quests: one row per member and reward key, never written twice.
// Today's convex/quests/finishes.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { questFinishes } from "../db/schema/index.ts";
import { messageRefValidator } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { journeyQuestOfRewardKey, weeklyQuestOfRewardKey } from "./crates.ts";
import { isPaidOnTheMondayPath } from "./mondayCatalogue.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const questFinishValidator = z.strictObject({
  member: zv.id("members"),
  key: z.string(),
  xp: zv.number(),
  catalogueVersion: z.string(),
  at: zv.number(),
  cause: z.optional(messageRefValidator),
});

export type QuestFinish = z.infer<typeof questFinishValidator>;

const byMemberKey = indexOrder(questFinishes, ["member", "key"]);

/** The member's finish under this key, or `null`; two fail, as `.unique()` did. */
export async function questFinishOf(ctx: QueryContext, member: MemberId, key: string): Promise<null | Doc<"questFinishes">> {
  const rows = await ctx.tx
    .select()
    .from(questFinishes)
    .where(and(eq(questFinishes.member, member), eq(questFinishes.key, key)))
    .orderBy(...byMemberKey.orderBy())
    .limit(2);
  if (rows.length > 1) throw new Error("The member has more than one finish under one key");
  return rows[0] ? toDocument<Doc<"questFinishes">>(questFinishes, rows[0]) : null;
}

export async function recordQuestFinish(ctx: MutationContext, finish: QuestFinish): Promise<"recorded" | "already recorded"> {
  if ((await questFinishOf(ctx, finish.member, finish.key)) !== null) return "already recorded";
  await ctx.tx.insert(questFinishes).values(fromDocument(questFinishes, { ...ctx.newRow(), ...finish }) as typeof questFinishes.$inferInsert);
  return "recorded";
}

export function belongsInTheFinishRecord({ key, catalogueVersion }: Pick<QuestFinish, "key" | "catalogueVersion">): boolean {
  return journeyQuestOfRewardKey(key) !== null || (isPaidOnTheMondayPath({ catalogueVersion }) && weeklyQuestOfRewardKey(key) !== null);
}
