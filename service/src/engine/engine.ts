// The engine: a message event in, an observation out. Today's convex/engine/engine.ts over the service's transaction.
// A kudos message's row follows its newest revision; a first kudos revision is evaluated once every person on it is in
// the directory, rechecked on a backoff while one isn't, and an edit evaluates again only while nothing was given.
import { and, eq, gte, lt } from "drizzle-orm";
import type { AttemptFailedEvent, KudosGivenEvent } from "../bus/events.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { paginate } from "../db/page.ts";
import { kudosMessages, type Doc } from "../db/schema/index.ts";
import { clearIndicator, setIndicator, type Indicator } from "../feedback/indicator.ts";
import { replyPrivately, type Given, type Invalid, type OverAllowance, type Reply, type SkipReason, type SkippedMention } from "../feedback/replies.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { annotationsOf, fingerprintOf, kudosEmojiClosestAfter, kudosFor, kudosMessageOf, mostKudosIn, type KudosMessage, type ParseContext } from "../parser/parser.ts";
import { lookup, type MemberFacts, type MemberId } from "../workspace/directory.ts";
import { insertRow as insertDocument, patchRow, rowById, uniqueRow } from "../workspace/rows.ts";
import { settingsOf } from "../workspace/settings.ts";
import { allowanceDay, dailyAllowance, type DayKey } from "./allowance.ts";
import { insertAwards, type Award } from "./awards.ts";
import { deletionRequested, forgetDeleted, forgetWords, forgetWordsOfGiven, hasKudosText, keepFetchedWords, keepWords, removeWords } from "./kudosText.ts";
import { countableOf, type Annotations, type ChatUserId, type FetchedMessage, type Mention, type MessageDeleted, type MessageEvent, type MessageRef } from "./messageEvent.ts";
import { keepSpotlightUpToDate } from "./spotlight.ts";

export type Outcome =
  | ({ kind: "given"; awards: Award[]; kudosEmoji: string } & Given)
  | ({ kind: "over-allowance" } & OverAllowance)
  | ({ kind: "invalid" } & Invalid);

export type Observation =
  | { kind: "ignored"; why: "not-a-member" | "ordinary-chat" | "stale-revision" | "unchanged" }
  | { kind: "awaiting-directory"; users: ChatUserId[]; retryInMs: number; attempt: bigint }
  | { kind: "abandoned" }
  | { kind: "withdrawn" }
  | { kind: "deleted" }
  | { kind: "already-given"; toldGiver: boolean }
  | { kind: "evaluated"; outcome: Outcome };

export type Hydration = { kind: "hydrated" } | { kind: "refused"; why: "not-given" | "stale-revision" | "not-a-member" | "ordinary-chat" | "already-known" | "deletion-requested" };

type KudosMessageRow = Doc<"kudosMessages">;
type Member = Extract<MemberFacts, { kind: "member" }>;

const directoryCheckDelaysMs = [0, 1, 5, 30, 120, 360].map((minutes) => minutes * 60_000);

const inCreationOrder = indexOrder(kudosMessages, []);
const byMessage = indexOrder(kudosMessages, ["workspace", "conversation", "message"]);
const byStateAndNextCheck = indexOrder(kudosMessages, ["state", "nextCheckAt"]);

export async function observe(ctx: MutationContext, event: MessageEvent | MessageDeleted): Promise<Observation> {
  return keepingSpotlightUpToDate(ctx, event.ref, observeMessage(ctx, event));
}

