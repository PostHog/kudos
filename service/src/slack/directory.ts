// The directory's Slack side, as today's convex/slack/directory.ts: a member event or users.info keeps a person in the
// directory, a kudos waiting on people the directory doesn't know checks Slack and is tried again on a ladder, the
// checks a crash stranded are swept every ten minutes, and users.list keeps the listed members each day.
import { ReportableError, typeOf, withholdingWords } from "../analytics/exceptions.ts";
import { awaitedUsers, recheck, takeStrandedChecks, type Observation } from "../engine/engine.ts";
import { messageRefValidator, type MessageRef } from "../engine/messageEvent.ts";
import { republishOnRoleChange } from "../feedback/homes.ts";
import { directoryRecordArgs, fillEntry, lookup, record, type DirectoryEntry, type DirectoryRecord } from "../workspace/directory.ts";
import { keepListedMembers } from "../workspace/listedMembers.ts";
import type { MemberProfile } from "../workspace/memberProfile.ts";
import { convexActionTimeLimitMs, strandedPerSweep } from "./strandedJobs.ts";
import { nextRateLimitedAttempt, readSlack, retryDelayOf as rateLimitDelayOf, slackErrorCodeOf } from "./webApi.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext, QueryContext } from "../operations.ts";
import { mutationJob, actionJob } from "../jobs/define.ts";
import type { EventCallback, Handled } from "./frontDoor.ts";

type SlackUser = {
  id: string;
  team_id?: string;
  deleted?: boolean;
  is_bot?: boolean;
  is_admin?: boolean;
  is_owner?: boolean;
  tz?: string;
  name?: string;
  real_name?: string;
  profile?: { display_name?: string; real_name?: string; email?: string; title?: string; image_72?: string; image_192?: string };
};

export type MemberChanged = { type: "team_join" | "user_change"; user: SlackUser; event_ts: string };

const slackbot = "USLACKBOT";

export function isMemberChanged(event: { type: string }): event is MemberChanged {
  return event.type === "team_join" || event.type === "user_change";
}

export function directoryRecordOfEvent(workspace: unknown, eventId: unknown, event: MemberChanged): (DirectoryRecord & { eventId: string }) | null {
  const [team, id, receipt] = [textOf(workspace), textOf(event.user?.id), textOf(eventId)];
  if (team === undefined || id === undefined || receipt === undefined) return null;
  return { eventId: receipt, ...directoryRecordOf(team, id, event.user, Number(event.event_ts) * 1000) };
}

/**
 * The front door's `memberChanged` handler, in the mutation that keeps the event's receipt: a `team_join` or
 * `user_change` keeps the person in the directory, as today's receipt did. One without a team, user or event ID is
 * acknowledged and taken in by nothing, so Slack's redelivery is handled again.
 */
export async function receiveMemberEvent(ctx: MutationContext, envelope: EventCallback): Promise<Handled> {
  const changed = directoryRecordOfEvent(envelope.team_id, envelope.event_id, envelope.event as MemberChanged);
  if (changed === null) return "ignored";
  const { eventId: _, ...directoryRecord } = changed;
  await recordPerson(ctx, directoryRecord);
}

function directoryRecordOf(workspace: string, id: string, user: SlackUser, asOf: number): DirectoryRecord {
  return { workspace, user: id, entry: directoryEntryOf({ ...user, id }, workspace), asOf };
}

export async function checkDirectoryLater(ctx: MutationContext, ref: MessageRef, observation: Observation): Promise<void> {
  if (observation.kind !== "awaiting-directory") return;
  await ctx.jobs.enqueue(checkDirectoryJob, { ref, attempt: observation.attempt }, { after: observation.retryInMs });
}

const failedCheckRetriesMs = [10, 60, 300, 1800].map((seconds) => seconds * 1000);

const checkDirectoryArgs = { ref: messageRefValidator, attempt: z.int64(), failures: z.optional(zv.number()) };

export const checkDirectoryArgs2 = z.strictObject(checkDirectoryArgs);
export async function checkDirectory(ctx: ActionContext, args: z.infer<typeof checkDirectoryArgs2>): Promise<void> {
  try {
    await checkPeopleOf(ctx, args.ref, args.attempt);
  } catch (error) {
    await checkAgainAfterFailure(ctx, args);
    throw error;
  }
}
export const checkDirectoryJob = actionJob("slack.directory.checkDirectory", checkDirectoryArgs2, checkDirectory);

