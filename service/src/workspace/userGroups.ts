// The module map's skeleton of convex/workspace/userGroups.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ChatUserId } from "../engine/messageEvent.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const userGroupValidator = z.strictObject({
  workspace: z.string(),
  group: z.string(),
  handle: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  automatic: z.boolean(),
  members: z.optional(zv.number()),
});

export type UserGroup = z.infer<typeof userGroupValidator>;

export type MembersUserGroup = Pick<UserGroup, "group" | "handle" | "name">;

type GroupKey = Pick<UserGroup, "workspace" | "group">;

export const maxUserGroupsKept = 2_000;

const listingScopeValidator = z.union([z.strictObject({ kind: z.literal("every-group") }), z.strictObject({ kind: z.literal("one-group"), workspace: z.string(), group: z.string() })]);

export function keepsMembers({ enabled, automatic }: Pick<UserGroup, "enabled" | "automatic">) {
  return enabled && !automatic;
}

export async function userGroupsOf(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<MembersUserGroup[]> {
  throw notPorted("workspace.userGroups.userGroupsOf");
}

export async function userGroupsOfUser(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<string[]> {
  throw notPorted("workspace.userGroups.userGroupsOfUser");
}

export function userGroupMembershipsOf(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<Doc<"userGroupMembers">[]> {
  throw notPorted("workspace.userGroups.userGroupMembershipsOf");
}

export async function userGroupHandleOf(ctx: QueryContext, workspace: string, group: string): Promise<string | undefined> {
  throw notPorted("workspace.userGroups.userGroupHandleOf");
}

export async function keptUserGroupHandlesIn(ctx: QueryContext, workspace: string): Promise<Map<string, string>> {
  throw notPorted("workspace.userGroups.keptUserGroupHandlesIn");
}

export const keepUserGroupsArgs = z.strictObject({ listed: z.array(userGroupValidator), scope: listingScopeValidator, asOf: zv.number() });
export async function keepUserGroups(ctx: MutationContext, args: z.infer<typeof keepUserGroupsArgs>): Promise<void> {
  throw notPorted("workspace.userGroups.keepUserGroups");
}

export const clearUnkeptMembershipsArgs = z.strictObject({});
export async function clearUnkeptMemberships(ctx: MutationContext, args: z.infer<typeof clearUnkeptMembershipsArgs>): Promise<void> {
  throw notPorted("workspace.userGroups.clearUnkeptMemberships");
}
export const clearUnkeptMembershipsJob = mutationJob("workspace.userGroups.clearUnkeptMemberships", clearUnkeptMembershipsArgs, clearUnkeptMemberships);

export const keepUserGroupMembersArgs = z.strictObject({ workspace: z.string(), group: z.string(), users: z.array(z.string()), asOf: zv.number() });
export async function keepUserGroupMembers(ctx: MutationContext, args: z.infer<typeof keepUserGroupMembersArgs>): Promise<void> {
  throw notPorted("workspace.userGroups.keepUserGroupMembers");
}

export async function usersInUserGroup(ctx: QueryContext, key: GroupKey): Promise<ChatUserId[]> {
  throw notPorted("workspace.userGroups.usersInUserGroup");
}

export function userGroupRow(ctx: QueryContext, { workspace, group }: GroupKey): Promise<null | Doc<"userGroups">> {
  throw notPorted("workspace.userGroups.userGroupRow");
}
