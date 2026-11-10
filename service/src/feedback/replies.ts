// The private reply after a kudos message, as today's convex/feedback/replies.ts: what the giver gave, the kudos left,
// the mentions skipped and why, and what the kudos earned them. A reply that waits for its quests or its item is held,
// and released once they come or after `questsWaitMs`, whichever is first; it is delivered once released.
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { encodeStored, type Value } from "../db/codec.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { oneReplies, privateReplies } from "../db/schema/feedback.ts";
import { type ChatUserId, type Mention, type MessageRef } from "../engine/messageEvent.ts";
import { perkOf } from "../progression/tree.ts";
import { heldReplyOf } from "./heldReplies.ts";
import { bonusLineValidator, type BonusLine } from "../progression/progress.ts";
import { giverLinesOf, giverXpOf } from "../progression/progression.ts";
import { bonusGainsShownTo, questGainsShownTo, xpGainsShownTo } from "../progression/gainsView.ts";
import { xpLevelsShownTo } from "../progression/xpLevels.ts";
import { onTheMondayPath } from "../quests/flag.ts";
import { finishedStepGoalOf } from "../quests/onboarding.ts";
import { withoutFullStop } from "../quests/pool.ts";
import { journeyStepValidator } from "../quests/step.ts";
import type { MovedQuest } from "../quests/progress.ts";
import type { ThoughtfulPacksGrantedEvent } from "../bus/events.ts";
import { placeOf, wantsMessage } from "../messageSettings/messageSettings.ts";
import { deliverPrivateReplyJob } from "../slack/delivery.ts";
import { coinsShownTo, coinsVisibleTo } from "../wallet/visibility.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import { coinsPartOf } from "./coins.ts";
import { deepLinkOf, deepLinks, type DeepLink } from "./deepLinks.ts";
import type { Line, Segment } from "./segments.ts";
import { itemsAwaitedBy, oneReplyOf, oneReplyRowOf, oneReplyShownTo, repliedItemsOf, type OneReplyFacts, type OneReplyWritten, type RepliedItems } from "./oneReply.ts";
import { settingsFooterFor } from "./settingsFooter.ts";
import { hoggieRewardOf } from "./waitingHoggies.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export const questDoneValidator = z.union([
  z.strictObject({ kind: z.literal("journey"), step: journeyStepValidator, xp: zv.number(), coins: z.optional(zv.number()), heldRewardKey: z.optional(z.string()), hoggie: z.optional(z.literal(true)) }),
  z.strictObject({ kind: z.literal("weekly"), goal: z.string(), xp: zv.number(), coins: z.optional(zv.number()), heldRewardKey: z.optional(z.string()), hoggie: z.optional(z.literal(true)) }),
]);

export type QuestDone = z.infer<typeof questDoneValidator>;

type Shown<Done> = Done extends unknown ? Omit<Done, "heldRewardKey"> : never;

type QuestDoneShown = Shown<QuestDone>;

export const gainsValidator = z.strictObject({
  xp: zv.number(),
  coins: z.optional(zv.number()),
  questsDone: z.optional(z.array(questDoneValidator)),
  bonus: z.optional(z.array(bonusLineValidator)),
});

type Gains = z.infer<typeof gainsValidator>;

type GainsShown = Omit<Required<Gains>, "questsDone"> & { questsDone: QuestDoneShown[] };

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

type WrittenReply = Pick<Doc<"privateReplies">, "given" | "lines" | "gains" | "held">;

type Written = { reply: WrittenReply; oneReply: OneReplyWritten | null };

/** Writes the giver's private reply to a kudos message, and delivers it now or holds it for its quests and item. */
export async function replyPrivately(ctx: MutationContext, ref: MessageRef, threadRoot: string | undefined, to: ChatUserId, reply: Reply): Promise<void> {
  const { tx, newRow, jobs } = ctx;
  const giver = await lookup(ctx, ref.workspace, to);
  const member = giver?.kind === "member" ? giver.member : undefined;
  const { reply: written, oneReply } = reply.kind === "given" ? await successReplyWritten(ctx, member, ref, reply) : { reply: { lines: renderReply(reply) }, oneReply: null };
  if (saysNothing(written)) return;
  const row = { ...newRow(), workspace: ref.workspace, conversation: ref.conversation, message: ref.message, ...(threadRoot && { threadRoot }), to, ...written };
  await tx.insert(privateReplies).values(fromDocument(privateReplies, row) as typeof privateReplies.$inferInsert);
  const id = row._id as Id<"privateReplies">;
  if (oneReply !== null) await tx.insert(oneReplies).values(fromDocument(oneReplies, { ...newRow(), reply: id, ...oneReply }) as typeof oneReplies.$inferInsert);
  if (written.held === true) await jobs.enqueue(releaseUnreleasedJob, { reply: id }, { after: questsWaitMs });
  else await deliver(ctx, id);
}

