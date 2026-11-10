// The module map's skeleton of what S1 left of convex/analytics/person.ts, written by tools/rewrite/moduleMap/skeleton.ts. S1's
// service/src/analytics/person.ts re-exports it; its stubs throw notPorted until the stack that owns the module ports their bodies.
import { type MemberId } from "../workspace/directory.ts";
import { type Environment } from "./capture.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext } from "../operations.ts";
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
