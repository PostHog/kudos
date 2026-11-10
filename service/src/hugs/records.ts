// The hug records: one row per hug given, one per person it paid, and the versioned count of hugs each member received
// on a message. Today's convex/hugs/records.ts over the service's transaction.
import { and, eq, gt, gte, lt, lte, type SQL } from "drizzle-orm";
import type { DayKey, Week } from "../engine/allowance.ts";
import { awardsOfMessage, recipientsAfter, recipientsPageOf, type DecidedBelow } from "../engine/awards.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { paginate, type Page, type PageOptions } from "../db/page.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder, type IndexOrder } from "../db/indexOrder.ts";
import { hugPeople, hugs, hugsReceived, type Doc } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export type Hug = Doc<"hugs">;

export type HugId = Doc<"hugs">["_id"];

export type HugFor = { onKudos: true } | { onKudos: false; author: MemberId };

type HugsReceivedRow = Doc<"hugsReceived">;

const byMessageGiver = indexOrder(hugs, ["workspace", "conversation", "message", "giver"]);
const byGiverDay = indexOrder(hugs, ["giver", "day"]);
const byGiverDecided = indexOrder(hugs, ["giver"]);
const paidByHugMember = indexOrder(hugPeople, ["hug", "member"]);
const paidByMemberAt = indexOrder(hugPeople, ["member", "at"]);
const receivedByMember = indexOrder(hugsReceived, ["member"]);
const receivedByMemberMessage = indexOrder(hugsReceived, ["member", "workspace", "conversation", "message"]);
const hugsCreated = indexOrder(hugs, []);
const paidCreated = indexOrder(hugPeople, []);

const hugOfRow = (row: Record<string, unknown>) => toDocument<Hug>(hugs, row);
const receivedOfRow = (row: Record<string, unknown>) => toDocument<HugsReceivedRow>(hugsReceived, row);

/** The giver's hug on the message, or `null`; two fail, as `.unique()` did. */
export async function hugOf(ctx: QueryContext, { workspace, conversation, message }: MessageRef, giver: MemberId): Promise<null | Doc<"hugs">> {
  const rows = await ctx.tx
    .select()
    .from(hugs)
    .where(and(eq(hugs.workspace, workspace), eq(hugs.conversation, conversation), eq(hugs.message, message), eq(hugs.giver, giver)))
    .orderBy(...byMessageGiver.orderBy())
    .limit(2);
  const row = unique("hugs", rows);
  return row === null ? null : hugOfRow(row);
}

export async function hugWithId(ctx: QueryContext, hug: HugId): Promise<null | Doc<"hugs">> {
  const [row] = await ctx.tx.select().from(hugs).where(eq(hugs._id, hug)).limit(1);
  return row === undefined ? null : hugOfRow(row);
}

// Paged through the shared keyset `paginate` (S11), on the index today's read named or in creation order.
export function hugsInWorkspace(ctx: QueryContext, workspace: string, page: PageOptions): Promise<Page<Hug>> {
  return paginate<Hug>(ctx.tx, { table: hugs, order: byMessageGiver, where: eq(hugs.workspace, workspace) }, page);
}

export function hugsInCreationOrder(ctx: QueryContext, page: PageOptions): Promise<Page<Hug>> {
  return paginate<Hug>(ctx.tx, { table: hugs, order: hugsCreated }, page);
}

export type PaidHug = { hug: Hug; person: MemberId };

/** A page of the people hugs paid, in creation order; a hug that is gone leaves its row out, as `db.get` did. */
export async function paidHugsInCreationOrder(ctx: QueryContext, page: PageOptions): Promise<Page<PaidHug>> {
  const result = await paginate<Doc<"hugPeople">>(ctx.tx, { table: hugPeople, order: paidCreated }, page);
  const paid: PaidHug[] = [];
  for (const { hug, member } of result.page) {
    const found = await hugWithId(ctx, hug);
    if (found !== null) paid.push({ hug: found, person: member });
  }
  return { ...result, page: paid };
}

export type HugPeoplePage = { people: MemberId[]; next: string | null };

export async function hugPeoplePageOf(ctx: QueryContext, hug: Hug, cursor: string | null, numItems: number): Promise<HugPeoplePage> {
  if (hug.author !== undefined) return { people: [hug.author], next: null };
  const { page, isDone, continueCursor } = await recipientsPageOf(ctx, hug, { cursor, numItems });
  return { people: page, next: isDone ? null : continueCursor };
}

export type HugPeopleAfter = { people: MemberId[]; last: MemberId | null };

export async function hugPeopleAfter(ctx: QueryContext, hug: Hug, after: MemberId | null, atMost: number): Promise<HugPeopleAfter> {
  if (hug.author !== undefined) return { people: after === null ? [hug.author] : [], last: null };
  const people = await recipientsAfter(ctx, hug, after, atMost);
  return { people, last: people.length < atMost ? null : people.at(-1)! };
}

