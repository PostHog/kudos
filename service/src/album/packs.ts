// Thoughtful packs: a kudos earns its giver one pack per person thanked a week, holding that person's sticker when the
// giver has none of them yet, and the message's grants are told once, after the last recipient's. Today's
// convex/album/packs.ts over the service's transaction.
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { kudosGivenEventValidator, type KudosGivenEvent, type ThoughtfulPacksGrantedEvent } from "../bus/events.ts";
import { isSameMessage, type MessageRef } from "../engine/messageEvent.ts";
import type { CrateKey } from "./hoggies/crateKey.ts";
import { earnHoggieItem, kudosPackRarities } from "./hoggies/rarityCaps.ts";
import { earnItem } from "./items/ledger.ts";
import { givingWeekOf } from "../progression/progress.ts";
import type { MemberId } from "../workspace/directory.ts";
import { nameHypeEmojiOf } from "./emojiNames.ts";
import type { GrantOutcome } from "./records.ts";
import { inTheAlbumOf } from "./stickers.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { grantRecords, grantsTold, thoughtfulPacks, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export const recipientsPerMutation = 50;
export const mostWaitingPacksShown = 50;

export type WaitingPack = { pack: Id<"thoughtfulPacks">; person: MemberId; earnedAt: number };

export type Instants = { from: number; to: number };

export type GrantedKudos = { message: MessageRef; at: number; recipients: number };

type PackId = Id<"thoughtfulPacks">;

type Pack = Doc<"thoughtfulPacks">;

const byGiverOpenedAt = indexOrder(thoughtfulPacks, ["giver", "openedAt", "at"]);
const byGiverAt = indexOrder(thoughtfulPacks, ["giver", "at"]);
const byGiverRecipient = indexOrder(thoughtfulPacks, ["giver", "recipient"]);
const byGiverRecipientWeek = indexOrder(thoughtfulPacks, ["giver", "recipient", "week"]);
const byGiverRecipientSticker = indexOrder(thoughtfulPacks, ["giver", "recipient", "holdsSticker"]);
const recordsByMessageRecipient = indexOrder(grantRecords, ["message$workspace", "message$conversation", "message$message", "recipient"]);
const toldByMessage = indexOrder(grantsTold, ["message$workspace", "message$conversation", "message$message"]);
const toldByWorkspaceAt = indexOrder(grantsTold, ["message$workspace", "at"]);

const asPack = (row: Record<string, unknown>) => toDocument<Pack>(thoughtfulPacks, row);

export const grantThoughtfulPacksArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });
/** Grants the event's recipients from `from` on, 50 a job, and schedules the next 50. */
export async function grantThoughtfulPacks(ctx: MutationContext, { event, from = 0 }: z.infer<typeof grantThoughtfulPacksArgs>): Promise<null> {
  const recipients = recipientsOf(event);
  const next = from + recipientsPerMutation;
  for (const recipient of recipients.slice(from, next)) await grantTo(ctx, event, recipient);
  await tellOnceEveryoneIsGranted(ctx, event, recipients);
  if (next < recipients.length) await ctx.jobs.enqueue(grantThoughtfulPacksJob, { event, from: next });
  return null;
}
export const grantThoughtfulPacksJob = mutationJob("album.packs.grantThoughtfulPacks", grantThoughtfulPacksArgs, grantThoughtfulPacks);

export async function waitingPacksOf(ctx: QueryContext, member: MemberId): Promise<{ packs: WaitingPack[]; more: boolean }> {
  const oldestFirst = await ctx.tx
    .select()
    .from(thoughtfulPacks)
    .where(and(eq(thoughtfulPacks.giver, member), isNull(thoughtfulPacks.openedAt)))
    .orderBy(...byGiverOpenedAt.orderBy())
    .limit(mostWaitingPacksShown + 1);
  const packs = oldestFirst.slice(0, mostWaitingPacksShown).map(({ _id, recipient, at }) => ({ pack: _id as PackId, person: recipient, earnedAt: at }));
  return { packs, more: oldestFirst.length > mostWaitingPacksShown };
}

