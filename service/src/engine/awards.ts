// Awards: one row per recipient of a given kudos message, inserted once and never changed or deleted (R18), and the
// reads every domain makes of them. Today's convex/engine/awards.ts over the service's transaction: each
// `.withIndex(...)` read walks the same index order (../db/indexOrder.ts), `.paginate` pages by the service's keyset
// (../db/page.ts), and a `for await` over a query streams it a page at a time.
import { and, eq, gt, gte, lt, lte, type SQL } from "drizzle-orm";
import type { MemberId } from "../workspace/directory.ts";
import { allowanceDay, type DayKey, type Week } from "./allowance.ts";
import type { Annotations, MessageRef } from "./messageEvent.ts";
import { addToTotals } from "./totals.ts";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder, type Direction, type IndexOrder } from "../db/indexOrder.ts";
import { paginate, type Page, type PageOptions } from "../db/page.ts";
import { awards, kudosMessages, type Doc } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";

export type Award = { giver: MemberId; recipient: MemberId; kudos: number };

export const awardIdValidator = zv.id("awards");

export type AwardId = Id<"awards">;

export type AwardWithId = Award & { award: AwardId };

export type GivenAward = AwardWithId & { day: DayKey };

export type WeekTotals = { givenWeek: number; receivedWeek: number };

export type GivenMessage = { workspace: string; message: MessageRef; giver: MemberId; awards: Award[]; day: DayKey };

export type GivenMessagesPage = { messages: GivenMessage[]; cursor: string; isDone: boolean };

type AwardRow = Doc<"awards">;

export type DatedAward = { award: AwardId; day: DayKey; at: number; created: number; annotations: Annotations };

const dayMs = 24 * 60 * 60 * 1000;

// The awards table's indexes, as the schema declares them; the default one is creation order.
const inCreationOrder = indexOrder(awards, []);
const byGiver = indexOrder(awards, ["giver", "day"]);
const byGiverRecipient = indexOrder(awards, ["giver", "recipient"]);
const byRecipient = indexOrder(awards, ["recipient", "day"]);
const byRecipientAt = indexOrder(awards, ["recipient", "at"]);
const byGiverAt = indexOrder(awards, ["giver", "at"]);
const byRecipientDecided = indexOrder(awards, ["recipient"]);
const byGiverDecided = indexOrder(awards, ["giver"]);
const byMessage = indexOrder(awards, ["workspace", "conversation", "message"]);
const byMessageRecipient = indexOrder(awards, ["workspace", "conversation", "message", "recipient"]);
const byWorkspace = indexOrder(awards, ["workspace"]);
const kudosMessagesByMessage = indexOrder(kudosMessages, ["workspace", "conversation", "message"]);

export async function insertAwards(ctx: MutationContext, message: MessageRef, given: Award[], day: DayKey, at: number): Promise<AwardWithId[]> {
  const inserted: AwardWithId[] = [];
  for (const award of given) {
    const row = ctx.newRow();
    await ctx.tx.insert(awards).values(fromDocument(awards, { ...row, ...message, ...award, day, at }) as typeof awards.$inferInsert);
    inserted.push({ award: row._id as AwardId, ...award });
    await addToTotals(ctx, award);
  }
  return inserted;
}

export async function weekTotals({ tx }: QueryContext, member: MemberId, week: Week): Promise<WeekTotals> {
  const given = await awardsWhere(tx, byGiver, and(eq(awards.giver, member), inWeek(week)));
  const received = await awardsWhere(tx, byRecipient, and(eq(awards.recipient, member), inWeek(week)));
  return { givenWeek: sumOf(given), receivedWeek: sumOf(received) };
}

export type WeekAward = { message: MessageRef; giver: MemberId; recipient: MemberId; at: number };

export async function awardsInWeekNewestDaysFirst({ tx }: QueryContext, member: MemberId, side: "given" | "received", week: Week, atMost: number): Promise<WeekAward[]> {
  const newest =
    side === "given"
      ? await awardsWhere(tx, byGiver, and(eq(awards.giver, member), inWeek(week)), { direction: "desc", atMost })
      : await awardsWhere(tx, byRecipient, and(eq(awards.recipient, member), inWeek(week)), { direction: "desc", atMost });
  return newest.map(({ workspace, conversation, message, giver, recipient, at }) => ({ message: { workspace, conversation, message }, giver, recipient, at }));
}

