// The module map's skeleton of convex/engine/awards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { DayKey, Week } from "./allowance.ts";
import type { Annotations, MessageRef } from "./messageEvent.ts";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Page, PageOptions } from "../db/page.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

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

export async function insertAwards(ctx: MutationContext, message: MessageRef, awards: Award[], day: DayKey, at: number): Promise<AwardWithId[]> {
  throw notPorted("engine.awards.insertAwards");
}

export async function weekTotals(ctx: QueryContext, member: MemberId, week: Week): Promise<WeekTotals> {
  throw notPorted("engine.awards.weekTotals");
}

export type WeekAward = { message: MessageRef; giver: MemberId; recipient: MemberId; at: number };

export async function awardsInWeekNewestDaysFirst(ctx: QueryContext, member: MemberId, side: "given" | "received", { monday, sunday }: Week, atMost: number): Promise<WeekAward[]> {
  throw notPorted("engine.awards.awardsInWeekNewestDaysFirst");
}

export async function givenInWeek(ctx: QueryContext, giver: MemberId, { monday, sunday }: Week): Promise<Array<Pick<AwardRow, "recipient" | "at">>> {
  throw notPorted("engine.awards.givenInWeek");
}

export type EarlierAward = Pick<AwardRow, "recipient" | "day">;

export async function givenEarlierInWeek(ctx: QueryContext, giver: MemberId, { monday, sunday }: Week, before: AwardId): Promise<EarlierAward[]> {
  throw notPorted("engine.awards.givenEarlierInWeek");
}

export async function storedAnnotationsOf(ctx: QueryContext, { workspace, conversation, message }: MessageRef): Promise<Annotations> {
  throw notPorted("engine.awards.storedAnnotationsOf");
}

export async function awardsGivenBefore(ctx: QueryContext, before: number, page: PageOptions): Promise<Page<GivenAward>> {
  throw notPorted("engine.awards.awardsGivenBefore");
}

export type RecordedAward = GivenAward & { workspace: string; at: number };

export async function awardsInCreationOrder(ctx: QueryContext, page: PageOptions): Promise<Page<RecordedAward>> {
  throw notPorted("engine.awards.awardsInCreationOrder");
}

export type WorkspaceAward = GivenAward & { message: MessageRef; at: number; created: number };

export async function awardsInWorkspace(ctx: QueryContext, workspace: string, page: PageOptions): Promise<Page<WorkspaceAward>> {
  throw notPorted("engine.awards.awardsInWorkspace");
}

export type NewestReceived = { giver: MemberId; message: MessageRef; at: number };

export async function newestReceivedBy(ctx: QueryContext, recipient: MemberId, atMost: number): Promise<NewestReceived[]> {
  throw notPorted("engine.awards.newestReceivedBy");
}

export async function kudosDecidedAfter(ctx: QueryContext, recipient: MemberId, after: number, awardsAtMost: number): Promise<number> {
  throw notPorted("engine.awards.kudosDecidedAfter");
}

export async function newestDecidedReceivedBy(ctx: QueryContext, recipient: MemberId): Promise<number | null> {
  throw notPorted("engine.awards.newestDecidedReceivedBy");
}

export type GivenMessageFacts = { giver: MemberId; day: DayKey; at: number };

export async function givenFactsOf(ctx: QueryContext, { workspace, conversation, message }: MessageRef): Promise<GivenMessageFacts | null> {
  throw notPorted("engine.awards.givenFactsOf");
}

export async function awardsOfMessage(ctx: QueryContext, { workspace, conversation, message }: MessageRef): Promise<Array<GivenAward & { at: number }>> {
  throw notPorted("engine.awards.awardsOfMessage");
}

export async function authorOfGiven(ctx: QueryContext, { workspace, conversation, message }: MessageRef): Promise<MemberId | null> {
  throw notPorted("engine.awards.authorOfGiven");
}

export async function receivedOn(ctx: QueryContext, { workspace, conversation, message }: MessageRef, member: MemberId): Promise<boolean> {
  throw notPorted("engine.awards.receivedOn");
}

export async function recipientsPageOf(ctx: QueryContext, { workspace, conversation, message }: MessageRef, page: PageOptions): Promise<Page<MemberId>> {
  throw notPorted("engine.awards.recipientsPageOf");
}

export async function recipientsAfter(ctx: QueryContext, { workspace, conversation, message }: MessageRef, after: MemberId | null, atMost: number): Promise<MemberId[]> {
  throw notPorted("engine.awards.recipientsAfter");
}

export async function dayThankedBefore(ctx: QueryContext, award: AwardId): Promise<DayKey | null> {
  throw notPorted("engine.awards.dayThankedBefore");
}

export type GivenKudos = { award: AwardId; message: MessageRef; at: number };

export async function givenRecordedAfter(ctx: QueryContext, giver: MemberId, after: number): Promise<GivenKudos[]> {
  throw notPorted("engine.awards.givenRecordedAfter");
}

export type EarliestAward = { award: AwardId; at: number; created: number };

