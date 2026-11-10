// A member's analytics ID, as today's convex/analytics/person.ts reads and makes it, and what the drain asks of a
// person event: whether it is stale, and which profiles to send again. The person events themselves are S14's:
// `identifyNewPeopleLater` is their seam.
import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import type { Id } from "../db/columns.ts";
import { encodeStored } from "../db/codec.ts";
import { toDocument } from "../db/documents.ts";
import { analyticsIds, analyticsOutbox, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { captureSettings } from "./capture.ts";
import { catchUpJob, followMembersJob, followPeopleJob } from "./person.map.ts";

type MemberId = Id<"members">;
type Identity = Doc<"analyticsIds">;
type OutboxRow = Doc<"analyticsOutbox">;
type SentPersonEvent = { row: Id<"analyticsOutbox">; distinctId: string };

const personEvents: readonly string[] = ["$identify", "$set"];
const peopleFollowedPerJob = 200;

/** The member's analytics ID, made the first time it is needed. */
export async function analyticsIdOf(ctx: MutationContext, member: MemberId): Promise<string> {
  return (await existingAnalyticsId(ctx, member)) ?? recordAnalyticsId(ctx, member, randomUUID());
}

export async function recordAnalyticsId(ctx: MutationContext, member: MemberId, analyticsId: string): Promise<string> {
  await ctx.tx.insert(analyticsIds).values({ ...ctx.newRow(), member, analyticsId });
  await identifyNewPeopleLater(ctx);
  return analyticsId;
}

/** The oldest analytics ID stored for the member, or `null`; a member with two never fails a read. */
export async function existingAnalyticsId(ctx: QueryContext, member: MemberId): Promise<string | null> {
  const [row] = await ctx.tx
    .select({ analyticsId: analyticsIds.analyticsId })
    .from(analyticsIds)
    .where(eq(analyticsIds.member, member))
    .orderBy(asc(analyticsIds._creationTime), asc(analyticsIds._id))
    .limit(1);
  return row?.analyticsId ?? null;
}

/**
 * S14's seam: today this schedules the one identify job a new analytics ID's $identify waits for, while capture is
 * on and no other ID waits. Until S14 registers that job, a new ID waits here with nothing scheduled.
 */
async function identifyNewPeopleLater(_ctx: MutationContext): Promise<void> {}

/** Follows the members that have an analytics ID: their profiles are read and sent again, 200 to a job. */
export async function followMembersLater(ctx: MutationContext, members: MemberId[]): Promise<void> {
  if (captureSettings() === null) return;
  const identified = [];
  for (const member of members) if ((await identityOf(ctx, member)) !== null) identified.push(member);
  for (let start = 0; start < identified.length; start += peopleFollowedPerJob) {
    await ctx.jobs.enqueue(followMembersJob, { members: identified.slice(start, start + peopleFollowedPerJob) });
  }
}

/** Follows the people whose user groups changed: their profiles are read and sent again, 200 to a job, while capture is on. */
export async function followPeopleLater(ctx: MutationContext, workspace: string, users: string[]): Promise<void> {
  if (captureSettings() === null) return;
  for (let start = 0; start < users.length; start += peopleFollowedPerJob) {
    await ctx.jobs.enqueue(followPeopleJob, { workspace, users: users.slice(start, start + peopleFollowedPerJob) });
  }
}

/** Asks for one catch-up of every member's profile, as a renamed user group handle needs. */
export function requestCatchUp(ctx: MutationContext): Promise<string> {
  return ctx.jobs.enqueue(catchUpJob, {});
}

/** The rows left once stale person events are deleted: those whose profile changed again after they were recorded. */
export async function withoutStalePersonEvents(ctx: MutationContext, rows: OutboxRow[]): Promise<OutboxRow[]> {
  const current: OutboxRow[] = [];
  const stale: Array<Id<"analyticsOutbox">> = [];
  for (const row of rows) {
    if (await isStale(ctx, row)) stale.push(row._id);
    else current.push(row);
  }
  if (stale.length > 0) await ctx.tx.delete(analyticsOutbox).where(inArray(analyticsOutbox._id, stale));
  return current;
}

export function personEventsIn(rows: OutboxRow[]): SentPersonEvent[] {
  return rows.filter(isPersonEvent).map(({ _id, distinctId }) => ({ row: _id, distinctId }));
}

/**
 * The person events PostHog may have received after their lease expired, so a newer profile may have reached it
 * first: their people are recorded as unsent and followed again.
 */
export async function followPeopleSentLate(ctx: MutationContext, sent: SentPersonEvent[], stillHeld: OutboxRow[]): Promise<void> {
  const held = new Set(stillHeld.map(({ _id }) => _id));
  const late = [];
  for (const { distinctId } of sent.filter(({ row }) => !held.has(row))) {
    const identity = await identityWithAnalyticsId(ctx, distinctId);
    if (identity === null) continue;
    await setFingerprint(ctx, identity, null);
    late.push(identity.member);
  }
  await followMembersLater(ctx, late);
}

/** PostHog may or may not hold these people's profiles: the catch-up sends them again even if they are unchanged. */
export async function markDeliveriesUncertain(ctx: MutationContext, sent: SentPersonEvent[]): Promise<void> {
  for (const { distinctId } of sent) {
    const identity = await identityWithAnalyticsId(ctx, distinctId);
    if (identity !== null) await ctx.tx.update(analyticsIds).set({ profileUncertain: true }).where(eq(analyticsIds._id, identity._id));
  }
}

/** Given-up person events: their people's profiles count as never sent. */
export async function forgetRecordedProfiles(ctx: MutationContext, rows: OutboxRow[]): Promise<void> {
  for (const row of rows.filter(isPersonEvent)) {
    const identity = await identityWithAnalyticsId(ctx, row.distinctId);
    if (identity !== null) await setFingerprint(ctx, identity, null);
  }
}

function isPersonEvent({ event }: Pick<OutboxRow, "event">): boolean {
  return personEvents.includes(event);
}

async function isStale(ctx: QueryContext, row: OutboxRow): Promise<boolean> {
  if (!isPersonEvent(row)) return false;
  const identity = await identityWithAnalyticsId(ctx, row.distinctId);
  return identity?.profileFingerprint !== row.person?.fingerprint;
}

async function setFingerprint(ctx: MutationContext, identity: Identity, fingerprint: string | null): Promise<void> {
  await ctx.tx.update(analyticsIds).set({ profileFingerprint: encodeStored(fingerprint) }).where(eq(analyticsIds._id, identity._id));
}

async function identityOf(ctx: QueryContext, member: MemberId): Promise<Identity | null> {
  const [row] = await ctx.tx.select().from(analyticsIds).where(eq(analyticsIds.member, member)).orderBy(asc(analyticsIds._creationTime), asc(analyticsIds._id)).limit(1);
  return row ? toDocument<Identity>(analyticsIds, row) : null;
}

/** The identity with this analytics ID, or `null`; two would be a broken invariant, as Convex's `unique()` says. */
async function identityWithAnalyticsId(ctx: QueryContext, analyticsId: string): Promise<Identity | null> {
  const rows = await ctx.tx.select().from(analyticsIds).where(eq(analyticsIds.analyticsId, analyticsId)).limit(2);
  if (rows.length > 1) throw new Error("Two analytics identities share one analytics ID");
  return rows[0] ? toDocument<Identity>(analyticsIds, rows[0]) : null;
}

export { catchUp, catchUpArgs, catchUpJob, followMembers, followMembersArgs, followMembersJob, followPeople, followPeopleArgs, followPeopleJob, identifyNewPeople, identifyNewPeopleArgs, identifyNewPeopleJob, type PersonProfile, profileKeys } from "./person.map.ts";