async function successReplyWritten(ctx: MutationContext, member: MemberId | undefined, ref: MessageRef, reply: Extract<Reply, { kind: "given" }>): Promise<Written> {
  const lines = skippedLines(reply.outcome.skipped);
  if (member !== undefined && !(await wantsMessage(ctx, member, "kudos-reply"))) return { reply: { lines }, oneReply: null };
  const gains = await gainsWritten(ctx, member, ref, reply);
  const waitsForQuests = member !== undefined && (await onTheMondayPath(ctx, member));
  const written = { lines, gains, ...(waitsForQuests && { held: true as const }) };
  if (member === undefined || !(await oneReplyShownTo(ctx, member))) return { reply: { given: givenLine(reply.outcome, reply.base), ...written }, oneReply: null };
  const awaitsItems = await itemsAwaitedBy(ctx, member);
  const oneReply = { left: leftOf(reply.outcome, reply.base), ...(waitsForQuests && { awaitsQuests: true as const }), ...(awaitsItems && { awaitsItems: true as const }) };
  return { reply: { given: headlineOf(reply.outcome), ...written, ...(awaitsItems && { held: true as const }) }, oneReply };
}

function saysNothing({ given, lines }: WrittenReply) {
  return given === undefined && lines.length === 0;
}

async function gainsWritten(ctx: MutationContext, member: MemberId | undefined, ref: MessageRef, { outcome }: Extract<Reply, { kind: "given" }>): Promise<Gains> {
  const xp = giverXpOf(outcome.recipients);
  if (member === undefined) return { xp };
  await xpLevelsShownTo(ctx, member);
  await coinsShownTo(ctx, member);
  const { bonus, coins } = await giverLinesOf(ctx, member, ref);
  return { xp, ...(coins > 0 && { coins }), ...(bonus.length > 0 && { bonus }) };
}

/** Releases the message's held reply with the quests its kudos finished and moved. */
export async function releaseSuccessReply(ctx: MutationContext, message: MessageRef, questsDone: QuestDone[], questsMoved: MovedQuest[]): Promise<void> {
  const held = await heldReplyOf(ctx, message);
  if (held !== null) await release(ctx, held, questsDone, questsMoved);
}

/** Puts the items a kudos earned into its one reply, when the reply still waits for them; false when none waits. */
export async function tellItemsInTheReply(ctx: MutationContext, { message, outcomes }: ThoughtfulPacksGrantedEvent): Promise<boolean> {
  const reply = await givenReplyOf(ctx, message);
  const oneReply = reply === null ? null : await oneReplyRowOf(ctx, reply._id);
  if (reply === null || oneReply?.awaitsItems !== true) return false;
  await ctx.tx.update(oneReplies).set({ awaitsItems: null, items: encodeStored(repliedItemsOf(outcomes) as Value) }).where(eq(oneReplies._id, oneReply._id));
  if (oneReply.awaitsQuests !== true) await letGo(ctx, reply._id);
  return true;
}

export const releaseUnreleasedArgs = z.strictObject({ reply: zv.id("privateReplies") });
/** Releases a reply still held when its wait is over, without the quests or the item it waited for. */
export async function releaseUnreleased(ctx: MutationContext, { reply }: z.infer<typeof releaseUnreleasedArgs>): Promise<void> {
  const row = await privateReplyRow(ctx, reply);
  if (row?.held !== true) return;
  const oneReply = await oneReplyRowOf(ctx, reply);
  if (oneReply !== null) await ctx.tx.update(oneReplies).set({ awaitsQuests: null, awaitsItems: null }).where(eq(oneReplies._id, oneReply._id));
  await release(ctx, row, [], []);
}
export const releaseUnreleasedJob = mutationJob("feedback.replies.releaseUnreleased", releaseUnreleasedArgs, releaseUnreleased);

