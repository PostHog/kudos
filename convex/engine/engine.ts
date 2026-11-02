import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { AttemptFailedEvent } from "../bus/events";
import { publish } from "../bus/publish";
import { clearIndicator, setIndicator, type Indicator } from "../feedback/indicator";
import { replyPrivately, type Given, type Invalid, type OverAllowance, type Reply, type SkipReason, type SkippedMention } from "../feedback/replies";
import { lookup, type MemberFacts, type MemberId } from "../workspace/directory";
import { settingsOf } from "../workspace/settings";
import { allowanceDay, dailyAllowance, type DayKey } from "./allowance";
import { insertAwards, type Award } from "./awards";
import { keepSpotlightUpToDate } from "./spotlight";
import { deletionRequested, forgetDeleted, forgetWords, forgetWordsOfGiven, hasKudosText, keepFetchedWords, keepWords, removeWords } from "./kudosText";
import { countableOf, type Annotations, type ChatUserId, type FetchedMessage, type Mention, type MessageDeleted, type MessageEvent, type MessageRef } from "./messageEvent";
import { annotationsOf, fingerprintOf, kudosEmojiClosestAfter, kudosMessageOf, type KudosMessage, type ParseContext } from "../parser/parser";

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

export async function observe(ctx: MutationCtx, event: MessageEvent | MessageDeleted): Promise<Observation> {
  return keepingSpotlightUpToDate(ctx, event.ref, observeMessage(ctx, event));
}

