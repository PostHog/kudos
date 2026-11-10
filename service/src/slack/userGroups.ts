// The module map's skeleton of convex/slack/userGroups.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { textOf } from "./directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

type UserGroupChanged =
  | { type: "subteam_created" | "subteam_updated"; subteam?: { id?: unknown } }
  | { type: "subteam_members_changed"; subteam_id?: unknown };

const userGroupEvents: ReadonlySet<string> = new Set(["subteam_created", "subteam_updated", "subteam_members_changed"]);
const attemptArgs = { attempt: z.optional(zv.number()) };

export function isUserGroupChanged(event: { type: string }): event is UserGroupChanged {
  return userGroupEvents.has(event.type);
}

export function userGroupChangeOf(workspace: unknown, eventId: unknown, event: UserGroupChanged) {
  const group = event.type === "subteam_members_changed" ? event.subteam_id : event.subteam?.id;
  const [team, receipt, id] = [textOf(workspace), textOf(eventId), textOf(group)];
  return team === undefined || receipt === undefined || id === undefined ? null : { workspace: team, eventId: receipt, group: id };
}

export const syncUserGroupsArgs = z.strictObject(attemptArgs);
export async function syncUserGroups(ctx: ActionContext, args: z.infer<typeof syncUserGroupsArgs>): Promise<void> {
  throw notPorted("slack.userGroups.syncUserGroups");
}
export const syncUserGroupsJob = actionJob("slack.userGroups.syncUserGroups", syncUserGroupsArgs, syncUserGroups);

export const refreshMembersOfEachArgs = z.strictObject({ groups: z.array(z.strictObject({ workspace: z.string(), group: z.string() })) });
export async function refreshMembersOfEach(ctx: ActionContext, args: z.infer<typeof refreshMembersOfEachArgs>): Promise<void> {
  throw notPorted("slack.userGroups.refreshMembersOfEach");
}
export const refreshMembersOfEachJob = actionJob("slack.userGroups.refreshMembersOfEach", refreshMembersOfEachArgs, refreshMembersOfEach);

export const refreshUserGroupArgs = z.strictObject({ workspace: z.string(), group: z.string(), ...attemptArgs });
export async function refreshUserGroup(ctx: ActionContext, args: z.infer<typeof refreshUserGroupArgs>): Promise<void> {
  throw notPorted("slack.userGroups.refreshUserGroup");
}
export const refreshUserGroupJob = actionJob("slack.userGroups.refreshUserGroup", refreshUserGroupArgs, refreshUserGroup);

export const refreshMembersArgs = z.strictObject({ workspace: z.string(), group: z.string(), ...attemptArgs });
export async function refreshMembers(ctx: ActionContext, args: z.infer<typeof refreshMembersArgs>): Promise<void> {
  throw notPorted("slack.userGroups.refreshMembers");
}
export const refreshMembersJob = actionJob("slack.userGroups.refreshMembers", refreshMembersArgs, refreshMembers);