export const privateReplyArgs = z.strictObject({ reply: zv.id("privateReplies") });
/** The reply as its delivery sends it: the lines the giver may see, where it goes, and the one reply when it has one. */
export async function privateReply(ctx: QueryContext, { reply }: z.infer<typeof privateReplyArgs>) {
  const row = await privateReplyRow(ctx, reply);
  if (row === null) return null;
  const { given, gains, hint: _hint, questsDone: _, ...stored } = row;
  if (gains === undefined) return { ...stored, footer: null, asDirectMessage: false, oneReply: null };
  const member = await memberOf(ctx, row.workspace, row.to);
  const place = member === null ? "channel" : await placeOf(ctx, member, "kudos-reply");
  if (place === "none") return row.lines.length === 0 ? null : { ...stored, footer: null, asDirectMessage: false, oneReply: null };
  const shown = await gainsShownTo(ctx, row.workspace, member, gains);
  const delivered = { ...stored, footer: await settingsFooterFor(ctx, member), asDirectMessage: place === "dm" };
  const oneReply = await oneReplyRowOf(ctx, reply);
  if (oneReply !== null && member !== null && given !== undefined) {
    const questsMoved = await questsMovedShownTo(ctx, member, oneReply.questsMoved ?? []);
    const facts = oneReplyFactsOf({ headline: given, left: oneReply.left, skipped: row.lines, items: oneReply.items ?? null, questsMoved }, shown);
    return { ...delivered, oneReply: await oneReplyOf(ctx, row.workspace, member, facts) };
  }
  const extrasLine = extrasLineOf(shown, await deepLinkOf(ctx, row.workspace, deepLinks.successReply, "reply"));
  const lines = [...(given === undefined ? [] : [given]), ...row.lines, ...(extrasLine === null ? [] : [extrasLine]), ...hoggieQuestLinesOf(shown.questsDone)];
  return { ...delivered, lines, oneReply: null };
}

async function questsMovedShownTo(ctx: QueryContext, member: MemberId, questsMoved: MovedQuest[]): Promise<MovedQuest[]> {
  return questsMoved.length > 0 && (await questGainsShownTo(ctx, member)) ? questsMoved : [];
}

type WrittenFacts = { headline: Line; left: string; skipped: Line[]; items: RepliedItems | null; questsMoved: MovedQuest[] };

function oneReplyFactsOf({ headline, left, skipped, items, questsMoved }: WrittenFacts, shown: GainsShown): OneReplyFacts {
  return {
    headline,
    gains: extrasLineOf({ ...shown, questsDone: [] }, null),
    context: [[{ text: left }], ...skipped],
    questsDone: shown.questsDone.map((done) => ({ goal: withoutFullStop(goalOf(done)), reward: done.hoggie === true ? `+${done.xp} XP and an unidentified Hoggie` : questRewardOf(done) })),
    questsMoved,
    items,
  };
}

async function memberOf(ctx: QueryContext, workspace: string, to: ChatUserId): Promise<MemberId | null> {
  const person = await lookup(ctx, workspace, to);
  return person?.kind === "member" ? person.member : null;
}

/** The message's reply that carries gains, the first in `by_held_message` order: unheld before held, then oldest. */
export async function givenReplyOf({ tx }: QueryContext, { workspace, conversation, message }: MessageRef): Promise<Doc<"privateReplies"> | null> {
  const [row] = await tx
    .select()
    .from(privateReplies)
    .where(and(eq(privateReplies.workspace, workspace), eq(privateReplies.conversation, conversation), eq(privateReplies.message, message), isNotNull(privateReplies.gains)))
    .orderBy(sql`${privateReplies.held} asc nulls first`, asc(privateReplies._creationTime), asc(privateReplies._id))
    .limit(1);
  return row === undefined ? null : toDocument<Doc<"privateReplies">>(privateReplies, row);
}

export async function gainsLineWithoutQuestsOf(ctx: QueryContext, workspace: string, member: MemberId, { questsDone: _, ...gains }: Gains): Promise<Line | null> {
  return extrasLineOf(await gainsShownTo(ctx, workspace, member, gains), null);
}

async function release(ctx: MutationContext, { _id, gains }: Doc<"privateReplies">, questsDone: QuestDone[], questsMoved: MovedQuest[]) {
  const { tx } = ctx;
  if (questsDone.length > 0) await tx.update(privateReplies).set({ gains: encodeStored({ ...gains, xp: gains?.xp ?? 0, questsDone } as Value) }).where(eq(privateReplies._id, _id));
  const oneReply = await oneReplyRowOf(ctx, _id);
  if (oneReply !== null) await tx.update(oneReplies).set({ awaitsQuests: null, ...(questsMoved.length > 0 && { questsMoved: encodeStored(questsMoved as Value) }) }).where(eq(oneReplies._id, oneReply._id));
  if (oneReply?.awaitsItems !== true) await letGo(ctx, _id);
}

async function letGo(ctx: MutationContext, reply: Id<"privateReplies">) {
  await ctx.tx.update(privateReplies).set({ held: null }).where(eq(privateReplies._id, reply));
  await deliver(ctx, reply);
}

async function deliver({ jobs }: MutationContext, reply: Id<"privateReplies">) {
  await jobs.enqueue(deliverPrivateReplyJob, { reply });
}

