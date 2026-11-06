import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import { chatUserOf, lookup, personFactsOf, type MemberId, type PersonFacts } from "../workspace/directory";
import { keptUserGroupHandlesIn, userGroupsOfUser } from "../workspace/userGroups";
import { captureSettings, type Capture, type Environment } from "./capture";
import { wakeDrain } from "./drain";
import { sharedPropertiesOf } from "./outbox";

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

const peopleFollowedPerJob = 200;
const identitiesCaughtUpPerPage = 10;
const documentsReadPerFollowJob = 8_000;
const documentsReadPerPerson = 6;

type Identity = Doc<"analyticsIds">;
type SentPersonEvent = { row: Id<"analyticsOutbox">; distinctId: string };
type OutboxRow = Doc<"analyticsOutbox">;

export async function analyticsIdOf(ctx: MutationCtx, member: MemberId) {
  return (await existingAnalyticsId(ctx, member)) ?? recordAnalyticsId(ctx, member, crypto.randomUUID());
}

export async function recordAnalyticsId(ctx: MutationCtx, member: MemberId, analyticsId: string) {
  const someoneIsWaiting = (await neverRecorded(ctx).first()) !== null;
  await ctx.db.insert("analyticsIds", { member, analyticsId });
  if (!someoneIsWaiting && captureSettings() !== null) await ctx.scheduler.runAfter(0, internal.analytics.person.identifyNewPeople, {});
  return analyticsId;
}

export async function existingAnalyticsId(ctx: QueryCtx, member: MemberId) {
  return (await identityOf(ctx, member))?.analyticsId ?? null;
}

export async function followMembersLater(ctx: MutationCtx, members: MemberId[]) {
  if (captureSettings() === null) return;
  const identified = [];
  for (const member of members) if ((await identityOf(ctx, member)) !== null) identified.push(member);
  for (const chunk of chunksOf(identified)) await ctx.scheduler.runAfter(0, internal.analytics.person.followMembers, { members: chunk });
}

export async function followPeopleLater(ctx: MutationCtx, workspace: string, users: string[]) {
  if (captureSettings() === null) return;
  for (const chunk of chunksOf(users)) await ctx.scheduler.runAfter(0, internal.analytics.person.followPeople, { workspace, users: chunk });
}

export const followMembers = internalMutation({
  args: { members: v.array(v.id("members")) },
  handler: async (ctx, { members }) => {
    const capture = captureSettings();
    if (capture === null) return;
    const reader = new ProfileReader(ctx, capture);
    const left = await followWithin(reader, members, async (member) => {
      const identity = await identityOf(ctx, member);
      if (identity !== null) await recordProfileChange(ctx, reader, identity);
    });
    if (left.length > 0) await ctx.scheduler.runAfter(0, internal.analytics.person.followMembers, { members: left });
  },
});

export const followPeople = internalMutation({
  args: { workspace: v.string(), users: v.array(v.string()) },
  handler: async (ctx, { workspace, users }) => {
    const capture = captureSettings();
    if (capture === null) return;
    const reader = new ProfileReader(ctx, capture);
    const left = await followWithin(reader, users, async (user) => {
      const facts = await lookup(ctx, workspace, user);
      const identity = facts?.kind === "member" ? await identityOf(ctx, facts.member) : null;
      if (identity !== null) await recordProfileChange(ctx, reader, identity);
    });
    if (left.length > 0) await ctx.scheduler.runAfter(0, internal.analytics.person.followPeople, { workspace, users: left });
  },
});

export const identifyNewPeople = internalMutation({
  args: {},
  handler: async (ctx) => {
    const capture = captureSettings();
    if (capture === null) return;
    const reader = new ProfileReader(ctx, capture);
    for (;;) {
      const waiting = await neverRecorded(ctx).take(identitiesCaughtUpPerPage);
      if (waiting.length === 0) return;
      if (reader.full) break;
      for (const identity of waiting) await recordProfileChange(ctx, reader, identity);
    }
    await ctx.scheduler.runAfter(0, internal.analytics.person.identifyNewPeople, {});
  },
});

export const catchUp = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const capture = captureSettings();
    if (capture === null) return;
    const reader = new ProfileReader(ctx, capture);
    const page = await ctx.db.query("analyticsIds").paginate({ cursor: cursor ?? null, numItems: identitiesCaughtUpPerPage });
    for (const identity of page.page) await recordCurrentProfile(ctx, reader, identity);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.analytics.person.catchUp, { cursor: page.continueCursor });
  },
});

export function requestCatchUp(ctx: MutationCtx) {
  return ctx.scheduler.runAfter(0, internal.analytics.person.catchUp, {});
}

export async function withoutStalePersonEvents(ctx: MutationCtx, rows: OutboxRow[]) {
  const current: OutboxRow[] = [];
  for (const row of rows) {
    if (await isStale(ctx, row)) await ctx.db.delete(row._id);
    else current.push(row);
  }
  return current;
}

export function personEventsIn(rows: OutboxRow[]) {
  return rows.filter(isPersonEvent).map(({ _id, distinctId }) => ({ row: _id, distinctId }));
}

export async function followPeopleSentLate(ctx: MutationCtx, sent: SentPersonEvent[], stillHeld: OutboxRow[]) {
  const held = new Set(stillHeld.map(({ _id }) => _id));
  const late = [];
  for (const { distinctId } of sent.filter(({ row }) => !held.has(row))) {
    const identity = await identityWithAnalyticsId(ctx, distinctId);
    if (identity === null) continue;
    await ctx.db.patch(identity._id, { profileFingerprint: null });
    late.push(identity.member);
  }
  await followMembersLater(ctx, late);
}