async function observeMessage(ctx: MutationContext, event: MessageEvent | MessageDeleted): Promise<Observation> {
  if (event.kind === "deleted") return observeDeletion(ctx, event);
  const existing = await kudosMessageRow(ctx, event.ref);
  if (existing !== null && event.revision <= existing.revision) {
    return { kind: "ignored", why: event.revision === existing.revision ? "unchanged" : "stale-revision" };
  }

  const author = await lookup(ctx, event.ref.workspace, event.author);
  const context = { workspace: event.ref.workspace, giver: author?.kind === "member" ? author.member : undefined };
  const revision = {
    revision: event.revision,
    content: countableOf(event.content),
    annotations: annotationsOf(event.content, context),
  };
  if (author !== undefined && author.kind !== "member") return observeFromNonMember(ctx, existing, event, revision, context);
  const kudos = await kudosMessageOf(ctx, event.content, context);
  await followWords(ctx, event, existing, kudos !== null, revision.annotations);
  if (existing === null) return observeFirstRevision(ctx, event, revision, kudos !== null);
  const changesKudos = await changesKudosOf(ctx, event, existing, context);
  return observeEdit(ctx, existing, event, revision, { isKudosMessage: kudos !== null, changesKudos });
}

export async function hydrate(ctx: MutationContext, fetched: FetchedMessage): Promise<Hydration> {
  return keepingSpotlightUpToDate(ctx, fetched.ref, hydrateMessage(ctx, fetched));
}

async function hydrateMessage(ctx: MutationContext, fetched: FetchedMessage): Promise<Hydration> {
  const row = await kudosMessageRow(ctx, fetched.ref);
  if (row?.state !== "given") return refused("not-given");
  if (fetched.revision < row.revision) return refused("stale-revision");
  if (await hasKudosText(ctx, fetched.ref)) return refused("already-known");
  if (fetched.revision > row.revision) await followFetchedRevision(ctx, row, fetched);
  const author = await lookup(ctx, fetched.ref.workspace, fetched.author);
  if (author?.kind !== "member") return refused("not-a-member");
  if (await deletionRequested(ctx, { workspace: fetched.ref.workspace, author: fetched.author })) return refused("deletion-requested");
  const context = { workspace: fetched.ref.workspace, giver: author.member };
  if ((await kudosMessageOf(ctx, fetched.content, context)) === null) {
    await forgetWordsOfGiven(ctx, fetched.ref);
    return refused("ordinary-chat");
  }
  await keepFetchedWords(ctx, fetched, annotationsOf(fetched.content, context));
  return { kind: "hydrated" };
}

async function followFetchedRevision(ctx: MutationContext, row: KudosMessageRow, { revision, content }: FetchedMessage) {
  await patch(ctx, row, { revision, content: countableOf(content) });
}

async function keepingSpotlightUpToDate<T>(ctx: MutationContext, ref: MessageRef, change: Promise<T>): Promise<T> {
  const result = await change;
  await keepSpotlightUpToDate(ctx, ref);
  return result;
}

function refused(why: Extract<Hydration, { kind: "refused" }>["why"]): Hydration {
  return { kind: "refused", why };
}

async function observeDeletion(ctx: MutationContext, { ref, wasKudosCandidate }: MessageDeleted): Promise<Observation> {
  const isKnown = (await kudosMessageRow(ctx, ref)) !== null;
  if (!isKnown && !wasKudosCandidate) return { kind: "ignored", why: "ordinary-chat" };
  await forgetDeleted(ctx, ref);
  return { kind: "deleted" };
}

async function followWords(ctx: MutationContext, event: MessageEvent, existing: KudosMessageRow | null, isKudosMessage: boolean, annotations: Annotations) {
  if (isKudosMessage) await keepWords(ctx, event, annotations);
  else if (existing?.state === "given") await forgetWordsOfGiven(ctx, event.ref);
  else await forgetWords(ctx, event.ref);
}

async function changesKudosOf(ctx: MutationContext, event: MessageEvent, row: KudosMessageRow, context: ParseContext) {
  return (await fingerprintOf(ctx, event.content, context)) !== (await fingerprintOf(ctx, row.content, context));
}

type Revision = Pick<KudosMessageRow, "revision" | "content" | "annotations">;
type Edit = { isKudosMessage: boolean; changesKudos: boolean };

