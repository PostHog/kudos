// The module map's skeleton of convex/stickers/completionRecords.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { awardIdValidator } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { RecordedCompletion } from "./teamPages.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

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
  throw notPorted("stickers.completionRecords.completionsOf");
}

export async function teamsCompletedBy(ctx: QueryContext, member: MemberId): Promise<string[]> {
  throw notPorted("stickers.completionRecords.teamsCompletedBy");
}

export async function completionRecordsInOrder(ctx: QueryContext, member: MemberId): Promise<any> {
  throw notPorted("stickers.completionRecords.completionRecordsInOrder");
}