export async function givenInWeek({ tx }: QueryContext, giver: MemberId, week: Week): Promise<Array<Pick<AwardRow, "recipient" | "at">>> {
  const given = await awardsWhere(tx, byGiver, and(eq(awards.giver, giver), inWeek(week)));
  return given.map(({ recipient, at }) => ({ recipient, at }));
}

export type EarlierAward = Pick<AwardRow, "recipient" | "day">;

export async function givenEarlierInWeek({ tx }: QueryContext, giver: MemberId, week: Week, before: AwardId): Promise<EarlierAward[]> {
  const cutoff = (await awardById(tx, before))?._creationTime ?? Infinity;
  const given = await awardsWhere(tx, byGiver, and(eq(awards.giver, giver), inWeek(week)));
  return given.filter(({ _creationTime }) => _creationTime < cutoff).map(({ recipient, day }) => ({ recipient, day }));
}

async function withStoredAnnotations(ctx: QueryContext, given: AwardRow[]): Promise<Array<{ award: AwardRow; annotations: Annotations }>> {
  const annotationsOfMessage = new Map<string, Annotations>();
  const annotated: Array<{ award: AwardRow; annotations: Annotations }> = [];
  for (const award of given) {
    const key = messageKey(award);
    if (!annotationsOfMessage.has(key)) annotationsOfMessage.set(key, await storedAnnotationsOf(ctx, award));
    annotated.push({ award, annotations: annotationsOfMessage.get(key)! });
  }
  return annotated;
}

export async function storedAnnotationsOf({ tx }: QueryContext, { workspace, conversation, message }: MessageRef): Promise<Annotations> {
  const rows = await tx
    .select()
    .from(kudosMessages)
    .where(and(eq(kudosMessages.workspace, workspace), eq(kudosMessages.conversation, conversation), eq(kudosMessages.message, message)))
    .orderBy(...kudosMessagesByMessage.orderBy())
    .limit(2);
  const kudosMessage = unique("kudosMessages", rows.map((row) => toDocument<Doc<"kudosMessages">>(kudosMessages, row)));
  return kudosMessage?.annotations ?? {};
}

export async function awardsGivenBefore({ tx }: QueryContext, before: number, page: PageOptions): Promise<Page<GivenAward>> {
  const result = await paginate<AwardRow>(tx, { table: awards, order: inCreationOrder, where: lt(awards._creationTime, before) }, page);
  return { ...result, page: result.page.map(({ _id, giver, recipient, kudos, day }) => ({ award: _id, giver, recipient, kudos, day })) };
}

export type RecordedAward = GivenAward & { workspace: string; at: number };

export async function awardsInCreationOrder({ tx }: QueryContext, page: PageOptions): Promise<Page<RecordedAward>> {
  const result = await paginate<AwardRow>(tx, { table: awards, order: inCreationOrder }, page);
  return { ...result, page: result.page.map(({ _id, workspace, giver, recipient, kudos, day, at }) => ({ award: _id, workspace, giver, recipient, kudos, day, at })) };
}

export type WorkspaceAward = GivenAward & { message: MessageRef; at: number; created: number };

export async function awardsInWorkspace({ tx }: QueryContext, workspace: string, page: PageOptions): Promise<Page<WorkspaceAward>> {
  const result = await paginate<AwardRow>(tx, { table: awards, order: byWorkspace, where: eq(awards.workspace, workspace) }, page);
  return {
    ...result,
    page: result.page.map(({ _id, _creationTime, conversation, message, giver, recipient, kudos, day, at }) => ({
      award: _id,
      message: { workspace, conversation, message },
      giver,
      recipient,
      kudos,
      day,
      at,
      created: _creationTime,
    })),
  };
}

export type NewestReceived = { giver: MemberId; message: MessageRef; at: number };

export async function newestReceivedBy({ tx }: QueryContext, recipient: MemberId, atMost: number): Promise<NewestReceived[]> {
  const received = await awardsWhere(tx, byRecipientAt, eq(awards.recipient, recipient), { direction: "desc", atMost });
  return received.map(({ giver, workspace, conversation, message, at }) => ({ giver, message: { workspace, conversation, message }, at }));
}