async function observeFirstRevision(ctx: MutationContext, event: MessageEvent, revision: Revision, isKudosMessage: boolean): Promise<Observation> {
  if (!isKudosMessage) {
    if (event.kind === "edited") await insertRow(ctx, event, revision, "watermark");
    return { kind: "ignored", why: "ordinary-chat" };
  }
  return evaluate(ctx, await insertRow(ctx, event, revision, "awaiting-directory"));
}

async function observeEdit(ctx: MutationContext, row: KudosMessageRow, event: MessageEvent, revision: Revision, { isKudosMessage, changesKudos }: Edit): Promise<Observation> {
  await patch(ctx, row, withoutAnnotations(revision));
  if (row.state === "given") {
    if (!isKudosMessage) await clearIndicator(ctx, refOf(row));
    if (changesKudos) await replyPrivately(ctx, refOf(row), row.threadRoot, row.author, { kind: "accepted-message-edited" });
    return { kind: "already-given", toldGiver: changesKudos };
  }
  if (!changesKudos) return { kind: "ignored", why: "unchanged" };
  if (!isKudosMessage) return hasOpenAttempt(row) ? withdraw(ctx, row) : ignore(ctx, row, "ordinary-chat");

  await patch(ctx, row, { state: "awaiting-directory", attempt: event.revision, spendsAt: event.at, checks: 0, retry: isRetry(row), annotations: revision.annotations });
  const observation = await evaluate(ctx, (await rowById<KudosMessageRow>(ctx, kudosMessages, row._id))!);
  if (observation.kind === "awaiting-directory" && showsIndicator(row)) await setIndicator(ctx, refOf(row), null);
  return observation;
}

async function observeFromNonMember(ctx: MutationContext, row: KudosMessageRow | null, event: MessageEvent, revision: Revision, context: ParseContext): Promise<Observation> {
  const notAMember: Observation = { kind: "ignored", why: "not-a-member" };
  if (row === null) {
    if (event.kind === "edited") await insertRow(ctx, event, revision, "watermark");
    return notAMember;
  }
  const changesKudos = await changesKudosOf(ctx, event, row, context);
  await patch(ctx, row, withoutAnnotations(revision));
  await removeWords(ctx, event.ref);
  return changesKudos && hasOpenAttempt(row) ? withdraw(ctx, row) : notAMember;
}

async function withdraw(ctx: MutationContext, row: KudosMessageRow): Promise<Observation> {
  await patch(ctx, row, { state: "withdrawn", retry: true });
  if (showsIndicator(row)) await setIndicator(ctx, refOf(row), null);
  return { kind: "withdrawn" };
}

function withoutAnnotations({ revision, content }: Revision) {
  return { revision, content };
}

function isRetry(row: KudosMessageRow) {
  return row.retry === true || showsIndicator(row) || row.state === "withdrawn";
}

function hasOpenAttempt(row: KudosMessageRow) {
  return row.state === "awaiting-directory" || showsIndicator(row);
}

function showsIndicator(row: KudosMessageRow) {
  return row.state === "over-allowance" || row.state === "invalid";
}

async function insertRow(ctx: MutationContext, event: MessageEvent, revision: Revision, state: "watermark" | "awaiting-directory") {
  await insertDocument(ctx, kudosMessages, {
    ...event.ref,
    ...(event.threadRoot && { threadRoot: event.threadRoot }),
    author: event.author,
    ...revision,
    state,
    attempt: event.revision,
    spendsAt: event.at,
    checks: 0,
  });
  return (await kudosMessageRow(ctx, event.ref))!;
}

/** Convex's `ctx.db.patch` on a kudos message's row. */
async function patch(ctx: MutationContext, row: KudosMessageRow, fields: Partial<Omit<KudosMessageRow, "_id" | "_creationTime">>) {
  await patchRow(ctx, kudosMessages, row._id, fields);
}

export async function threadRootOf(ctx: QueryContext, ref: MessageRef): Promise<string | null> {
  return (await kudosMessageRow(ctx, ref))?.threadRoot ?? null;
}