export async function markDeliveriesUncertain(ctx: MutationCtx, sent: SentPersonEvent[]) {
  for (const { distinctId } of sent) {
    const identity = await identityWithAnalyticsId(ctx, distinctId);
    if (identity !== null) await ctx.db.patch(identity._id, { profileUncertain: true });
  }
}

export async function forgetRecordedProfiles(ctx: MutationCtx, rows: OutboxRow[]) {
  for (const row of rows.filter(isPersonEvent)) {
    const identity = await identityWithAnalyticsId(ctx, row.distinctId);
    if (identity !== null) await ctx.db.patch(identity._id, { profileFingerprint: null });
  }
}

function isPersonEvent({ event }: Pick<OutboxRow, "event">) {
  return personEvents.includes(event);
}

async function isStale(ctx: QueryCtx, row: OutboxRow) {
  if (!isPersonEvent(row)) return false;
  const identity = await identityWithAnalyticsId(ctx, row.distinctId);
  return identity?.profileFingerprint !== row.person?.fingerprint;
}

async function followWithin<T>(reader: ProfileReader, people: T[], follow: (person: T) => Promise<void>) {
  for (const [index, person] of people.entries()) {
    if (reader.full) return people.slice(index);
    await follow(person);
  }
  return [];
}

async function recordCurrentProfile(ctx: MutationCtx, reader: ProfileReader, identity: Identity) {
  if (identity.profileUncertain !== true) return recordProfileChange(ctx, reader, identity);
  await ctx.db.patch(identity._id, { profileUncertain: undefined });
  await recordProfileChange(ctx, reader, identity, { evenIfUnchanged: true });
}

async function recordProfileChange(ctx: MutationCtx, reader: ProfileReader, identity: Identity, { evenIfUnchanged = false } = {}) {
  const profile = await reader.profileOf(identity.member);
  const fingerprint = await fingerprintOf(profile);
  if (identity.profileFingerprint === fingerprint && !evenIfUnchanged) return;
  const { workspace } = await chatUserOf(ctx, identity.member);
  const firstTime = identity.profileFingerprint === undefined;
  await ctx.db.insert("analyticsOutbox", {
    uuid: crypto.randomUUID(),
    event: firstTime ? "$identify" : "$set",
    distinctId: identity.analyticsId,
    timestamp: Date.now(),
    properties: await sharedPropertiesOf(ctx, reader.capture, workspace),
    person: { set: profile, unset: firstTime ? [] : profileKeys.filter((key) => profile[key] === undefined), fingerprint },
    state: "pending",
    failures: 0,
    dueAt: Date.now(),
  });
  await ctx.db.patch(identity._id, { profileFingerprint: fingerprint });
  await wakeDrain(ctx);
}

class ProfileReader {
  private documentsRead = 0;
  private people = 0;
  private readonly handlesByWorkspace = new Map<string, Map<string, string>>();

  constructor(
    private readonly ctx: QueryCtx,
    readonly capture: Capture,
  ) {}

  get full() {
    return this.people >= peopleFollowedPerJob || this.documentsRead >= documentsReadPerFollowJob;
  }

  async profileOf(member: MemberId): Promise<PersonProfile> {
    this.people += 1;
    this.documentsRead += documentsReadPerPerson;
    const facts = await personFactsOf(this.ctx, member);
    if (facts === null) return { environment: this.capture.environment };
    return { ...profileFieldsOf(facts), ...(await this.teamsOf(facts)), environment: this.capture.environment };
  }

  private async teamsOf({ workspace, user }: PersonFacts) {
    const groups = await userGroupsOfUser(this.ctx, workspace, user);
    const handles = await this.keptHandlesIn(workspace);
    this.documentsRead += groups.length;
    const teams = groups.flatMap((group) => handles.get(group) ?? []).toSorted((first, second) => first.localeCompare(second));
    return teams.length > 0 ? { teams } : {};
  }

  private async keptHandlesIn(workspace: string) {
    const known = this.handlesByWorkspace.get(workspace);
    if (known !== undefined) return known;
    const handles = await keptUserGroupHandlesIn(this.ctx, workspace);
    this.documentsRead += handles.size;
    this.handlesByWorkspace.set(workspace, handles);
    return handles;
  }
}

function profileFieldsOf(facts: PersonFacts) {
  return {
    ...(facts.email !== undefined && { email: facts.email }),
    ...(facts.realName !== undefined && { name: facts.realName }),
    ...(facts.displayName !== undefined && { display_name: facts.displayName }),
    ...(facts.title !== undefined && { title: facts.title }),
    slack_user_id: facts.user,
    slack_team_id: facts.workspace,
    is_admin: facts.admin,
  };
}

async function fingerprintOf(profile: PersonProfile) {
  const canonical = JSON.stringify(profileKeys.map((key) => [key, profile[key] ?? null]));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function chunksOf<T>(items: T[]) {
  return Array.from({ length: Math.ceil(items.length / peopleFollowedPerJob) }, (_, index) => items.slice(index * peopleFollowedPerJob, (index + 1) * peopleFollowedPerJob));
}

function identityOf(ctx: QueryCtx, member: MemberId) {
  return ctx.db
    .query("analyticsIds")
    .withIndex("by_member", (q) => q.eq("member", member))
    .first();
}

function neverRecorded(ctx: QueryCtx) {
  return ctx.db.query("analyticsIds").withIndex("by_profile_fingerprint", (q) => q.eq("profileFingerprint", undefined));
}

function identityWithAnalyticsId(ctx: QueryCtx, analyticsId: string) {
  return ctx.db
    .query("analyticsIds")
    .withIndex("by_analytics_id", (q) => q.eq("analyticsId", analyticsId))
    .unique();
}
