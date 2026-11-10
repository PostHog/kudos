// The team pages a member completed, as today's convex/stickers/completionRecords.ts, read in `by_member_team` order.
import { eq } from "drizzle-orm";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { teamPageCompletions, type Doc } from "../db/schema/index.ts";
import { awardIdValidator } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { RecordedCompletion } from "./teamPages.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { QueryContext } from "../operations.ts";

export const teamPageCompletionValidator = z.strictObject({
  member: zv.id("members"),
  team: z.string(),
  name: z.string(),
  crestImage: z.optional(z.string()),
  award: awardIdValidator,
  at: zv.number(),
  people: zv.number(),
  told: z.boolean(),
});

export const teamPageCheckValidator = z.strictObject({ member: zv.id("members"), at: zv.number(), finished: z.boolean() });

export type TeamPageCompletion = z.infer<typeof teamPageCompletionValidator>;

export async function completionsOf(ctx: QueryContext, member: MemberId): Promise<RecordedCompletion[]> {
  const completions = await completionRecordsOf(ctx, member);
  return completions.map(({ team, name, crestImage, at }) => ({ team, name, ...(crestImage !== undefined && { crestImage }), at }));
}

export async function teamsCompletedBy(ctx: QueryContext, member: MemberId): Promise<string[]> {
  return (await completionRecordsOf(ctx, member)).map(({ team }) => team);
}

export async function completionRecordsInOrder(ctx: QueryContext, member: MemberId): Promise<{ award: Id<"awards">; at: number; told: boolean }[]> {
  const completions = await completionRecordsOf(ctx, member);
  return completions.toSorted((first, second) => first._creationTime - second._creationTime).map(({ award, at, told }) => ({ award, at, told }));
}

// The member's completions in `by_member_team` order, as Convex collected them.
async function completionRecordsOf({ tx }: QueryContext, member: MemberId): Promise<Doc<"teamPageCompletions">[]> {
  const rows = await tx
    .select()
    .from(teamPageCompletions)
    .where(eq(teamPageCompletions.member, member))
    .orderBy(...indexOrder(teamPageCompletions, ["member", "team"]).orderBy());
  return rows.map((row) => toDocument<Doc<"teamPageCompletions">>(teamPageCompletions, row));
}