export async function givenWithoutWords(ctx: QueryContext, cursor: string | null, numItems: number): Promise<{ refs: { workspace: string; conversation: string; message: string }[]; cursor: string; isDone: boolean }> {
  const page = await paginate<KudosMessageRow>(ctx.tx, { table: kudosMessages, order: inCreationOrder }, { cursor, numItems });
  const awaiting = await Promise.all(page.page.map(async (row) => ((await awaitsWords(ctx, row)) ? [refOf(row)] : [])));
  return { refs: awaiting.flat(), cursor: page.continueCursor, isDone: page.isDone };
}

export async function threadOfGivenWithoutWords(ctx: QueryContext, ref: MessageRef): Promise<{ threadRoot?: string } | null> {
  const row = await kudosMessageRow(ctx, ref);
  if (row === null || !(await awaitsWords(ctx, row))) return null;
  return row.threadRoot === undefined ? {} : { threadRoot: row.threadRoot };
}

async function awaitsWords(ctx: QueryContext, row: KudosMessageRow) {
  return row.state === "given" && !(await hasKudosText(ctx, refOf(row))) && !(await deletionRequested(ctx, row));
}

export async function awaitedUsers(ctx: QueryContext, ref: MessageRef, attempt: bigint): Promise<ChatUserId[] | null> {
  const row = await kudosMessageRow(ctx, ref);
  if (row?.state !== "awaiting-directory" || row.attempt !== attempt) return null;
  return unknownUsers(ctx, row);
}

export async function recheck(ctx: MutationContext, ref: MessageRef, attempt: bigint): Promise<Observation> {
  return keepingSpotlightUpToDate(ctx, ref, recheckMessage(ctx, ref, attempt));
}

async function recheckMessage(ctx: MutationContext, ref: MessageRef, attempt: bigint): Promise<Observation> {
  const row = await kudosMessageRow(ctx, ref);
  if (row === null || row.state !== "awaiting-directory") return { kind: "ignored", why: "unchanged" };
  if (row.attempt !== attempt) return { kind: "ignored", why: "stale-revision" };
  return evaluate(ctx, row);
}

async function evaluate(ctx: MutationContext, row: KudosMessageRow): Promise<Observation> {
  const giver = await lookup(ctx, row.workspace, row.author);
  if (giver !== undefined && giver.kind !== "member") return ignore(ctx, row, "not-a-member");
  const kudos = await kudosMessageOf(ctx, row.content, { workspace: row.workspace, giver: giver?.member });
  if (kudos === null) return ignore(ctx, row, "ordinary-chat");

  const unknown = await unknownUsers(ctx, row);
  if (giver === undefined || unknown.length > 0) return awaitDirectory(ctx, row, unknown);

  const settings = await settingsOf(ctx, row.workspace);
  const outcome = await decide(ctx, row, giver, kudos, settings.baseAllowance);
  await patch(ctx, row, { state: outcome.kind });
  await tellGiver(ctx, row, outcome, settings.baseAllowance);
  return { kind: "evaluated", outcome };
}

async function awaitDirectory(ctx: MutationContext, row: KudosMessageRow, users: ChatUserId[]): Promise<Observation> {
  const retryInMs = directoryCheckDelaysMs[row.checks];
  if (retryInMs === undefined) {
    await patch(ctx, row, { state: "abandoned" });
    return { kind: "abandoned" };
  }
  await patch(ctx, row, { checks: row.checks + 1, nextCheckAt: ctx.now + retryInMs });
  return { kind: "awaiting-directory", users, retryInMs, attempt: row.attempt };
}