async function privateReplyRow({ tx }: QueryContext, reply: Id<"privateReplies">): Promise<Doc<"privateReplies"> | null> {
  const [row] = await tx.select().from(privateReplies).where(eq(privateReplies._id, reply));
  return row === undefined ? null : toDocument<Doc<"privateReplies">>(privateReplies, row);
}

async function gainsShownTo(ctx: QueryContext, workspace: string, member: MemberId | null, { xp, coins = 0, questsDone = [], bonus = [] }: Gains): Promise<GainsShown> {
  const coinsEarned = coins > 0 || questsDone.some((done) => (done.coins ?? 0) > 0);
  const coinsVisible = coinsEarned && (await areCoinsVisibleTo(ctx, member));
  return {
    xp: (await xpGainsShownTo(ctx, workspace, member)) ? xp : 0,
    coins: coinsVisible ? coins : 0,
    questsDone: questsDone.length > 0 && (await questGainsShownTo(ctx, member)) ? questsDone.map(withoutHeldRewardKey).map((done) => (coinsVisible ? done : withoutCoins(done))) : [],
    bonus: bonus.length > 0 && (await bonusGainsShownTo(ctx, workspace, member)) ? bonus : [],
  };
}

function withoutHeldRewardKey({ heldRewardKey: _, ...done }: QuestDone): QuestDoneShown {
  return done;
}

async function areCoinsVisibleTo(ctx: QueryContext, member: MemberId | null) {
  return member !== null && (await coinsVisibleTo(ctx, member));
}

function extrasLineOf({ xp, coins, questsDone, bonus }: GainsShown, link: DeepLink | null): Line | null {
  const parts: Line[] = [
    ...(xp > 0 ? [[{ text: `+${xp} XP` }]] : []),
    ...(coins > 0 ? [[{ text: coinsPartOf(coins) }]] : []),
    ...questsDoneParts(questsDone),
    ...bonusParts(bonus),
    ...(link === null ? [] : [[{ link }]]),
  ];
  return parts.length === 0 ? null : parts.flatMap((part, index) => (index === 0 ? part : [{ text: " · " }, ...part]));
}

function bonusParts(bonus: BonusLine[]): Line[] {
  return bonus.map(({ source, xp }) => [{ text: `${perkOf(source).name} bonus (+${xp} XP)` }]);
}

function withoutCoins({ coins: _, ...done }: QuestDoneShown): QuestDoneShown {
  return done;
}

function questsDoneParts(questsDone: QuestDoneShown[]): Line[] {
  return questsDone.filter(({ hoggie }) => hoggie !== true).map((done) => [{ text: `Quest done: ${withoutFullStop(goalOf(done))} (${questRewardOf(done)})` }]);
}

function hoggieQuestLinesOf(questsDone: QuestDoneShown[]): Line[] {
  return questsDone.filter(({ hoggie }) => hoggie === true).map((done) => [{ text: `Quest done: ${withoutFullStop(goalOf(done))} · ${hoggieRewardOf(done.xp)}` }]);
}

function questRewardOf({ xp, coins = 0 }: QuestDoneShown) {
  return coins > 0 ? `+${xp} XP, ${coinsPartOf(coins)}` : `+${xp} XP`;
}

function goalOf(done: QuestDoneShown) {
  if (done.kind === "weekly") return done.goal;
  return finishedStepGoalOf(done.step, done.hoggie === true);
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

function givenLine(given: Given, base: number): Line {
  const whatIsLeft = given.left > 0 ? `You have ${given.left} kudos left today.` : lastKudosOf(base);
  return [...headlineOf(given), { text: `. ${whatIsLeft}` }];
}

function headlineOf({ recipients }: Given): Line {
  return [...listOf([...byKudos(recipients)].map(([kudos, users]) => [...listOf(users.map((user) => [person(user)])), { text: ` got ${kudos} kudos` }])), { text: " from you" }];
}

function byKudos(recipients: Thanked[]) {
  const grouped = new Map<number, ChatUserId[]>();
  for (const { user, kudos } of recipients) grouped.set(kudos, [...(grouped.get(kudos) ?? []), user]);
  return grouped;
}

function leftOf({ left }: Given, base: number) {
  return left > 0 ? `${left} kudos left today` : lastKudosOf(base);
}

function lastKudosOf(base: number) {
  return `That was your last kudos for today, and you'll have ${base} more at midnight.`;
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

function skippedLines(skipped: SkippedMention[]): Line[] {
  return skippedByReason(skipped).map(({ mentions, reason }) => [{ text: "I skipped " }, ...listOf(mentions.map((mention) => [{ mention }])), { text: ": " }, ...reason, { text: "." }]);
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

function person(user: ChatUserId): Segment {
  return { mention: { kind: "person", user } };
}

function people(count: number) {
  return count === 1 ? "1 person" : `${count} people`;
}