export async function hugsGivenOn(ctx: QueryContext, giver: MemberId, day: DayKey, atMost: number): Promise<number> {
  const given = await ctx.tx
    .select({ _id: hugs._id })
    .from(hugs)
    .where(and(eq(hugs.giver, giver), eq(hugs.day, day)))
    .orderBy(...byGiverDay.orderBy())
    .limit(atMost);
  return given.length;
}

export type HuggedPerson = { person: MemberId; at: number };

export async function peopleHuggedIn(ctx: QueryContext, giver: MemberId, { monday, sunday }: Week): Promise<HuggedPerson[]> {
  const rows = await ctx.tx
    .select()
    .from(hugs)
    .where(and(eq(hugs.giver, giver), gte(hugs.day, monday), lte(hugs.day, sunday)))
    .orderBy(...byGiverDay.orderBy());
  const hugged = [];
  for (const hug of rows.map(hugOfRow)) hugged.push(...(await peopleOf(ctx, hug)).map((person) => ({ person, at: hug.at })));
  return hugged;
}

export async function hasHuggedBefore(ctx: QueryContext, giver: MemberId): Promise<boolean> {
  const earlier = await ctx.tx.select({ _id: hugs._id }).from(hugs).where(eq(hugs.giver, giver)).orderBy(...byGiverDecided.orderBy()).limit(1);
  return earlier.length > 0;
}

export type NewHug = MessageRef & HugFor & { giver: MemberId; emoji: string; at: number; day: DayKey };

export async function insertHug(ctx: MutationContext, hug: NewHug): Promise<void> {
  await ctx.tx.insert(hugs).values(fromDocument(hugs, { ...ctx.newRow(), ...hug }) as typeof hugs.$inferInsert);
}

export async function isPaid(ctx: QueryContext, hug: Hug, member: MemberId): Promise<boolean> {
  const rows = await ctx.tx
    .select({ _id: hugPeople._id })
    .from(hugPeople)
    .where(and(eq(hugPeople.hug, hug._id), eq(hugPeople.member, member)))
    .orderBy(...paidByHugMember.orderBy())
    .limit(2);
  return unique("hugPeople", rows) !== null;
}

export async function insertPaid(ctx: MutationContext, hug: Hug, member: MemberId): Promise<void> {
  await ctx.tx.insert(hugPeople).values(fromDocument(hugPeople, { ...ctx.newRow(), hug: hug._id, member, at: hug.at }) as typeof hugPeople.$inferInsert);
}

/** Writes the member's next version of their hugs on the hug's message, and marks the one it replaces superseded. */
export async function countReceivedOnTheMessage(ctx: MutationContext, hug: Hug, member: MemberId): Promise<void> {
  const { workspace, conversation, message, onKudos, emoji, at } = hug;
  const [newest] = await ctx.tx
    .select()
    .from(hugsReceived)
    .where(and(eq(hugsReceived.member, member), eq(hugsReceived.workspace, workspace), eq(hugsReceived.conversation, conversation), eq(hugsReceived.message, message)))
    .orderBy(...receivedByMemberMessage.orderBy("desc"))
    .limit(1);
  const current = newest === undefined ? null : receivedOfRow(newest);
  const giver = { giver: hug.giver, at };
  const next =
    current === null
      ? { hugs: 1, emoji, at, givers: [giver] }
      : { hugs: current.hugs + 1, givers: newestGivers([...current.givers, giver]), ...(at >= current.at ? { emoji, at } : { emoji: current.emoji, at: current.at }) };
  const version = ctx.newRow();
  await ctx.tx.insert(hugsReceived).values(fromDocument(hugsReceived, { ...version, member, workspace, conversation, message, onKudos, ...next }) as typeof hugsReceived.$inferInsert);
  if (current !== null) await ctx.tx.update(hugsReceived).set({ supersededAt: version._creationTime }).where(eq(hugsReceived._id, current._id));
}

function newestGivers(givers: PaidGiver[]): PaidGiver[] {
  return givers.toSorted((one, other) => other.at - one.at).slice(0, giversShown);
}

export type TimelineHug = { message: MessageRef; onKudos: boolean; emoji: string; at: number; created: number };

export type GivenHug = TimelineHug & { people: MemberId[] };

export type ReceivedHugs = TimelineHug & { hugs: number; givers: MemberId[] };

type PaidGiver = { giver: MemberId; at: number };

const giversShown = 5;

// How many rows a timeline reads at a time: Convex streamed the index lazily, and its callers stop early.
const timelineBatch = 50;

