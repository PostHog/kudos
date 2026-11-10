// The one reply, as today's convex/feedback/oneReply.ts: one private message after a kudos that shows what it gave, the
// quests it finished or moved, and the items it earned, behind the one-reply flag.
import { eq } from "drizzle-orm";
import { toDocument } from "../db/documents.ts";
import { oneReplies } from "../db/schema/feedback.ts";
import { grantOutcomeValidator } from "../album/records.ts";
import { exposed, memberDecision, type Flag } from "../analytics/flags.ts";
import { hiddenItemsShownTo } from "../album/items/flag.ts";
import { waitingCountOf, type WaitingCount } from "../album/items/ledger.ts";
import type { ChecklistItem } from "../mondayDm/questsCopy.ts";
import { movedQuestValidator, type MovedQuest } from "../quests/progress.ts";
import type { MemberId } from "../workspace/directory.ts";
import { albumSlackAppliesTo } from "./albumSlack.ts";
import { replyLinksFor, type ReplyLinks } from "./dmLinks.ts";
import { firstNameOf, mostRecipientsNamed } from "./recipientNames.ts";
import type { Line } from "./segments.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

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

const filled = "🟩";
const empty = "⬜";

/** Whether the member gets the one reply, recording that they saw the flag's answer. */
export async function oneReplyShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const shown = await memberDecision(ctx, oneReplyFlag, member);
  await exposed(ctx, oneReplyFlag, member, shown);
  return shown;
}

/** The one reply's row for a private reply; one at most, as Convex's `unique()` asked. */
export async function oneReplyRowOf({ tx }: QueryContext, reply: Id<"privateReplies">): Promise<Doc<"oneReplies"> | null> {
  const row = unique("oneReplies", await tx.select().from(oneReplies).where(eq(oneReplies.reply, reply)).limit(2));
  return row === null ? null : toDocument<Doc<"oneReplies">>(oneReplies, row);
}

export async function itemsAwaitedBy(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await albumSlackAppliesTo(ctx, member)) && (await hiddenItemsShownTo(ctx, member));
}

export function repliedItemsOf(outcomes: RepliedItems["outcomes"]): RepliedItems {
  return { outcomes: outcomes.slice(0, mostRecipientsNamed), more: Math.max(outcomes.length - mostRecipientsNamed, 0) };
}

/** The one reply as the member sees it: its quests as a checklist, its items by recipient, and its buttons. */
export async function oneReplyOf(ctx: QueryContext, workspace: string, member: MemberId, { questsDone, questsMoved, items, ...facts }: OneReplyFacts): Promise<OneReply> {
  const quests = [...questsDone.map(finishedItemOf), ...questsMoved.map(movedItemOf)];
  const waiting = (await hiddenItemsShownTo(ctx, member)) ? await waitingCountOf(ctx, member) : 0;
  const links = await replyLinksFor(ctx, workspace, member);
  return { ...facts, quests, items: items === null ? [] : await itemsOf(ctx, items), moreItems: items?.more ?? 0, buttons: links === null ? [] : buttonsOf(links, waiting, quests.length > 0) };
}

function finishedItemOf({ goal, reward }: QuestFinished): ChecklistItem {
  return { goal, mark: "done", progress: reward };
}

function movedItemOf({ goal, progress: { done, of, unit } }: MovedQuest): ChecklistItem {
  return { goal, mark: "next", progress: `${filled.repeat(done)}${empty.repeat(Math.max(of - done, 0))} ${done} of ${of} ${unit}` };
}

async function itemsOf(ctx: QueryContext, { outcomes }: RepliedItems): Promise<OneReplyItem[]> {
  const items: OneReplyItem[] = [];
  for (const { recipient, outcome } of outcomes) items.push({ first: await firstNameOf(ctx, recipient), comesNextWeek: outcome === "nextWeek" });
  return items;
}

function buttonsOf(links: ReplyLinks, waiting: WaitingCount, showsQuests: boolean): OneReplyButton[] {
  const next: OneReplyButton =
    waiting === 0
      ? { label: "See your progress", url: links.home, destination: "home", primary: true }
      : { label: waiting === 1 ? "Identify it on the website" : "Identify them on the website", url: links.book, destination: "book", primary: true };
  return showsQuests ? [next, { label: "See your quests", url: links.quests, destination: "quests", primary: false }] : [next];
}
