// The module map's skeleton of convex/hugs/records.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DayKey, Week } from "../engine/allowance.ts";
import { type DecidedBelow } from "../engine/awards.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Page, PageOptions } from "../db/page.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Hug = Doc<"hugs">;

export type HugId = Doc<"hugs">["_id"];

export type HugFor = { onKudos: true } | { onKudos: false; author: MemberId };

export function hugOf(ctx: QueryContext, { workspace, conversation, message }: MessageRef, giver: MemberId): Promise<null | Doc<"hugs">> {
  throw notPorted("hugs.records.hugOf");
}

export function hugWithId(ctx: QueryContext, hug: HugId): Promise<null | Doc<"hugs">> {
  throw notPorted("hugs.records.hugWithId");
}

export function hugsInWorkspace(ctx: QueryContext, workspace: string, page: PageOptions): Promise<Page<Hug>> {
  throw notPorted("hugs.records.hugsInWorkspace");
}

export function hugsInCreationOrder(ctx: QueryContext, page: PageOptions): Promise<Page<Hug>> {
  throw notPorted("hugs.records.hugsInCreationOrder");
}

export type PaidHug = { hug: Hug; person: MemberId };

export async function paidHugsInCreationOrder(ctx: QueryContext, page: PageOptions): Promise<Page<PaidHug>> {
  throw notPorted("hugs.records.paidHugsInCreationOrder");
}

export type HugPeoplePage = { people: MemberId[]; next: string | null };

export async function hugPeoplePageOf(ctx: QueryContext, hug: Hug, cursor: string | null, numItems: number): Promise<HugPeoplePage> {
  throw notPorted("hugs.records.hugPeoplePageOf");
}

export type HugPeopleAfter = { people: MemberId[]; last: MemberId | null };

export async function hugPeopleAfter(ctx: QueryContext, hug: Hug, after: MemberId | null, atMost: number): Promise<HugPeopleAfter> {
  throw notPorted("hugs.records.hugPeopleAfter");
}

export async function hugsGivenOn(ctx: QueryContext, giver: MemberId, day: DayKey, atMost: number): Promise<number> {
  throw notPorted("hugs.records.hugsGivenOn");
}

export type HuggedPerson = { person: MemberId; at: number };

export async function peopleHuggedIn(ctx: QueryContext, giver: MemberId, { monday, sunday }: Week): Promise<HuggedPerson[]> {
  throw notPorted("hugs.records.peopleHuggedIn");
}

export async function hasHuggedBefore(ctx: QueryContext, giver: MemberId): Promise<boolean> {
  throw notPorted("hugs.records.hasHuggedBefore");
}

export type NewHug = MessageRef & HugFor & { giver: MemberId; emoji: string; at: number; day: DayKey };

export async function insertHug(ctx: MutationContext, hug: NewHug): Promise<void> {
  throw notPorted("hugs.records.insertHug");
}

export async function isPaid(ctx: QueryContext, hug: Hug, member: MemberId): Promise<boolean> {
  throw notPorted("hugs.records.isPaid");
}

export async function insertPaid(ctx: MutationContext, hug: Hug, member: MemberId): Promise<void> {
  throw notPorted("hugs.records.insertPaid");
}

export async function countReceivedOnTheMessage(ctx: MutationContext, hug: Hug, member: MemberId): Promise<void> {
  throw notPorted("hugs.records.countReceivedOnTheMessage");
}

export type TimelineHug = { message: MessageRef; onKudos: boolean; emoji: string; at: number; created: number };

export type GivenHug = TimelineHug & { people: MemberId[] };

export type ReceivedHugs = TimelineHug & { hugs: number; givers: MemberId[] };


export async function* hugsGivenByDecision(ctx: QueryContext, giver: MemberId, below: DecidedBelow): AsyncGenerator<GivenHug> {
  throw notPorted("hugs.records.hugsGivenByDecision");
}

export async function hugsReceivedSnapshot(ctx: QueryContext, member: MemberId): Promise<number> {
  throw notPorted("hugs.records.hugsReceivedSnapshot");
}

export async function* hugsReceivedByDecision(ctx: QueryContext, member: MemberId, below: DecidedBelow, snapshot: number | undefined): AsyncGenerator<ReceivedHugs> {
  throw notPorted("hugs.records.hugsReceivedByDecision");
}

export async function newestHugsPaidTo(ctx: QueryContext, member: MemberId, since: number, atMost: number): Promise<Hug[]> {
  throw notPorted("hugs.records.newestHugsPaidTo");
}

export async function hugsOnTheMessageAsOf(ctx: QueryContext, member: MemberId, { workspace, conversation, message }: MessageRef, at: number): Promise<number> {
  throw notPorted("hugs.records.hugsOnTheMessageAsOf");
}