export async function earliestAwardFrom(ctx: QueryContext, giver: MemberId, recipient: MemberId): Promise<EarliestAward | null> {
  throw notPorted("engine.awards.earliestAwardFrom");
}

export async function thankedAtOrBefore(ctx: QueryContext, giver: MemberId, recipient: MemberId, atOrBefore: number): Promise<boolean> {
  throw notPorted("engine.awards.thankedAtOrBefore");
}

export async function lastThankedSince(ctx: QueryContext, giver: MemberId, since: number, atOrBefore: number): Promise<Map<MemberId, number>> {
  throw notPorted("engine.awards.lastThankedSince");
}

export async function givenBetween(ctx: QueryContext, giver: MemberId, since: number, until: number): Promise<DatedAward[]> {
  throw notPorted("engine.awards.givenBetween");
}

export async function givenSinceWithin(ctx: QueryContext, giver: MemberId, since: number, mostAwards: number): Promise<DatedAward[] | null> {
  throw notPorted("engine.awards.givenSinceWithin");
}

export async function awardAt(ctx: QueryContext, award: AwardId): Promise<number | null> {
  throw notPorted("engine.awards.awardAt");
}

export type LatestInAwardOrder = (awards: AwardId[]) => Promise<AwardId | null>;

export function latestInAwardOrder(ctx: QueryContext): LatestInAwardOrder {
  throw notPorted("engine.awards.latestInAwardOrder");
}

export async function messageOfAward(ctx: QueryContext, award: AwardId): Promise<MessageRef | null> {
  throw notPorted("engine.awards.messageOfAward");
}

export async function oldestAwardGivenBy(ctx: QueryContext, giver: MemberId): Promise<{ award: AwardId; decided: number } | null> {
  throw notPorted("engine.awards.oldestAwardGivenBy");
}

export async function firstDecidedOf(ctx: QueryContext, { workspace, conversation, message }: MessageRef): Promise<number | null> {
  throw notPorted("engine.awards.firstDecidedOf");
}

export async function hasGivenAnAward(ctx: QueryContext, giver: MemberId): Promise<boolean> {
  throw notPorted("engine.awards.hasGivenAnAward");
}

export async function hasReceivedAnAward(ctx: QueryContext, recipient: MemberId): Promise<boolean> {
  throw notPorted("engine.awards.hasReceivedAnAward");
}

export async function firstThanksOf(ctx: QueryContext, giver: MemberId): Promise<number[]> {
  throw notPorted("engine.awards.firstThanksOf");
}

export async function lastThankedBefore(ctx: QueryContext, awards: AwardWithId[]): Promise<Map<AwardId, number | null>> {
  throw notPorted("engine.awards.lastThankedBefore");
}

export async function givenMessagesInAwardOrder(ctx: QueryContext, cursor: string | null, pageSize: number): Promise<GivenMessagesPage> {
  throw notPorted("engine.awards.givenMessagesInAwardOrder");
}

export type Before = { at: number; created: number };

export const fromTheNewest: Before = { at: Infinity, created: Infinity };

export type ReceivedAward = { award: AwardId; message: MessageRef; giver: MemberId; kudos: number; at: number; created: number };

export type MessageAward = { award: AwardId; recipient: MemberId; kudos: number };

export type GivenMessageAwards = { first: AwardId; message: MessageRef; awards: MessageAward[]; at: number; created: number };

export type AtRange = { kind: "instant"; at: number; createdBefore?: number } | { kind: "older"; than?: number };

export async function* awardsReceivedNewestFirst(ctx: QueryContext, recipient: MemberId, before: Before): AsyncGenerator<ReceivedAward> {
  throw notPorted("engine.awards.awardsReceivedNewestFirst");
}

export function messagesGivenNewestFirst(ctx: QueryContext, giver: MemberId, before: Before): AsyncGenerator<GivenMessageAwards> {
  throw notPorted("engine.awards.messagesGivenNewestFirst");
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

export async function* awardsReceivedByDecision(ctx: QueryContext, recipient: MemberId, below: DecidedBelow): AsyncGenerator<ReceivedAward> {
  throw notPorted("engine.awards.awardsReceivedByDecision");
}

export type AnnotatedGivenMessage = GivenMessageAwards & { annotations: Annotations };

export async function messagesGivenDecidedAfter(ctx: QueryContext, giver: MemberId, after: number, mostAwards: number): Promise<AnnotatedGivenMessage[] | null> {
  throw notPorted("engine.awards.messagesGivenDecidedAfter");
}

export function messagesGivenByDecision(ctx: QueryContext, giver: MemberId, below: DecidedBelow): AsyncGenerator<GivenMessageAwards> {
  throw notPorted("engine.awards.messagesGivenByDecision");
}

export function rangesBefore({ at, created }: Before): AtRange[] {
  if (at === Infinity) return [{ kind: "older" }];
  const sameInstant: AtRange[] = created === -Infinity ? [] : [{ kind: "instant", at, ...(created !== Infinity && { createdBefore: created }) }];
  return [...sameInstant, { kind: "older", than: at }];
}
