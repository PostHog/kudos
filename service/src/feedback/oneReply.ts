// The module map's skeleton of convex/feedback/oneReply.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { grantOutcomeValidator } from "../album/records.ts";
import { type Flag } from "../analytics/flags.ts";
import type { ChecklistItem } from "../mondayDm/questsCopy.ts";
import { movedQuestValidator, type MovedQuest } from "../quests/progress.ts";
import type { MemberId } from "../workspace/directory.ts";
import { type ReplyLinks } from "./dmLinks.ts";
import { mostRecipientsNamed } from "./recipientNames.ts";
import type { Line } from "./segments.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const oneReplyFlag = { key: "one-reply", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const repliedItemsValidator = z.strictObject({ outcomes: z.array(z.strictObject({ recipient: zv.id("members"), outcome: grantOutcomeValidator })), more: zv.number() });

export type RepliedItems = z.infer<typeof repliedItemsValidator>;

export const oneReplyValidator = z.strictObject({
  reply: zv.id("privateReplies"),
  left: z.string(),
  awaitsQuests: z.optional(z.literal(true)),
  awaitsItems: z.optional(z.literal(true)),
  items: z.optional(repliedItemsValidator),
  questsMoved: z.optional(z.array(movedQuestValidator)),
});

export type OneReplyWritten = Omit<z.infer<typeof oneReplyValidator>, "reply">;

export type QuestFinished = { goal: string; reward: string };

export type OneReplyButton = { label: string; url: string; destination: keyof ReplyLinks; primary: boolean };

export type OneReplyItem = { first: string; comesNextWeek: boolean };

export type OneReply = { headline: Line; gains: Line | null; context: Line[]; quests: ChecklistItem[]; items: OneReplyItem[]; moreItems: number; buttons: OneReplyButton[] };

export type OneReplyFacts = Omit<OneReply, "quests" | "items" | "moreItems" | "buttons"> & { questsDone: QuestFinished[]; questsMoved: MovedQuest[]; items: RepliedItems | null };

export async function oneReplyShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("feedback.oneReply.oneReplyShownTo");
}

export function oneReplyRowOf(ctx: QueryContext, reply: Id<"privateReplies">): Promise<Doc<"oneReplies"> | null> {
  throw notPorted("feedback.oneReply.oneReplyRowOf");
}

export async function itemsAwaitedBy(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("feedback.oneReply.itemsAwaitedBy");
}

export function repliedItemsOf(outcomes: RepliedItems["outcomes"]): RepliedItems {
  return { outcomes: outcomes.slice(0, mostRecipientsNamed), more: Math.max(outcomes.length - mostRecipientsNamed, 0) };
}

export async function oneReplyOf(ctx: QueryContext, workspace: string, member: MemberId, { questsDone, questsMoved, items, ...facts }: OneReplyFacts): Promise<OneReply> {
  throw notPorted("feedback.oneReply.oneReplyOf");
}