export async function takeStrandedChecks(ctx: MutationContext, dueBefore: number, limit: number): Promise<{ checkAgain: { ref: MessageRef; attempt: bigint }[]; pageWasFull: boolean }> {
  const rows = await ctx.tx
    .select()
    .from(kudosMessages)
    .where(and(eq(kudosMessages.state, "awaiting-directory"), gte(kudosMessages.nextCheckAt, 0), lt(kudosMessages.nextCheckAt, dueBefore)))
    .orderBy(...byStateAndNextCheck.orderBy())
    .limit(limit);
  const stranded = rows.map((row) => toKudosMessage(row));
  const checkAgain = [];
  for (const row of stranded) {
    if (await giveUpWhenChecksRanOut(ctx, row)) continue;
    await patch(ctx, row, { checks: row.checks + 1, nextCheckAt: ctx.now });
    checkAgain.push({ ref: refOf(row), attempt: row.attempt });
  }
  return { checkAgain, pageWasFull: stranded.length === limit };
}

async function giveUpWhenChecksRanOut(ctx: MutationContext, row: KudosMessageRow) {
  const checksRanOut = row.checks > directoryCheckDelaysMs.length;
  if (checksRanOut) await patch(ctx, row, { state: "abandoned" });
  return checksRanOut;
}

async function tellGiver(ctx: MutationContext, row: KudosMessageRow, outcome: Outcome, base: number) {
  const indicator = indicatorOf(outcome);
  await (indicator === null ? clearIndicator(ctx, refOf(row)) : setIndicator(ctx, refOf(row), indicator));
  await replyPrivately(ctx, refOf(row), row.threadRoot, row.author, replyOf(outcome, base));
}

function replyOf(outcome: Outcome, base: number): Reply {
  switch (outcome.kind) {
    case "given":
      return { kind: "given", outcome, base };
    case "over-allowance":
      return { kind: "over-allowance", outcome, base };
    case "invalid":
      return { kind: "invalid", outcome };
  }
}

function indicatorOf(outcome: Outcome): Indicator {
  if (outcome.kind === "given") return { emoji: outcome.kudosEmoji };
  if (outcome.kind === "over-allowance") return { emoji: "hourglass_flowing_sand" };
  return null;
}

async function decide(ctx: MutationContext, row: KudosMessageRow, giver: Member, kudos: KudosMessage, baseAllowance: number): Promise<Outcome> {
  const { recipients, skipped } = await sortMentions(ctx, row.workspace, kudos, giver.member);
  const day = allowanceDay(row.spendsAt, giver.timeZone);
  const allowance = await dailyAllowance(ctx, giver.member, day, baseAllowance);
  const perRecipient = recipients.length === 0 ? mostKudosIn(kudos) : Math.max(...recipients.map(({ kudos }) => kudos));
  const cost = recipients.reduce((sum, { kudos }) => sum + kudos, 0);
  const attempt = attemptFacts(row, giver, skipped, day);

  if (recipients.length === 0) {
    await publishFailure(ctx, attempt, { outcome: "invalid", recipients: 0, perRecipient, cost, allowance: { dailyLeft: allowance.left } });
    return { kind: "invalid", skipped };
  }
  if (cost > allowance.left) {
    await publishFailure(ctx, attempt, { outcome: "over-allowance", recipients: recipients.length, perRecipient, cost, allowance: { dailyLeft: allowance.left } });
    return { kind: "over-allowance", cost, recipients: recipients.length, perRecipient, left: allowance.left };
  }

  const awards = recipients.map(({ member, kudos }) => ({ giver: giver.member, recipient: member, kudos }));
  const kudosEmoji = kudosEmojiClosestAfter(kudos, recipients[0]!.user);
  const left = allowance.left - cost;
  await allowance.spend(cost);
  const given: KudosGivenEvent = {
    type: "kudosGiven",
    ...attempt,
    awards: await insertAwards(ctx, refOf(row), awards, day, row.spendsAt),
    via: "message",
    kudosEmoji,
    ...(kudos.ownedEmoji.length === 0 ? {} : { ownedEmoji: kudos.ownedEmoji }),
    annotations: row.annotations,
    allowance: { dailyOpening: allowance.opening, dailyLeft: left },
  };
  await ctx.publish(given);
  return { kind: "given", awards, kudosEmoji, recipients: recipients.map(({ user, kudos }) => ({ user, kudos })), left, skipped };
}