async function checkPeopleOf(ctx: ActionContext, ref: MessageRef, attempt: bigint) {
  const users = await ctx.run.query("slack.directory.usersAwaited", (query) => usersAwaited(query, { ref, attempt }));
  if (users === null) return;
  for (const user of users) await lookUpUser(ctx, ref.workspace, user);
  await ctx.run.mutation("slack.directory.recheckMessage", (mutation) => recheckMessage(mutation, { ref, attempt }));
}

async function checkAgainAfterFailure(ctx: ActionContext, { ref, attempt, failures = 0 }: z.infer<typeof checkDirectoryArgs2>) {
  const retryInMs = failedCheckRetriesMs[failures];
  if (retryInMs === undefined) return;
  await ctx.run.mutation("slack.directory.checkDirectoryAgain", (mutation) => mutation.jobs.enqueue(checkDirectoryJob, { ref, attempt, failures: failures + 1 }, { after: retryInMs }));
}

const checkTries = failedCheckRetriesMs.length + 1;
const strandedAfterMs = failedCheckRetriesMs.reduce((total, retryMs) => total + retryMs, 0) + checkTries * convexActionTimeLimitMs;

export const recheckStrandedArgs = z.strictObject({});
export async function recheckStranded(ctx: MutationContext, _: z.infer<typeof recheckStrandedArgs>): Promise<void> {
  const { checkAgain, pageWasFull } = await takeStrandedChecks(ctx, ctx.now - strandedAfterMs, strandedPerSweep);
  for (const { ref, attempt } of checkAgain) await ctx.jobs.enqueue(checkDirectoryJob, { ref, attempt });
  if (pageWasFull) await ctx.jobs.enqueue(recheckStrandedJob, {});
}
export const recheckStrandedJob = mutationJob("slack.directory.recheckStranded", recheckStrandedArgs, recheckStranded);

export const knowsArgs = z.strictObject({ workspace: z.string(), user: z.string() });
export async function knows(ctx: QueryContext, { workspace, user }: z.infer<typeof knowsArgs>): Promise<boolean> {
  return (await lookup(ctx, workspace, user)) !== undefined;
}

export const usersAwaitedArgs = z.strictObject({ ref: messageRefValidator, attempt: z.int64() });
export async function usersAwaited(ctx: QueryContext, { ref, attempt }: z.infer<typeof usersAwaitedArgs>): Promise<null | string[]> {
  return awaitedUsers(ctx, ref, attempt);
}

const recheckArgs = { ref: messageRefValidator, attempt: z.int64() };

export const recheckMessageArgs = z.strictObject(recheckArgs);
export const recheckMessage = withholdingWords(async (ctx: MutationContext, { ref, attempt }: z.infer<typeof recheckMessageArgs>): Promise<void> => {
  await checkDirectoryLater(ctx, ref, await recheck(ctx, ref, attempt));
});

export const refreshPersonArgs = z.strictObject(directoryRecordArgs);
export async function refreshPerson(ctx: MutationContext, directoryRecord: z.infer<typeof refreshPersonArgs>): Promise<void> {
  await recordPerson(ctx, directoryRecord);
}
export const refreshPersonJob = mutationJob("slack.directory.refreshPerson", refreshPersonArgs, refreshPerson);

export async function recordPerson(ctx: MutationContext, directoryRecord: DirectoryRecord): Promise<void> {
  const before = await lookup(ctx, directoryRecord.workspace, directoryRecord.user);
  await record(ctx, directoryRecord);
  await republishOnRoleChange(ctx, before, await lookup(ctx, directoryRecord.workspace, directoryRecord.user));
}

type UsersPage = { members: SlackUser[]; response_metadata?: { next_cursor?: string } };

export const listSlackMembersArgs = z.strictObject({ cursor: z.optional(z.string()), attempt: z.optional(zv.number()) });
export async function listSlackMembers(ctx: ActionContext, { cursor = "", attempt = 1 }: z.infer<typeof listSlackMembersArgs>): Promise<void> {
  const workspace = await workspaceOfToken();
  do {
    const asOf = ctx.clock.now();
    const page = await readSlack<UsersPage>("users.list", { limit: "200", ...(cursor && { cursor }) });
    if (!page.ok && page.error === "ratelimited") {
      const next = { cursor, attempt: nextRateLimitedAttempt(attempt, "users.list") };
      await ctx.run.mutation("slack.directory.listSlackMembersLater", (mutation) => mutation.jobs.enqueue(listSlackMembersJob, next, { after: rateLimitDelayOf(page) }));
      return;
    }
    if (!page.ok) throw new ReportableError(`Slack users.list failed: ${slackErrorCodeOf(page.error)}`);
    const listings = page.members.flatMap((user) => listingOf(user, workspace, asOf));
    await ctx.run.mutation("workspace.listedMembers.keepListedMembers", (mutation) => keepListedMembers(mutation, { listings }));
    cursor = page.response_metadata?.next_cursor ?? "";
  } while (cursor !== "");
}
export const listSlackMembersJob = actionJob("slack.directory.listSlackMembers", listSlackMembersArgs, listSlackMembers);

