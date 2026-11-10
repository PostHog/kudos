// The module map's skeleton of convex/feedback/replies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type ChatUserId, type Mention, type MessageRef } from "../engine/messageEvent.ts";
import { bonusLineValidator } from "../progression/progress.ts";
import { journeyStepValidator } from "../quests/step.ts";
import type { MovedQuest } from "../quests/progress.ts";
import type { ThoughtfulPacksGrantedEvent } from "../bus/events.ts";
import { type MemberId } from "../workspace/directory.ts";
import type { Line } from "./segments.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { OneReply } from "./oneReply.ts";
import type { SettingsFooter } from "./settingsFooter.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const questDoneValidator = z.union([
  z.strictObject({ kind: z.literal("journey"), step: journeyStepValidator, xp: zv.number(), coins: z.optional(zv.number()), heldRewardKey: z.optional(z.string()), hoggie: z.optional(z.literal(true)) }),
  z.strictObject({ kind: z.literal("weekly"), goal: z.string(), xp: zv.number(), coins: z.optional(zv.number()), heldRewardKey: z.optional(z.string()), hoggie: z.optional(z.literal(true)) }),]
);

export type QuestDone = z.infer<typeof questDoneValidator>;

export const gainsValidator = z.strictObject({
  xp: zv.number(),
  coins: z.optional(zv.number()),
  questsDone: z.optional(z.array(questDoneValidator)),
  bonus: z.optional(z.array(bonusLineValidator)),
});

type Gains = z.infer<typeof gainsValidator>;

export type SkipReason = "self" | "bot" | "not-a-member" | "group-or-broadcast" | "someone-elses-hype-emoji";
export type SkippedMention = { mention: Mention; reason: SkipReason };

export type Thanked = { user: ChatUserId; kudos: number };
export type Given = { recipients: Thanked[]; left: number; skipped: SkippedMention[] };
export type OverAllowance = { cost: number; recipients: number; perRecipient: number; left: number };
export type Invalid = { skipped: SkippedMention[] };

export type Reply =
  | { kind: "given"; outcome: Given; base: number }
  | { kind: "over-allowance"; outcome: OverAllowance; base: number }
  | { kind: "invalid"; outcome: Invalid }
  | { kind: "accepted-message-edited" };

export const questsWaitMs = 10_000;

export async function replyPrivately(ctx: MutationContext, ref: MessageRef, threadRoot: string | undefined, to: ChatUserId, reply: Reply): Promise<void> {
  throw notPorted("feedback.replies.replyPrivately");
}

export async function releaseSuccessReply(ctx: MutationContext, message: MessageRef, questsDone: QuestDone[], questsMoved: MovedQuest[]): Promise<void> {
  throw notPorted("feedback.replies.releaseSuccessReply");
}

export async function tellItemsInTheReply(ctx: MutationContext, { message, outcomes }: ThoughtfulPacksGrantedEvent): Promise<boolean> {
  throw notPorted("feedback.replies.tellItemsInTheReply");
}

export const releaseUnreleasedArgs = z.strictObject({ reply: zv.id("privateReplies") });
export async function releaseUnreleased(ctx: MutationContext, args: z.infer<typeof releaseUnreleasedArgs>): Promise<void> {
  throw notPorted("feedback.replies.releaseUnreleased");
}
export const releaseUnreleasedJob = mutationJob("feedback.replies.releaseUnreleased", releaseUnreleasedArgs, releaseUnreleased);

export const privateReplyArgs = z.strictObject({ reply: zv.id("privateReplies") });
export async function privateReply(ctx: QueryContext, args: z.infer<typeof privateReplyArgs>): Promise<null | { oneReply: OneReply; footer: null | SettingsFooter; asDirectMessage: boolean; _id: Id<"privateReplies">; _creationTime: number; threadRoot?: string; held?: true; workspace: string; conversation: string; message: string; lines: { text: string } | { mention: { user: string; kind: "person" } | { kind: "group"; group: string } | { kind: "broadcast"; range: string } } | { link: { url: string; label: string } }[][]; to: string } | { lines: { text: string } | { mention: { user: string; kind: "person" } | { kind: "group"; group: string } | { kind: "broadcast"; range: string } } | { link: { url: string; label: string } }[][]; oneReply: null; footer: null | SettingsFooter; asDirectMessage: boolean; _id: Id<"privateReplies">; _creationTime: number; threadRoot?: string; held?: true; workspace: string; conversation: string; message: string; to: string }> {
  throw notPorted("feedback.replies.privateReply");
}

export async function givenReplyOf(ctx: QueryContext, { workspace, conversation, message }: MessageRef): Promise<Doc<"privateReplies"> | null> {
  throw notPorted("feedback.replies.givenReplyOf");
}

export async function gainsLineWithoutQuestsOf(ctx: QueryContext, workspace: string, member: MemberId, { questsDone: _, ...gains }: Gains): Promise<Line | null> {
  throw notPorted("feedback.replies.gainsLineWithoutQuestsOf");
}

export function renderReply(reply: Exclude<Reply, { kind: "given" }>): Line[] {
  switch (reply.kind) {
    case "over-allowance":
      return [overAllowanceLine(reply.outcome, reply.base)];
    case "invalid":
      return [invalidLine(reply.outcome)];
    case "accepted-message-edited":
      return [[{ text: "This message already gave kudos, so your edit doesn't change them. To give more, send a new message." }]];
  }
}

function overAllowanceLine({ cost, recipients, perRecipient, left }: OverAllowance, base: number): Line {
  const breakdown = cost === recipients * perRecipient ? ` (${people(recipients)} × ${perRecipient} kudos emoji)` : "";
  return [
    {
      text: `This needs ${cost} kudos${breakdown}, but you have ${left} left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have ${base} again.`,
    },
  ];
}

function invalidLine({ skipped }: Invalid): Line {
  const reasons = skippedByReason(skipped).map(({ reason }) => reason);
  return [{ text: "Nobody in this message can receive kudos: " }, ...listOf(reasons), { text: ". Tag a teammate and edit the message to try again." }];
}

function skippedByReason(skipped: SkippedMention[]) {
  const byReason = new Map<string, { mentions: Mention[]; reason: Line }>();
  for (const { mention, reason } of skipped) {
    const line = reasonLine(reason, mention);
    const key = JSON.stringify(line);
    const group = byReason.get(key) ?? { mentions: [], reason: line };
    group.mentions.push(mention);
    byReason.set(key, group);
  }
  return [...byReason.values()];
}

function reasonLine(reason: SkipReason, mention: Mention): Line {
  switch (reason) {
    case "self":
      return [{ text: "you can't give kudos to yourself" }];
    case "bot":
      return [{ text: "bots don't receive kudos" }];
    case "not-a-member":
      return [{ mention }, { text: " isn't an active member of this workspace" }];
    case "group-or-broadcast":
      return [{ text: "`@here`, `@channel` and user groups don't receive kudos, so tag people individually" }];
    case "someone-elses-hype-emoji":
      return [{ text: "a hype emoji gives kudos only to its own person" }];
  }
}

function listOf(items: Line[]): Line {
  return items.flatMap((item, index) => {
    if (index === 0) return item;
    return [{ text: index === items.length - 1 ? " and " : ", " }, ...item];
  });
}

function people(count: number) {
  return count === 1 ? "1 person" : `${count} people`;
}