type AttemptFacts = Pick<AttemptFailedEvent, "workspace" | "message" | "giver" | "skippedMentions" | "retry" | "inThread" | "day" | "at">;
type Failure = Pick<AttemptFailedEvent, "outcome" | "recipients" | "perRecipient" | "cost" | "allowance">;

function attemptFacts(row: KudosMessageRow, giver: Member, skipped: SkippedMention[], day: DayKey): AttemptFacts {
  return {
    workspace: row.workspace,
    message: refOf(row),
    giver: giver.member,
    skippedMentions: skipped.length,
    retry: row.retry === true,
    inThread: row.threadRoot !== undefined,
    day,
    at: row.spendsAt,
  };
}

async function publishFailure(ctx: MutationContext, attempt: AttemptFacts, failure: Failure) {
  await ctx.publish({ type: "attemptFailed", ...attempt, ...failure });
}

type Recipient = { member: MemberId; user: ChatUserId; kudos: number };

async function sortMentions(ctx: QueryContext, workspace: string, kudos: KudosMessage, giver: MemberId) {
  const recipients: Recipient[] = [];
  const skipped: SkippedMention[] = [];
  for (const mention of uniqueMentions(kudos.mentions)) {
    const sorted = await recipientOrSkipReason(ctx, workspace, mention, giver, kudos);
    if (typeof sorted === "string") skipped.push({ mention, reason: sorted });
    else recipients.push(sorted);
  }
  return { recipients, skipped };
}

async function recipientOrSkipReason(ctx: QueryContext, workspace: string, mention: Mention, giver: MemberId, message: KudosMessage): Promise<Recipient | SkipReason> {
  if (mention.kind !== "person") return "group-or-broadcast";
  const facts = await lookup(ctx, workspace, mention.user);
  if (facts?.kind === "bot") return "bot";
  if (facts?.kind !== "member") return "not-a-member";
  if (facts.member === giver) return "self";
  const kudos = kudosFor(message, mention.user);
  if (kudos === 0) return "someone-elses-hype-emoji";
  return { member: facts.member, user: mention.user, kudos };
}

function uniqueMentions(mentions: Mention[]) {
  return [...new Map(mentions.map((mention) => [JSON.stringify(mention), mention])).values()];
}

async function unknownUsers(ctx: QueryContext, row: KudosMessageRow): Promise<ChatUserId[]> {
  const users = [...new Set([row.author, ...personMentions(row.content.mentions)])];
  const facts = await Promise.all(users.map((user) => lookup(ctx, row.workspace, user)));
  return users.filter((_, index) => facts[index] === undefined);
}

async function ignore(ctx: MutationContext, row: KudosMessageRow, why: "not-a-member" | "ordinary-chat"): Promise<Observation> {
  await patch(ctx, row, { state: "watermark" });
  await (why === "not-a-member" ? removeWords(ctx, refOf(row)) : forgetWords(ctx, refOf(row)));
  return { kind: "ignored", why };
}

function personMentions(mentions: Mention[]): ChatUserId[] {
  return mentions.flatMap((mention) => (mention.kind === "person" ? [mention.user] : []));
}

function refOf(row: KudosMessageRow): MessageRef {
  return { workspace: row.workspace, conversation: row.conversation, message: row.message };
}

function toKudosMessage(row: Record<string, unknown>): KudosMessageRow {
  return toDocument<KudosMessageRow>(kudosMessages, row);
}

async function kudosMessageRow(ctx: QueryContext, ref: MessageRef): Promise<KudosMessageRow | null> {
  const where = and(eq(kudosMessages.workspace, ref.workspace), eq(kudosMessages.conversation, ref.conversation), eq(kudosMessages.message, ref.message));
  return uniqueRow<KudosMessageRow>(ctx, kudosMessages, where, byMessage);
}
