// A member's analytics ID, as today's convex/analytics/person.ts reads and makes it. The person events and the jobs
// that send them are S14's: `identifyNewPeopleLater` is their seam.
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { Id } from "../db/columns.ts";
import { analyticsIds } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

type MemberId = Id<"members">;

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

// The module map's stubs of the rest of convex/analytics/person.ts, written by tools/rewrite/moduleMap/skeleton.ts: what S1 left of it
// throws notPorted until the stack that owns it ports it. Above this line is S1's own.
import { type Environment } from "./capture.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type PersonProfile = {
  email?: string;
  name?: string;
  display_name?: string;
  title?: string;
  slack_user_id?: string;
  slack_team_id?: string;
  is_admin?: boolean;
  teams?: string[];
  environment: Environment;
};

export const profileKeys = ["email", "name", "display_name", "title", "slack_user_id", "slack_team_id", "is_admin", "teams", "environment"] as const satisfies (keyof PersonProfile)[];

const personEvents: readonly string[] = ["$identify", "$set"];
type SentPersonEvent = { row: Id<"analyticsOutbox">; distinctId: string };
type OutboxRow = Doc<"analyticsOutbox">;

export async function followMembersLater(ctx: MutationContext, members: MemberId[]): Promise<void> {
  throw notPorted("analytics.person.followMembersLater");
}

export async function followPeopleLater(ctx: MutationContext, workspace: string, users: string[]): Promise<void> {
  throw notPorted("analytics.person.followPeopleLater");
}

export const followMembersArgs = z.strictObject({ members: z.array(zv.id("members")) });
export async function followMembers(ctx: MutationContext, args: z.infer<typeof followMembersArgs>): Promise<void> {
  throw notPorted("analytics.person.followMembers");
}
export const followMembersJob = mutationJob("analytics.person.followMembers", followMembersArgs, followMembers);

export const followPeopleArgs = z.strictObject({ workspace: z.string(), users: z.array(z.string()) });
export async function followPeople(ctx: MutationContext, args: z.infer<typeof followPeopleArgs>): Promise<void> {
  throw notPorted("analytics.person.followPeople");
}
export const followPeopleJob = mutationJob("analytics.person.followPeople", followPeopleArgs, followPeople);

export const identifyNewPeopleArgs = z.strictObject({});
export async function identifyNewPeople(ctx: MutationContext, args: z.infer<typeof identifyNewPeopleArgs>): Promise<void> {
  throw notPorted("analytics.person.identifyNewPeople");
}
export const identifyNewPeopleJob = mutationJob("analytics.person.identifyNewPeople", identifyNewPeopleArgs, identifyNewPeople);

export const catchUpArgs = z.strictObject({ cursor: z.optional(z.string()) });
export async function catchUp(ctx: MutationContext, args: z.infer<typeof catchUpArgs>): Promise<void> {
  throw notPorted("analytics.person.catchUp");
}
export const catchUpJob = mutationJob("analytics.person.catchUp", catchUpArgs, catchUp);

export function requestCatchUp(ctx: MutationContext): Promise<Id<"_scheduled_functions">> {
  throw notPorted("analytics.person.requestCatchUp");
}

export async function withoutStalePersonEvents(ctx: MutationContext, rows: OutboxRow[]): Promise<Doc<"analyticsOutbox">[]> {
  throw notPorted("analytics.person.withoutStalePersonEvents");
}

export function personEventsIn(rows: OutboxRow[]) {
  return rows.filter(isPersonEvent).map(({ _id, distinctId }) => ({ row: _id, distinctId }));
}

export async function followPeopleSentLate(ctx: MutationContext, sent: SentPersonEvent[], stillHeld: OutboxRow[]): Promise<void> {
  throw notPorted("analytics.person.followPeopleSentLate");
}

export async function markDeliveriesUncertain(ctx: MutationContext, sent: SentPersonEvent[]): Promise<void> {
  throw notPorted("analytics.person.markDeliveriesUncertain");
}

export async function forgetRecordedProfiles(ctx: MutationContext, rows: OutboxRow[]): Promise<void> {
  throw notPorted("analytics.person.forgetRecordedProfiles");
}

function isPersonEvent({ event }: Pick<OutboxRow, "event">) {
  return personEvents.includes(event);
}