export async function* hugsGivenByDecision(ctx: QueryContext, giver: MemberId, below: DecidedBelow): AsyncGenerator<GivenHug> {
  const rows = newestFirst(ctx, hugs, byGiverDecided, and(eq(hugs.giver, giver), decidedBelow(hugs._creationTime, below))!, hugOfRow);
  for await (const hug of rows) yield { ...timelineHugOf(hug), people: await peopleOf(ctx, hug) };
}

export async function hugsReceivedSnapshot(ctx: QueryContext, member: MemberId): Promise<number> {
  const [newest] = await ctx.tx
    .select({ _creationTime: hugsReceived._creationTime })
    .from(hugsReceived)
    .where(eq(hugsReceived.member, member))
    .orderBy(...receivedByMember.orderBy("desc"))
    .limit(1);
  return newest?._creationTime ?? 0;
}

export async function* hugsReceivedByDecision(ctx: QueryContext, member: MemberId, below: DecidedBelow, snapshot: number | undefined): AsyncGenerator<ReceivedHugs> {
  const versions = newestFirst(ctx, hugsReceived, receivedByMember, and(eq(hugsReceived.member, member), decidedBelow(hugsReceived._creationTime, below))!, receivedOfRow);
  for await (const version of versions) if (isLiveAt(version, snapshot)) yield receivedHugsOf(version);
}

export async function newestHugsPaidTo(ctx: QueryContext, member: MemberId, since: number, atMost: number): Promise<Hug[]> {
  const paid = await ctx.tx
    .select({ hug: hugPeople.hug })
    .from(hugPeople)
    .where(and(eq(hugPeople.member, member), gte(hugPeople.at, since)))
    .orderBy(...paidByMemberAt.orderBy("desc"))
    .limit(atMost);
  const found = [];
  for (const { hug } of paid) {
    const row = await hugWithId(ctx, hug);
    if (row !== null) found.push(row);
  }
  return found;
}

export async function hugsOnTheMessageAsOf(ctx: QueryContext, member: MemberId, { workspace, conversation, message }: MessageRef, at: number): Promise<number> {
  const [version] = await ctx.tx
    .select({ hugs: hugsReceived.hugs })
    .from(hugsReceived)
    .where(
      and(
        eq(hugsReceived.member, member),
        eq(hugsReceived.workspace, workspace),
        eq(hugsReceived.conversation, conversation),
        eq(hugsReceived.message, message),
        lte(hugsReceived._creationTime, at),
      ),
    )
    .orderBy(...receivedByMemberMessage.orderBy("desc"))
    .limit(1);
  return version?.hugs ?? 0;
}

// Convex's `decidedBelow` on an index whose last field is `_creationTime`: above `above`, and below or at `decided`.
function decidedBelow(creationTime: typeof hugs._creationTime | typeof hugsReceived._creationTime, { decided, inclusive, above }: DecidedBelow): SQL | undefined {
  return and(above === undefined ? undefined : gt(creationTime, above), decided === Infinity ? undefined : inclusive ? lte(creationTime, decided) : lt(creationTime, decided));
}

// The index walked newest first, a batch at a time, as Convex's `for await` over `.order("desc")` read it.
async function* newestFirst<Table extends typeof hugs | typeof hugsReceived, Document extends { _creationTime: number; _id: string }>(
  ctx: QueryContext,
  table: Table,
  order: IndexOrder,
  where: SQL,
  read: (row: Record<string, unknown>) => Document,
): AsyncGenerator<Document> {
  let last: Document | undefined;
  for (;;) {
    const rows = await ctx.tx
      .select()
      .from(table as typeof hugs)
      .where(last === undefined ? where : and(where, order.after(last, "desc")))
      .orderBy(...order.orderBy("desc"))
      .limit(timelineBatch);
    for (const row of rows) yield (last = read(row));
    if (rows.length < timelineBatch) return;
  }
}

function isLiveAt({ _creationTime, supersededAt }: HugsReceivedRow, snapshot: number | undefined): boolean {
  if (snapshot === undefined) return supersededAt === undefined;
  return _creationTime <= snapshot && (supersededAt === undefined || supersededAt > snapshot);
}

function receivedHugsOf(row: HugsReceivedRow): ReceivedHugs {
  return { ...timelineHugOf(row), hugs: row.hugs, givers: row.givers.map(({ giver }) => giver) };
}

function timelineHugOf({ workspace, conversation, message, onKudos, emoji, at, _creationTime }: Hug | HugsReceivedRow): TimelineHug {
  return { message: { workspace, conversation, message }, onKudos, emoji, at, created: _creationTime };
}

async function peopleOf(ctx: QueryContext, hug: Hug): Promise<MemberId[]> {
  if (hug.author !== undefined) return [hug.author];
  return (await awardsOfMessage(ctx, hug)).map(({ recipient }) => recipient);
}