export async function kudosDecidedAfter({ tx }: QueryContext, recipient: MemberId, after: number, awardsAtMost: number): Promise<number> {
  const received = await awardsWhere(tx, byRecipientDecided, and(eq(awards.recipient, recipient), gt(awards._creationTime, after)), { atMost: awardsAtMost });
  return received.reduce((sum, { kudos }) => sum + kudos, 0);
}

export async function newestDecidedReceivedBy({ tx }: QueryContext, recipient: MemberId): Promise<number | null> {
  const [newest] = await awardsWhere(tx, byRecipientDecided, eq(awards.recipient, recipient), { direction: "desc", atMost: 1 });
  return newest?._creationTime ?? null;
}

export type GivenMessageFacts = { giver: MemberId; day: DayKey; at: number };

export async function givenFactsOf({ tx }: QueryContext, ref: MessageRef): Promise<GivenMessageFacts | null> {
  const award = await firstOfMessage(tx, ref);
  return award === null ? null : { giver: award.giver, day: award.day, at: award.at };
}

export async function awardsOfMessage({ tx }: QueryContext, ref: MessageRef): Promise<Array<GivenAward & { at: number }>> {
  const ofMessage = await awardsWhere(tx, byMessage, ofTheMessage(ref));
  return ofMessage.map(({ _id, giver, recipient, kudos, day, at }) => ({ award: _id, giver, recipient, kudos, day, at }));
}

export async function authorOfGiven({ tx }: QueryContext, ref: MessageRef): Promise<MemberId | null> {
  return (await firstOfMessage(tx, ref))?.giver ?? null;
}

export async function receivedOn({ tx }: QueryContext, ref: MessageRef, member: MemberId): Promise<boolean> {
  const [award] = await awardsWhere(tx, byMessageRecipient, and(ofTheMessage(ref), eq(awards.recipient, member)), { atMost: 1 });
  return award !== undefined;
}

export async function recipientsPageOf({ tx }: QueryContext, ref: MessageRef, page: PageOptions): Promise<Page<MemberId>> {
  const result = await paginate<AwardRow>(tx, { table: awards, order: byMessage, where: ofTheMessage(ref) }, page);
  return { ...result, page: result.page.map(({ recipient }) => recipient) };
}

export async function recipientsAfter({ tx }: QueryContext, ref: MessageRef, after: MemberId | null, atMost: number): Promise<MemberId[]> {
  const later = await awardsWhere(tx, byMessageRecipient, and(ofTheMessage(ref), after === null ? undefined : gt(awards.recipient, after)), { atMost });
  return later.map(({ recipient }) => recipient);
}

export async function dayThankedBefore({ tx }: QueryContext, award: AwardId): Promise<DayKey | null> {
  const current = await awardById(tx, award);
  if (current === null) return null;
  const [previous] = await awardsWhere(
    tx,
    byGiverRecipient,
    and(eq(awards.giver, current.giver), eq(awards.recipient, current.recipient), lt(awards._creationTime, current._creationTime)),
    { direction: "desc", atMost: 1 },
  );
  return previous?.day ?? null;
}

/** When the award was recorded, its row's creation time, or null when there is no such award: today's `ctx.db.get`. */
export async function awardRecordedAt({ tx }: QueryContext, award: AwardId): Promise<number | null> {
  return (await awardById(tx, award))?._creationTime ?? null;
}

export type GivenKudos = { award: AwardId; message: MessageRef; at: number };

export async function givenRecordedAfter({ tx }: QueryContext, giver: MemberId, after: number): Promise<GivenKudos[]> {
  const given = await awardsWhere(tx, byGiverDecided, and(eq(awards.giver, giver), gt(awards._creationTime, after)));
  return given.map(({ _id, workspace, conversation, message, at }) => ({ award: _id, message: { workspace, conversation, message }, at }));
}

export type EarliestAward = { award: AwardId; at: number; created: number };