export async function grantedKudosBetween(ctx: QueryContext, workspace: string, { from, to }: Instants, most: number): Promise<GrantedKudos[]> {
  const told = await ctx.tx
    .select()
    .from(grantsTold)
    .where(and(eq(grantsTold.message$workspace, workspace), gte(grantsTold.at, from), lt(grantsTold.at, to)))
    .orderBy(...toldByWorkspaceAt.orderBy())
    .limit(most);
  return told.map((row) => {
    const { message, at, recipients } = toDocument<Doc<"grantsTold">>(grantsTold, row);
    return { message, at: at ?? from, recipients: recipients ?? 0 };
  });
}

export async function packsEarnedBetween(ctx: QueryContext, giver: MemberId, { from, to }: Instants, most: number): Promise<Doc<"thoughtfulPacks">[]> {
  const rows = await ctx.tx
    .select()
    .from(thoughtfulPacks)
    .where(and(eq(thoughtfulPacks.giver, giver), gte(thoughtfulPacks.at, from), lt(thoughtfulPacks.at, to)))
    .orderBy(...byGiverAt.orderBy())
    .limit(most);
  return rows.map(asPack);
}

export async function isFirstPackFor(ctx: QueryContext, { _id, giver, recipient }: Doc<"thoughtfulPacks">): Promise<boolean> {
  return (await firstPackGrantedFor(ctx, giver, recipient))?._id === _id;
}

export async function isFirstPackGrantedFor(ctx: QueryContext, giver: MemberId, recipient: MemberId, message: MessageRef): Promise<boolean> {
  const first = await firstPackGrantedFor(ctx, giver, recipient);
  return first !== null && isSameMessage(first.message, message);
}

export async function firstPackGrantedFor(ctx: QueryContext, giver: MemberId, recipient: MemberId): Promise<Doc<"thoughtfulPacks"> | null> {
  const [first] = await ctx.tx
    .select()
    .from(thoughtfulPacks)
    .where(and(eq(thoughtfulPacks.giver, giver), eq(thoughtfulPacks.recipient, recipient)))
    .orderBy(...byGiverRecipient.orderBy())
    .limit(1);
  return first ? asPack(first) : null;
}

function recipientsOf(event: KudosGivenEvent): MemberId[] {
  return [...new Set(event.awards.map(({ recipient }) => recipient))].filter((recipient) => recipient !== event.giver);
}

async function grantTo(ctx: MutationContext, event: KudosGivenEvent, recipient: MemberId) {
  if ((await grantRecordOf(ctx, event.message, recipient)) !== null) return;
  const outcome = await packFor(ctx, event, recipient);
  const record = { ...ctx.newRow(), giver: event.giver, message: event.message, recipient, outcome };
  await ctx.tx.insert(grantRecords).values(fromDocument(grantRecords, record) as typeof grantRecords.$inferInsert);
}

async function packFor(ctx: MutationContext, { workspace, giver, message, day, at }: KudosGivenEvent, recipient: MemberId): Promise<GrantOutcome> {
  const week = givingWeekOf(day);
  if (await packEarnedIn(ctx, giver, recipient, week)) return "nextWeek";
  const outcome = await stickerOutcomeOf(ctx, giver, recipient);
  const pack = { ...ctx.newRow(), workspace, giver, recipient, week, message, holdsSticker: outcome === "new", at };
  await ctx.tx.insert(thoughtfulPacks).values(fromDocument(thoughtfulPacks, pack) as typeof thoughtfulPacks.$inferInsert);
  await earnThanksItems(ctx, { workspace, giver, recipient, message, at }, pack._id as PackId, outcome === "new");
  await nameHypeEmojiOf(ctx, workspace, recipient);
  return outcome;
}

type Thanks = { workspace: string; giver: MemberId; recipient: MemberId; message: MessageRef; at: number };

async function earnThanksItems(ctx: MutationContext, thanks: Thanks, pack: PackId, holdsSticker: boolean) {
  const earning = thanksEarningOf(thanks);
  await earnHoggieItem(ctx, { ...earning, key: crateKeyOf(pack) }, kudosPackRarities);
  if (holdsSticker) await earnItem(ctx, { ...earning, source: "sticker", key: pack });
}

export async function earnItemsOfAPackGivenBeforeTheLedger(ctx: MutationContext, pack: Doc<"thoughtfulPacks">): Promise<void> {
  const earning = thanksEarningOf(pack);
  await earnItem(ctx, { ...earning, source: "hoggie", key: crateKeyOf(pack._id), ...kudosPackRarities.today });
  if (pack.holdsSticker) await earnItem(ctx, { ...earning, source: "sticker", key: pack._id });
}