async function observeMessage(ctx: MutationCtx, event: MessageEvent | MessageDeleted): Promise<Observation> {
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

export async function hydrate(ctx: MutationCtx, fetched: FetchedMessage): Promise<Hydration> {
  return keepingSpotlightUpToDate(ctx, fetched.ref, hydrateMessage(ctx, fetched));
}

async function hydrateMessage(ctx: MutationCtx, fetched: FetchedMessage): Promise<Hydration> {
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

async function followFetchedRevision(ctx: MutationCtx, row: KudosMessageRow, { revision, content }: FetchedMessage) {
  await ctx.db.patch(row._id, { revision, content: countableOf(content) });
}

async function keepingSpotlightUpToDate<T>(ctx: MutationCtx, ref: MessageRef, change: Promise<T>): Promise<T> {
  const result = await change;
  await keepSpotlightUpToDate(ctx, ref);
  return result;
}

function refused(why: Extract<Hydration, { kind: "refused" }>["why"]): Hydration {
  return { kind: "refused", why };
}

async function observeDeletion(ctx: MutationCtx, { ref, wasKudosCandidate }: MessageDeleted): Promise<Observation> {
  const isKnown = (await kudosMessageRow(ctx, ref)) !== null;
  if (!isKnown && !wasKudosCandidate) return { kind: "ignored", why: "ordinary-chat" };
  await forgetDeleted(ctx, ref);
  return { kind: "deleted" };
}

async function followWords(ctx: MutationCtx, event: MessageEvent, existing: KudosMessageRow | null, isKudosMessage: boolean, annotations: Annotations) {
  if (isKudosMessage) await keepWords(ctx, event, annotations);
  else if (existing?.state === "given") await forgetWordsOfGiven(ctx, event.ref);
  else await forgetWords(ctx, event.ref);
}

async function changesKudosOf(ctx: MutationCtx, event: MessageEvent, row: KudosMessageRow, context: ParseContext) {
  return (await fingerprintOf(ctx, event.content, context)) !== (await fingerprintOf(ctx, row.content, context));
}

type Revision = Pick<KudosMessageRow, "revision" | "content" | "annotations">;
type Edit = { isKudosMessage: boolean; changesKudos: boolean };

async function observeFirstRevision(ctx: MutationCtx, event: MessageEvent, revision: Revision, isKudosMessage: boolean): Promise<Observation> {
  if (!isKudosMessage) {
    if (event.kind === "edited") await insertRow(ctx, event, revision, "watermark");
    return { kind: "ignored", why: "ordinary-chat" };
  }
  return evaluate(ctx, await insertRow(ctx, event, revision, "awaiting-directory"));
}

async function observeEdit(ctx: MutationCtx, row: KudosMessageRow, event: MessageEvent, revision: Revision, { isKudosMessage, changesKudos }: Edit): Promise<Observation> {
  await ctx.db.patch(row._id, withoutAnnotations(revision));
  if (row.state === "given") {
    if (!isKudosMessage) await clearIndicator(ctx, refOf(row));
    if (changesKudos) await replyPrivately(ctx, refOf(row), row.threadRoot, row.author, { kind: "accepted-message-edited" });
    return { kind: "already-given", toldGiver: changesKudos };
  }
  if (!changesKudos) return { kind: "ignored", why: "unchanged" };
  if (!isKudosMessage) return hasOpenAttempt(row) ? withdraw(ctx, row) : ignore(ctx, row, "ordinary-chat");

  await ctx.db.patch(row._id, { state: "awaiting-directory", attempt: event.revision, spendsAt: event.at, checks: 0, retry: isRetry(row), annotations: revision.annotations });
  const observation = await evaluate(ctx, (await ctx.db.get(row._id))!);
  if (observation.kind === "awaiting-directory" && showsIndicator(row)) await setIndicator(ctx, refOf(row), null);
  return observation;
}

async function observeFromNonMember(ctx: MutationCtx, row: KudosMessageRow | null, event: MessageEvent, revision: Revision, context: ParseContext): Promise<Observation> {
  const notAMember: Observation = { kind: "ignored", why: "not-a-member" };
  if (row === null) {
    if (event.kind === "edited") await insertRow(ctx, event, revision, "watermark");
    return notAMember;
  }
  const changesKudos = await changesKudosOf(ctx, event, row, context);
  await ctx.db.patch(row._id, withoutAnnotations(revision));
  await removeWords(ctx, event.ref);
  return changesKudos && hasOpenAttempt(row) ? withdraw(ctx, row) : notAMember;
}

async function withdraw(ctx: MutationCtx, row: KudosMessageRow): Promise<Observation> {
  await ctx.db.patch(row._id, { state: "withdrawn", retry: true });
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

async function insertRow(ctx: MutationCtx, event: MessageEvent, revision: Revision, state: "watermark" | "awaiting-directory") {
  const id = await ctx.db.insert("kudosMessages", {
    ...event.ref,
    ...(event.threadRoot && { threadRoot: event.threadRoot }),
    author: event.author,
    ...revision,
    state,
    attempt: event.revision,
    spendsAt: event.at,
    checks: 0,
  });
  return (await ctx.db.get(id))!;
}

export async function threadRootOf(ctx: QueryCtx, ref: MessageRef): Promise<string | null> {
  return (await kudosMessageRow(ctx, ref))?.threadRoot ?? null;
}

export async function givenWithoutWords(ctx: QueryCtx, cursor: string | null, numItems: number) {
  const page = await ctx.db.query("kudosMessages").paginate({ cursor, numItems });
  const awaiting = await Promise.all(page.page.map(async (row) => ((await awaitsWords(ctx, row)) ? [refOf(row)] : [])));
  return { refs: awaiting.flat(), cursor: page.continueCursor, isDone: page.isDone };
}

export async function threadOfGivenWithoutWords(ctx: QueryCtx, ref: MessageRef): Promise<{ threadRoot?: string } | null> {
  const row = await kudosMessageRow(ctx, ref);
  if (row === null || !(await awaitsWords(ctx, row))) return null;
  return row.threadRoot === undefined ? {} : { threadRoot: row.threadRoot };
}

async function awaitsWords(ctx: QueryCtx, row: KudosMessageRow) {
  return row.state === "given" && !(await hasKudosText(ctx, refOf(row))) && !(await deletionRequested(ctx, row));
}

export async function awaitedUsers(ctx: QueryCtx, ref: MessageRef, attempt: bigint): Promise<ChatUserId[] | null> {
  const row = await kudosMessageRow(ctx, ref);
  if (row?.state !== "awaiting-directory" || row.attempt !== attempt) return null;
  return unknownUsers(ctx, row);
}

export async function recheck(ctx: MutationCtx, ref: MessageRef, attempt: bigint): Promise<Observation> {
  return keepingSpotlightUpToDate(ctx, ref, recheckMessage(ctx, ref, attempt));
}

async function recheckMessage(ctx: MutationCtx, ref: MessageRef, attempt: bigint): Promise<Observation> {
  const row = await kudosMessageRow(ctx, ref);
  if (row === null || row.state !== "awaiting-directory") return { kind: "ignored", why: "unchanged" };
  if (row.attempt !== attempt) return { kind: "ignored", why: "stale-revision" };
  return evaluate(ctx, row);
}

async function evaluate(ctx: MutationCtx, row: KudosMessageRow): Promise<Observation> {
  const giver = await lookup(ctx, row.workspace, row.author);
  if (giver !== undefined && giver.kind !== "member") return ignore(ctx, row, "not-a-member");
  const kudos = await kudosMessageOf(ctx, row.content, { workspace: row.workspace, giver: giver?.member });
  if (kudos === null) return ignore(ctx, row, "ordinary-chat");

  const unknown = await unknownUsers(ctx, row);
  if (giver === undefined || unknown.length > 0) return awaitDirectory(ctx, row, unknown);

  const settings = await settingsOf(ctx, row.workspace);
  const outcome = await decide(ctx, row, giver, kudos, settings.baseAllowance);
  await ctx.db.patch(row._id, { state: outcome.kind });
  await tellGiver(ctx, row, outcome, settings.baseAllowance);
  return { kind: "evaluated", outcome };
}

async function awaitDirectory(ctx: MutationCtx, row: KudosMessageRow, users: ChatUserId[]): Promise<Observation> {
  const retryInMs = directoryCheckDelaysMs[row.checks];
  if (retryInMs === undefined) {
    await ctx.db.patch(row._id, { state: "abandoned" });
    return { kind: "abandoned" };
  }
  await ctx.db.patch(row._id, { checks: row.checks + 1, nextCheckAt: Date.now() + retryInMs });
  return { kind: "awaiting-directory", users, retryInMs, attempt: row.attempt };
}

export async function takeStrandedChecks(ctx: MutationCtx, dueBefore: number, limit: number): Promise<{ checkAgain: { ref: MessageRef; attempt: bigint }[]; pageWasFull: boolean }> {
  const stranded = await ctx.db
    .query("kudosMessages")
    .withIndex("by_state_and_next_check", (q) => q.eq("state", "awaiting-directory").gte("nextCheckAt", 0).lt("nextCheckAt", dueBefore))
    .take(limit);
  const checkAgain = [];
  for (const row of stranded) {
    if (await giveUpWhenChecksRanOut(ctx, row)) continue;
    await ctx.db.patch(row._id, { checks: row.checks + 1, nextCheckAt: Date.now() });
    checkAgain.push({ ref: refOf(row), attempt: row.attempt });
  }
  return { checkAgain, pageWasFull: stranded.length === limit };
}

async function giveUpWhenChecksRanOut(ctx: MutationCtx, row: KudosMessageRow) {
  const checksRanOut = row.checks > directoryCheckDelaysMs.length;
  if (checksRanOut) await ctx.db.patch(row._id, { state: "abandoned" });
  return checksRanOut;
}

async function tellGiver(ctx: MutationCtx, row: KudosMessageRow, outcome: Outcome, base: number) {
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

async function decide(ctx: MutationCtx, row: KudosMessageRow, giver: Member, kudos: KudosMessage, baseAllowance: number): Promise<Outcome> {
  const { recipients, skipped } = await sortMentions(ctx, row.workspace, kudos.mentions, giver.member);
  const day = allowanceDay(row.spendsAt, giver.timeZone);
  const allowance = await dailyAllowance(ctx, giver.member, day, baseAllowance);
  const { perRecipient } = kudos;
  const cost = recipients.length * perRecipient;
  const attempt = attemptFacts(row, giver, skipped, day);

  if (recipients.length === 0) {
    await publishFailure(ctx, attempt, { outcome: "invalid", recipients: 0, perRecipient, cost, allowance: { dailyLeft: allowance.left } });
    return { kind: "invalid", skipped };
  }
  if (cost > allowance.left) {
    await publishFailure(ctx, attempt, { outcome: "over-allowance", recipients: recipients.length, perRecipient, cost, allowance: { dailyLeft: allowance.left } });
    return { kind: "over-allowance", cost, recipients: recipients.length, perRecipient, left: allowance.left };
  }

  const awards = recipients.map(({ member }) => ({ giver: giver.member, recipient: member, kudos: perRecipient }));
  const kudosEmoji = kudosEmojiClosestAfter(kudos, firstMentionOf(kudos.mentions, recipients[0]!));
  const left = allowance.left - cost;
  await allowance.spend(cost);
  await publish(ctx, {
    type: "kudosGiven",
    ...attempt,
    awards: await insertAwards(ctx, refOf(row), awards, day, row.spendsAt),
    via: "message",
    kudosEmoji,
    ...(kudos.ownedEmoji.length === 0 ? {} : { ownedEmoji: kudos.ownedEmoji }),
    annotations: row.annotations,
    allowance: { dailyOpening: allowance.opening, dailyLeft: left },
  });
  return { kind: "given", awards, kudosEmoji, recipients: recipients.map(({ user }) => user), perRecipient, left, skipped };
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

async function publishFailure(ctx: MutationCtx, attempt: AttemptFacts, failure: Failure) {
  await publish(ctx, { type: "attemptFailed", ...attempt, ...failure });
}

type Recipient = { member: MemberId; user: ChatUserId };

async function sortMentions(ctx: QueryCtx, workspace: string, mentions: Mention[], giver: MemberId) {
  const recipients: Recipient[] = [];
  const skipped: SkippedMention[] = [];
  for (const mention of uniqueMentions(mentions)) {
    const sorted = await recipientOrSkipReason(ctx, workspace, mention, giver);
    if (typeof sorted === "string") skipped.push({ mention, reason: sorted });
    else recipients.push(sorted);
  }
  return { recipients, skipped };
}

async function recipientOrSkipReason(ctx: QueryCtx, workspace: string, mention: Mention, giver: MemberId): Promise<Recipient | SkipReason> {
  if (mention.kind !== "person") return "group-or-broadcast";
  const facts = await lookup(ctx, workspace, mention.user);
  if (facts?.kind === "bot") return "bot";
  if (facts?.kind !== "member") return "not-a-member";
  if (facts.member === giver) return "self";
  return { member: facts.member, user: mention.user };
}

function firstMentionOf(mentions: Mention[], { user }: Recipient) {
  return mentions.findIndex((mention) => mention.kind === "person" && mention.user === user);
}

function uniqueMentions(mentions: Mention[]) {
  return [...new Map(mentions.map((mention) => [JSON.stringify(mention), mention])).values()];
}

async function unknownUsers(ctx: QueryCtx, row: KudosMessageRow): Promise<ChatUserId[]> {
  const users = [...new Set([row.author, ...personMentions(row.content.mentions)])];
  const facts = await Promise.all(users.map((user) => lookup(ctx, row.workspace, user)));
  return users.filter((_, index) => facts[index] === undefined);
}

async function ignore(ctx: MutationCtx, row: KudosMessageRow, why: "not-a-member" | "ordinary-chat"): Promise<Observation> {
  await ctx.db.patch(row._id, { state: "watermark" });
  await (why === "not-a-member" ? removeWords(ctx, refOf(row)) : forgetWords(ctx, refOf(row)));
  return { kind: "ignored", why };
}

function personMentions(mentions: Mention[]): ChatUserId[] {
  return mentions.flatMap((mention) => (mention.kind === "person" ? [mention.user] : []));
}

function refOf(row: KudosMessageRow): MessageRef {
  return { workspace: row.workspace, conversation: row.conversation, message: row.message };
}

async function kudosMessageRow(ctx: QueryCtx, ref: MessageRef) {
  return ctx.db
    .query("kudosMessages")
    .withIndex("by_message", (q) => q.eq("workspace", ref.workspace).eq("conversation", ref.conversation).eq("message", ref.message))
    .unique();
}