export async function earliestAwardFrom({ tx }: QueryContext, giver: MemberId, recipient: MemberId): Promise<EarliestAward | null> {
  const [earliest] = await awardsWhere(tx, byGiverRecipient, and(eq(awards.giver, giver), eq(awards.recipient, recipient)), { atMost: 1 });
  return earliest === undefined ? null : { award: earliest._id, at: earliest.at, created: earliest._creationTime };
}

export async function thankedAtOrBefore({ tx }: QueryContext, giver: MemberId, recipient: MemberId, atOrBefore: number): Promise<boolean> {
  for await (const { at } of streamed(tx, byGiverRecipient, and(eq(awards.giver, giver), eq(awards.recipient, recipient)))) if (at <= atOrBefore) return true;
  return false;
}

const thankedBeforeSince = -Infinity;

const repeatsReadBeforeSkipping = 16;

export async function lastThankedSince(ctx: QueryContext, giver: MemberId, since: number, atOrBefore: number): Promise<Map<MemberId, number>> {
  const lastThanked = new Map<MemberId, number>();
  for (const recipient of await everThankedBy(ctx, giver, atOrBefore)) lastThanked.set(recipient, thankedBeforeSince);
  for (const { recipient, at } of await givenAfter(ctx, giver, since, atOrBefore)) {
    if (at > lastThanked.get(recipient)!) lastThanked.set(recipient, at);
  }
  return lastThanked;
}

async function everThankedBy(ctx: QueryContext, giver: MemberId, atOrBefore: number): Promise<Set<MemberId>> {
  const thanked = new Set<MemberId>();
  let past: MemberId | null = null;
  do past = await thankedUntilOneRepeats(ctx, giver, past, atOrBefore, thanked);
  while (past !== null);
  return thanked;
}

// Walks the giver's awards by recipient; after a run of repeats of one recipient, it answers that recipient so the
// next walk starts past them, as today's skip over a much-thanked teammate does.
async function thankedUntilOneRepeats({ tx }: QueryContext, giver: MemberId, past: MemberId | null, atOrBefore: number, thanked: Set<MemberId>): Promise<MemberId | null> {
  let repeats = 0;
  for await (const { recipient, at } of streamed(tx, byGiverRecipient, and(eq(awards.giver, giver), past === null ? undefined : gt(awards.recipient, past)))) {
    if (!thanked.has(recipient)) {
      if (at <= atOrBefore) thanked.add(recipient);
      repeats = 0;
    } else if (++repeats === repeatsReadBeforeSkipping) return recipient;
  }
  return null;
}

function givenAfter({ tx }: QueryContext, giver: MemberId, since: number, atOrBefore: number) {
  return awardsWhere(tx, byGiverAt, and(eq(awards.giver, giver), gt(awards.at, since), lte(awards.at, atOrBefore)));
}

export async function givenBetween(ctx: QueryContext, giver: MemberId, since: number, until: number): Promise<DatedAward[]> {
  const from = and(eq(awards.giver, giver), gte(awards.day, earliestDayAt(since)));
  const given = await awardsWhere(ctx.tx, byGiver, Number.isFinite(until) ? and(from, lte(awards.day, latestDayAt(until))) : from);
  return datedOf(ctx, given.filter(({ at }) => at >= since && at <= until));
}

export async function givenSinceWithin(ctx: QueryContext, giver: MemberId, since: number, mostAwards: number): Promise<DatedAward[] | null> {
  const given = await awardsWhere(ctx.tx, byGiverAt, and(eq(awards.giver, giver), gte(awards.at, since)), { atMost: mostAwards + 1 });
  return given.length > mostAwards ? null : datedOf(ctx, given);
}

async function datedOf(ctx: QueryContext, given: AwardRow[]): Promise<DatedAward[]> {
  const sorted = given.toSorted((one, other) => one.at - other.at);
  return (await withStoredAnnotations(ctx, sorted)).map(({ award: { _id, day, at, _creationTime }, annotations }) => ({ award: _id, day, at, created: _creationTime, annotations }));
}

function earliestDayAt(at: number): DayKey {
  return allowanceDay(at - dayMs, "UTC");
}

function latestDayAt(at: number): DayKey {
  return allowanceDay(at + dayMs, "UTC");
}