export function thanksEarningOf({ workspace, giver, recipient, message, at }: Thanks) {
  return { workspace, member: giver, reason: { kind: "thanks" as const, person: recipient, message }, earnedAt: at };
}

export const thoughtfulCratePrefix = "thoughtful:";

export function crateKeyOf(pack: PackId): CrateKey {
  return `${thoughtfulCratePrefix}${pack}`;
}

async function stickerOutcomeOf(ctx: QueryContext, giver: MemberId, recipient: MemberId): Promise<Exclude<GrantOutcome, "nextWeek">> {
  if (await inTheAlbumOf(ctx, giver, recipient)) return "held";
  if (await stickerWaitingFor(ctx, giver, recipient)) return "waiting";
  return "new";
}

async function packEarnedIn(ctx: QueryContext, giver: MemberId, recipient: MemberId, week: string) {
  const [pack] = await ctx.tx
    .select({ _id: thoughtfulPacks._id })
    .from(thoughtfulPacks)
    .where(and(eq(thoughtfulPacks.giver, giver), eq(thoughtfulPacks.recipient, recipient), eq(thoughtfulPacks.week, week)))
    .orderBy(...byGiverRecipientWeek.orderBy())
    .limit(1);
  return pack !== undefined;
}

async function stickerWaitingFor(ctx: QueryContext, giver: MemberId, recipient: MemberId) {
  const [pack] = await ctx.tx
    .select({ _id: thoughtfulPacks._id })
    .from(thoughtfulPacks)
    .where(and(eq(thoughtfulPacks.giver, giver), eq(thoughtfulPacks.recipient, recipient), eq(thoughtfulPacks.holdsSticker, true)))
    .orderBy(...byGiverRecipientSticker.orderBy())
    .limit(1);
  return pack !== undefined;
}

/** The message's grant record for the recipient, or `null`; two fail, as `.unique()` did. */
async function grantRecordOf(ctx: QueryContext, message: MessageRef, recipient: MemberId) {
  const rows = await ctx.tx
    .select({ _id: grantRecords._id })
    .from(grantRecords)
    .where(and(...sameMessage(grantRecords, message), eq(grantRecords.recipient, recipient)))
    .orderBy(...recordsByMessageRecipient.orderBy())
    .limit(2);
  if (rows.length > 1) throw new Error("The message has more than one grant record for the recipient");
  return rows[0] ?? null;
}

async function tellOnceEveryoneIsGranted(ctx: MutationContext, event: KudosGivenEvent, recipients: MemberId[]) {
  const records = await ctx.tx
    .select({ recipient: grantRecords.recipient, outcome: grantRecords.outcome })
    .from(grantRecords)
    .where(and(...sameMessage(grantRecords, event.message)))
    .orderBy(...recordsByMessageRecipient.orderBy());
  if (records.length < recipients.length || (await toldAlready(ctx, event.message))) return;
  const told = { ...ctx.newRow(), message: event.message, at: event.at, recipients: recipients.length };
  await ctx.tx.insert(grantsTold).values(fromDocument(grantsTold, told) as typeof grantsTold.$inferInsert);
  const outcomeOf = new Map(records.map(({ recipient, outcome }) => [recipient, outcome]));
  const outcomes = recipients.map((recipient) => ({ recipient, outcome: outcomeOf.get(recipient)! }));
  const granted: ThoughtfulPacksGrantedEvent = { type: "thoughtfulPacksGranted", workspace: event.workspace, giver: event.giver, message: event.message, outcomes, at: event.at };
  await ctx.publish(granted);
}

/** The message's grants were told, or not; two tellings fail, as `.unique()` did. */
async function toldAlready(ctx: QueryContext, message: MessageRef) {
  const rows = await ctx.tx
    .select({ _id: grantsTold._id })
    .from(grantsTold)
    .where(and(...sameMessage(grantsTold, message)))
    .orderBy(...toldByMessage.orderBy())
    .limit(2);
  if (rows.length > 1) throw new Error("The message's grants were told more than once");
  return rows.length === 1;
}

/** The message's three index fields, as `.withIndex` named them: its workspace, conversation and message. */
function sameMessage(table: typeof grantRecords | typeof grantsTold, { workspace, conversation, message }: MessageRef) {
  return [eq(table.message$workspace, workspace), eq(table.message$conversation, conversation), eq(table.message$message, message)];
}
