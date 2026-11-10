// The module map's skeleton of convex/quests/finishes.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { messageRefValidator } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { journeyQuestOfRewardKey, weeklyQuestOfRewardKey } from "./crates.ts";
import { isPaidOnTheMondayPath } from "./mondayCatalogue.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const questFinishValidator = z.strictObject({
  member: zv.id("members"),
  key: z.string(),
  xp: zv.number(),
  catalogueVersion: z.string(),
  at: zv.number(),
  cause: z.optional(messageRefValidator),
});

export type QuestFinish = z.infer<typeof questFinishValidator>;

export function questFinishOf(ctx: QueryContext, member: MemberId, key: string): Promise<null | Doc<"questFinishes">> {
  throw notPorted("quests.finishes.questFinishOf");
}

export async function recordQuestFinish(ctx: MutationContext, finish: QuestFinish): Promise<"recorded" | "already recorded"> {
  throw notPorted("quests.finishes.recordQuestFinish");
}

export function belongsInTheFinishRecord({ key, catalogueVersion }: Pick<QuestFinish, "key" | "catalogueVersion">): boolean {
  return journeyQuestOfRewardKey(key) !== null || (isPaidOnTheMondayPath({ catalogueVersion }) && weeklyQuestOfRewardKey(key) !== null);
}