export async function awardAt({ tx }: QueryContext, award: AwardId): Promise<number | null> {
  return (await awardById(tx, award))?.at ?? null;
}

export type LatestInAwardOrder = (awards: AwardId[]) => Promise<AwardId | null>;

export function latestInAwardOrder({ tx }: QueryContext): LatestInAwardOrder {
  const created = new Map<AwardId, number | null>();
  const creationOf = async (award: AwardId) => {
    if (!created.has(award)) created.set(award, (await awardById(tx, award))?._creationTime ?? null);
    return created.get(award)!;
  };
  return async (ids) => {
    let latest: { award: AwardId; at: number } | null = null;
    for (const award of ids) {
      const at = await creationOf(award);
      if (at !== null && (latest === null || at > latest.at)) latest = { award, at };
    }
    return latest?.award ?? null;
  };
}

export async function messageOfAward({ tx }: QueryContext, award: AwardId): Promise<MessageRef | null> {
  const row = await awardById(tx, award);
  return row === null ? null : { workspace: row.workspace, conversation: row.conversation, message: row.message };
}

export async function oldestAwardGivenBy({ tx }: QueryContext, giver: MemberId): Promise<{ award: AwardId; decided: number } | null> {
  const [oldest] = await awardsWhere(tx, byGiverDecided, eq(awards.giver, giver), { atMost: 1 });
  return oldest === undefined ? null : { award: oldest._id, decided: oldest._creationTime };
}

export async function firstDecidedOf({ tx }: QueryContext, ref: MessageRef): Promise<number | null> {
  return (await firstOfMessage(tx, ref))?._creationTime ?? null;
}

export async function hasGivenAnAward({ tx }: QueryContext, giver: MemberId): Promise<boolean> {
  return (await awardsWhere(tx, byGiverDecided, eq(awards.giver, giver), { atMost: 1 })).length > 0;
}

export async function hasReceivedAnAward({ tx }: QueryContext, recipient: MemberId): Promise<boolean> {
  return (await awardsWhere(tx, byRecipientDecided, eq(awards.recipient, recipient), { atMost: 1 })).length > 0;
}

export async function firstThanksOf({ tx }: QueryContext, giver: MemberId): Promise<number[]> {
  const given = await awardsWhere(tx, byGiver, eq(awards.giver, giver));
  const thanked = new Set<MemberId>();
  const firsts: number[] = [];
  for (const { recipient, at } of given.sort((one, other) => one._creationTime - other._creationTime)) {
    if (!thanked.has(recipient)) firsts.push(at);
    thanked.add(recipient);
  }
  return firsts;
}

export async function lastThankedBefore({ tx }: QueryContext, given: AwardWithId[]): Promise<Map<AwardId, number | null>> {
  const lastThanked = new Map<AwardId, number | null>();
  for (const { award, giver, recipient } of given) {
    const toRecipient = await awardsWhere(tx, byGiverRecipient, and(eq(awards.giver, giver), eq(awards.recipient, recipient)));
    const current = toRecipient.find(({ _id }) => _id === award);
    if (current === undefined) continue;
    const earlier = toRecipient.filter(({ _creationTime }) => _creationTime < current._creationTime);
    lastThanked.set(award, earlier.length === 0 ? null : Math.max(...earlier.map(({ at }) => at)));
  }
  return lastThanked;
}

function sumOf(given: Array<{ kudos: number }>) {
  return given.reduce((sum, award) => sum + award.kudos, 0);
}

export async function givenMessagesInAwardOrder({ tx }: QueryContext, cursor: string | null, pageSize: number): Promise<GivenMessagesPage> {
  const page = await paginate<AwardRow>(tx, { table: awards, order: inCreationOrder }, { cursor, numItems: pageSize });
  const messages: GivenMessage[] = [];
  for (const award of firstAwardOfEachMessage(page.page)) messages.push(await givenMessageOf(tx, award));
  return { messages, cursor: page.continueCursor, isDone: page.isDone };
}

