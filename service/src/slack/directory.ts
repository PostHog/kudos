// The module map's skeleton of convex/slack/directory.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { ReportableError } from "../analytics/exceptions.ts";
import { type Observation } from "../engine/engine.ts";
import { messageRefValidator, type MessageRef } from "../engine/messageEvent.ts";
import { directoryRecordArgs, type DirectoryEntry, type DirectoryRecord } from "../workspace/directory.ts";
import type { MemberProfile } from "../workspace/memberProfile.ts";
import { convexActionTimeLimitMs } from "./strandedJobs.ts";
import { readSlack, slackErrorCodeOf } from "./webApi.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob, actionJob } from "../jobs/define.ts";

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

function directoryRecordOf(workspace: string, id: string, user: SlackUser, asOf: number): DirectoryRecord {
  return { workspace, user: id, entry: directoryEntryOf({ ...user, id }, workspace), asOf };
}

export async function checkDirectoryLater(ctx: MutationContext, ref: MessageRef, observation: Observation): Promise<void> {
  throw notPorted("slack.directory.checkDirectoryLater");
}

const failedCheckRetriesMs = [10, 60, 300, 1800].map((seconds) => seconds * 1000);

const checkDirectoryArgs = { ref: messageRefValidator, attempt: z.int64(), failures: z.optional(zv.number()) };

export const checkDirectoryArgs2 = z.strictObject(checkDirectoryArgs);
export async function checkDirectory(ctx: ActionContext, args: z.infer<typeof checkDirectoryArgs2>): Promise<void> {
  throw notPorted("slack.directory.checkDirectory");
}
export const checkDirectoryJob = actionJob("slack.directory.checkDirectory", checkDirectoryArgs2, checkDirectory);

const checkTries = failedCheckRetriesMs.length + 1;
const strandedAfterMs = failedCheckRetriesMs.reduce((total, retryMs) => total + retryMs, 0) + checkTries * convexActionTimeLimitMs;

export const recheckStrandedArgs = z.strictObject({});
export async function recheckStranded(ctx: MutationContext, args: z.infer<typeof recheckStrandedArgs>): Promise<void> {
  throw notPorted("slack.directory.recheckStranded");
}
export const recheckStrandedJob = mutationJob("slack.directory.recheckStranded", recheckStrandedArgs, recheckStranded);

export const knowsArgs = z.strictObject({ workspace: z.string(), user: z.string() });
export async function knows(ctx: QueryContext, args: z.infer<typeof knowsArgs>): Promise<boolean> {
  throw notPorted("slack.directory.knows");
}

export const usersAwaitedArgs = z.strictObject({ ref: messageRefValidator, attempt: z.int64() });
export async function usersAwaited(ctx: QueryContext, args: z.infer<typeof usersAwaitedArgs>): Promise<null | string[]> {
  throw notPorted("slack.directory.usersAwaited");
}

const recheckArgs = { ref: messageRefValidator, attempt: z.int64() };

export const recheckMessageArgs = z.strictObject(recheckArgs);
export async function recheckMessage(ctx: MutationContext, args: z.infer<typeof recheckMessageArgs>): Promise<void> {
  throw notPorted("slack.directory.recheckMessage");
}

export const refreshPersonArgs = z.strictObject(directoryRecordArgs);
export async function refreshPerson(ctx: MutationContext, args: z.infer<typeof refreshPersonArgs>): Promise<void> {
  throw notPorted("slack.directory.refreshPerson");
}
export const refreshPersonJob = mutationJob("slack.directory.refreshPerson", refreshPersonArgs, refreshPerson);

export async function recordPerson(ctx: MutationContext, directoryRecord: DirectoryRecord): Promise<void> {
  throw notPorted("slack.directory.recordPerson");
}

export const listSlackMembersArgs = z.strictObject({ cursor: z.optional(z.string()), attempt: z.optional(zv.number()) });
export async function listSlackMembers(ctx: ActionContext, args: z.infer<typeof listSlackMembersArgs>): Promise<void> {
  throw notPorted("slack.directory.listSlackMembers");
}
export const listSlackMembersJob = actionJob("slack.directory.listSlackMembers", listSlackMembersArgs, listSlackMembers);

export async function workspaceOfToken() {
  const identity = await readSlack<{ team_id?: unknown }>("auth.test", {});
  if (!identity.ok) throw new ReportableError(`Slack auth.test failed: ${slackErrorCodeOf(identity.error)}`);
  const workspace = textOf(identity.team_id);
  if (workspace === undefined) throw new ReportableError("Slack auth.test answered without a team");
  return workspace;
}

export type LookUp = { kind: "found" } | { kind: "failed"; retryAfterMs?: number };

export function lookUpUser(ctx: ActionContext, workspace: string, user: string): Promise<LookUp> {
  throw notPorted("slack.directory.lookUpUser");
}

export function refreshUser(ctx: ActionContext, workspace: string, user: string): Promise<LookUp> {
  throw notPorted("slack.directory.refreshUser");
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