export async function workspaceOfToken() {
  const identity = await readSlack<{ team_id?: unknown }>("auth.test", {});
  if (!identity.ok) throw new ReportableError(`Slack auth.test failed: ${slackErrorCodeOf(identity.error)}`);
  const workspace = textOf(identity.team_id);
  if (workspace === undefined) throw new ReportableError("Slack auth.test answered without a team");
  return workspace;
}

function listingOf(user: SlackUser, workspace: string, asOf: number): DirectoryRecord[] {
  const id = textOf(user.id);
  return id === undefined ? [] : [directoryRecordOf(workspace, id, user, asOf)];
}

export type LookUp = { kind: "found" } | { kind: "failed"; retryAfterMs?: number };

export function lookUpUser(ctx: ActionContext, workspace: string, user: string): Promise<LookUp> {
  return askSlackAbout(ctx, workspace, user, { name: "workspace.directory.fillEntry", keep: fillEntry });
}

export function refreshUser(ctx: ActionContext, workspace: string, user: string): Promise<LookUp> {
  return askSlackAbout(ctx, workspace, user, { name: "slack.directory.refreshPerson", keep: refreshPerson });
}

// Where an answer is kept: the directory's fill, which keeps only a person it doesn't know, or the refresh, which
// replaces what it holds and republishes App Home when the person's role changed.
type Keep = { name: string; keep: (ctx: MutationContext, directoryRecord: DirectoryRecord) => Promise<void> };

async function askSlackAbout(ctx: ActionContext, workspace: string, user: string, { name, keep }: Keep): Promise<LookUp> {
  const askedAt = ctx.clock.now();
  const answer = await usersInfo(user);
  if (!answer?.ok) return { kind: "failed", ...retryDelayOf(answer) };
  if (typeof answer.user !== "object" || answer.user === null) return { kind: "failed" };
  const directoryRecord = directoryRecordOf(workspace, user, answer.user, askedAt);
  await ctx.run.mutation(name, (mutation) => keep(mutation, directoryRecord));
  return { kind: "found" };
}

function retryDelayOf(refusal: { retryAfterMs?: unknown } | null) {
  const retryAfterMs = refusal?.retryAfterMs;
  return typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) ? { retryAfterMs } : {};
}

async function usersInfo(user: string) {
  try {
    return await readSlack<{ user: SlackUser }>("users.info", { user });
  } catch (error) {
    console.warn("slack.users_info_failed", { error: typeOf(error) });
    return null;
  }
}

function directoryEntryOf(user: SlackUser, workspace: string): DirectoryEntry {
  if (user.is_bot || user.id === slackbot) return { kind: "bot" };
  if (user.deleted || user.team_id !== workspace) return { kind: "not-a-member" };
  const name = displayNameOf(user);
  const timeZone = textOf(user.tz);
  return {
    kind: "member",
    ...(name && { name }),
    ...(timeZone && { timeZone }),
    ...((user.is_admin || user.is_owner) && { admin: true }),
    ...profileOf(user),
  };
}

function profileOf({ profile, real_name }: SlackUser): MemberProfile {
  const email = textOf(profile?.email);
  const realName = textOf(profile?.real_name) ?? textOf(real_name);
  const displayName = textOf(profile?.display_name);
  const title = textOf(profile?.title);
  const picture = httpsAddressOf(profile?.image_192) ?? httpsAddressOf(profile?.image_72);
  return { ...(email && { email }), ...(realName && { realName }), ...(displayName && { displayName }), ...(title && { title }), ...(picture && { picture }) };
}

function httpsAddressOf(value: unknown) {
  const text = textOf(value);
  return text !== undefined && isHttpsAddress(text) ? text : undefined;
}

function isHttpsAddress(text: string) {
  try {
    return new URL(text).protocol === "https:";
  } catch {
    return false;
  }
}

function displayNameOf(user: SlackUser) {
  return textOf(user.profile?.display_name) ?? textOf(user.profile?.real_name) ?? textOf(user.real_name) ?? textOf(user.name);
}

export function textOf(value: unknown) {
  return typeof value === "string" && value !== "" ? value : undefined;
}