function firstAwardOfEachMessage(given: AwardRow[]) {
  const seen = new Set<string>();
  return given.filter((award) => {
    const key = messageKey(award);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function givenMessageOf(tx: Transaction, first: AwardRow): Promise<GivenMessage> {
  const { workspace, conversation, message, giver, day } = first;
  const ofMessage = await awardsWhere(tx, byMessage, ofTheMessage(first));
  const given = ofMessage.map(({ recipient, kudos }) => ({ giver, recipient, kudos }));
  return { workspace, message: { workspace, conversation, message }, giver, awards: given, day };
}

function messageKey({ workspace, conversation, message }: Pick<AwardRow, "workspace" | "conversation" | "message">) {
  return JSON.stringify([workspace, conversation, message]);
}

export type Before = { at: number; created: number };

export const fromTheNewest: Before = { at: Infinity, created: Infinity };

export type ReceivedAward = { award: AwardId; message: MessageRef; giver: MemberId; kudos: number; at: number; created: number };

export type MessageAward = { award: AwardId; recipient: MemberId; kudos: number };

export type GivenMessageAwards = { first: AwardId; message: MessageRef; awards: MessageAward[]; at: number; created: number };

export type AtRange = { kind: "instant"; at: number; createdBefore?: number } | { kind: "older"; than?: number };

export async function* awardsReceivedNewestFirst({ tx }: QueryContext, recipient: MemberId, before: Before): AsyncGenerator<ReceivedAward> {
  for (const range of rangesBefore(before)) {
    for await (const row of streamed(tx, byRecipientAt, and(eq(awards.recipient, recipient), withinRange(range)), "desc")) yield receivedAwardOf(row);
  }
}

function receivedAwardOf(row: AwardRow): ReceivedAward {
  return { award: row._id, message: refOf(row), giver: row.giver, kudos: row.kudos, at: row.at, created: row._creationTime };
}

export function messagesGivenNewestFirst({ tx }: QueryContext, giver: MemberId, before: Before): AsyncGenerator<GivenMessageAwards> {
  return groupedByMessage(awardsGivenNewestFirst(tx, giver, before));
}

async function* groupedByMessage(rows: AsyncIterable<AwardRow>): AsyncGenerator<GivenMessageAwards> {
  let current: GivenMessageAwards | null = null;
  for await (const row of rows) {
    if (current !== null && messageKey(row) !== messageKey(current.message)) {
      yield current;
      current = null;
    }
    current ??= { first: row._id, message: refOf(row), awards: [], at: row.at, created: row._creationTime };
    current.awards.unshift({ award: row._id, recipient: row.recipient, kudos: row.kudos });
    current.first = row._id;
    current.created = row._creationTime;
  }
  if (current !== null) yield current;
}

async function* awardsGivenNewestFirst(tx: Transaction, giver: MemberId, before: Before): AsyncGenerator<AwardRow> {
  for (const range of rangesBefore(before)) yield* streamed(tx, byGiverAt, and(eq(awards.giver, giver), withinRange(range)), "desc");
}

// One range of `rangesBefore` on an index whose last field is `at`, as today's `.withIndex` bounds read it.
function withinRange(range: AtRange): SQL | undefined {
  if (range.kind === "older") return range.than === undefined ? undefined : lt(awards.at, range.than);
  return and(eq(awards.at, range.at), range.createdBefore === undefined ? undefined : lt(awards._creationTime, range.createdBefore));
}

export type DecidedBelow = { decided: number; inclusive: boolean; above?: number };

export const fromTheNewestDecided: DecidedBelow = { decided: Infinity, inclusive: true };

type UpperBounded<Q> = { lt(field: "_creationTime", value: number): Q; lte(field: "_creationTime", value: number): Q } & Q;

type DecidedIndex<Q> = { gt(field: "_creationTime", value: number): UpperBounded<Q> } & UpperBounded<Q>;

export function decidedBelow<Q>(q: DecidedIndex<Q>, { decided, inclusive, above }: DecidedBelow): Q {
  const bounded = above === undefined ? q : q.gt("_creationTime", above);
  if (decided === Infinity) return bounded;
  return inclusive ? bounded.lte("_creationTime", decided) : bounded.lt("_creationTime", decided);
}

// `decidedBelow`'s bounds on the awards' decision time, `_creationTime`, as SQL.
function decidedWithin({ decided, inclusive, above }: DecidedBelow): SQL | undefined {
  const lower = above === undefined ? undefined : gt(awards._creationTime, above);
  if (decided === Infinity) return lower;
  return and(lower, inclusive ? lte(awards._creationTime, decided) : lt(awards._creationTime, decided));
}

export async function* awardsReceivedByDecision({ tx }: QueryContext, recipient: MemberId, below: DecidedBelow): AsyncGenerator<ReceivedAward> {
  for await (const row of streamed(tx, byRecipientDecided, and(eq(awards.recipient, recipient), decidedWithin(below)), "desc")) yield receivedAwardOf(row);
}

export type AnnotatedGivenMessage = GivenMessageAwards & { annotations: Annotations };

export async function messagesGivenDecidedAfter(ctx: QueryContext, giver: MemberId, after: number, mostAwards: number): Promise<AnnotatedGivenMessage[] | null> {
  const given: AnnotatedGivenMessage[] = [];
  let count = 0;
  for await (const message of messagesGivenByDecision(ctx, giver, { ...fromTheNewestDecided, above: after })) {
    if (((await firstDecidedOf(ctx, message.message)) ?? message.created) <= after) continue;
    count += message.awards.length;
    if (count > mostAwards) return null;
    given.push({ ...message, annotations: await storedAnnotationsOf(ctx, message.message) });
  }
  return given;
}

export function messagesGivenByDecision({ tx }: QueryContext, giver: MemberId, below: DecidedBelow): AsyncGenerator<GivenMessageAwards> {
  return groupedByMessage(streamed(tx, byGiverDecided, and(eq(awards.giver, giver), decidedWithin(below)), "desc"));
}

export function rangesBefore({ at, created }: Before): AtRange[] {
  if (at === Infinity) return [{ kind: "older" }];
  const sameInstant: AtRange[] = created === -Infinity ? [] : [{ kind: "instant", at, ...(created !== Infinity && { createdBefore: created }) }];
  return [...sameInstant, { kind: "older", than: at }];
}

function refOf({ workspace, conversation, message }: Pick<AwardRow, "workspace" | "conversation" | "message">): MessageRef {
  return { workspace, conversation, message };
}

function ofTheMessage({ workspace, conversation, message }: MessageRef): SQL {
  return and(eq(awards.workspace, workspace), eq(awards.conversation, conversation), eq(awards.message, message))!;
}

function inWeek({ monday, sunday }: Week): SQL {
  return and(gte(awards.day, monday), lte(awards.day, sunday))!;
}

async function firstOfMessage(tx: Transaction, ref: MessageRef): Promise<AwardRow | null> {
  const [first] = await awardsWhere(tx, byMessage, ofTheMessage(ref), { atMost: 1 });
  return first ?? null;
}

async function awardById(tx: Transaction, award: AwardId): Promise<AwardRow | null> {
  const [row] = await tx.select().from(awards).where(eq(awards._id, award)).limit(1);
  return row ? toDocument<AwardRow>(awards, row) : null;
}

/** The awards `where` holds for, in the index's order, as `.withIndex(...)` then `.collect()`, `.take` or `.first()` read them. */
async function awardsWhere(tx: Transaction, order: IndexOrder, where: SQL | undefined, { direction = "asc", atMost }: { direction?: Direction; atMost?: number } = {}): Promise<AwardRow[]> {
  const query = tx.select().from(awards).where(where).orderBy(...order.orderBy(direction));
  const rows = atMost === undefined ? await query : await query.limit(atMost);
  return rows.map((row) => toDocument<AwardRow>(awards, row));
}

// How many rows a streamed read takes at once; a caller that stops early reads no more pages.
const streamPage = 100;

/** The awards `where` holds for, in the index's order, a page at a time, as a `for await` over a query streamed them. */
async function* streamed(tx: Transaction, order: IndexOrder, where: SQL | undefined, direction: Direction = "asc"): AsyncGenerator<AwardRow> {
  let last: AwardRow | undefined;
  for (;;) {
    const page = await awardsWhere(tx, order, and(where, last === undefined ? undefined : order.after(last, direction)), { direction, atMost: streamPage });
    yield* page;
    if (page.length < streamPage) return;
    last = page.at(-1);
  }
}
