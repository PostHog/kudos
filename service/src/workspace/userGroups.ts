// The copy of Slack's user groups and who is in each. Today's convex/workspace/userGroups.ts over the service's
// transaction; S11 owns it. The reads are ported; the writes the sync makes still throw notPorted until S11's 11.2.
import { and, eq } from "drizzle-orm";
import type { ChatUserId } from "../engine/messageEvent.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { userGroupMembers, userGroups } from "../db/schema/index.ts";
import { documentsOf, uniqueOf } from "../groups/rows.ts";
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

const userGroupsByGroup = indexOrder(userGroups, ["workspace", "group"]);
const membershipsByGroup = indexOrder(userGroupMembers, ["workspace", "group", "user"]);
const membershipsByUser = indexOrder(userGroupMembers, ["workspace", "user"]);

export function keepsMembers({ enabled, automatic }: Pick<UserGroup, "enabled" | "automatic">) {
  return enabled && !automatic;
}

export async function userGroupsOf(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<MembersUserGroup[]> {
  const memberships = await userGroupMembershipsOf(ctx, workspace, user);
  const groups: Array<Doc<"userGroups"> | null> = [];
  for (const { group } of memberships) groups.push(await userGroupRow(ctx, { workspace, group }));
  return groups
    .flatMap((row) => (row !== null && keepsMembers(row) ? [{ group: row.group, handle: row.handle, name: row.name }] : []))
    .toSorted((first, second) => first.handle.localeCompare(second.handle));
}

export async function userGroupsOfUser(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<string[]> {
  return (await userGroupMembershipsOf(ctx, workspace, user)).map(({ group }) => group);
}

export async function userGroupMembershipsOf(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<Doc<"userGroupMembers">[]> {
  const rows = await ctx.tx
    .select()
    .from(userGroupMembers)
    .where(and(eq(userGroupMembers.workspace, workspace), eq(userGroupMembers.user, user)))
    .orderBy(...membershipsByUser.orderBy());
  return documentsOf(userGroupMembers, rows);
}

export async function userGroupHandleOf(ctx: QueryContext, workspace: string, group: string): Promise<string | undefined> {
  return (await userGroupRow(ctx, { workspace, group }))?.handle;
}

export async function keptUserGroupHandlesIn(ctx: QueryContext, workspace: string): Promise<Map<string, string>> {
  const rows = await ctx.tx.select().from(userGroups).where(eq(userGroups.workspace, workspace)).orderBy(...userGroupsByGroup.orderBy());
  return new Map(documentsOf<Doc<"userGroups">>(userGroups, rows).filter(keepsMembers).map(({ group, handle }) => [group, handle]));
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
  const rows = await ctx.tx
    .select()
    .from(userGroupMembers)
    .where(and(eq(userGroupMembers.workspace, key.workspace), eq(userGroupMembers.group, key.group)))
    .orderBy(...membershipsByGroup.orderBy());
  return documentsOf<Doc<"userGroupMembers">>(userGroupMembers, rows).map(({ user }) => user);
}

export async function userGroupRow(ctx: QueryContext, { workspace, group }: GroupKey): Promise<null | Doc<"userGroups">> {
  const rows = await ctx.tx
    .select()
    .from(userGroups)
    .where(and(eq(userGroups.workspace, workspace), eq(userGroups.group, group)))
    .orderBy(...userGroupsByGroup.orderBy())
    .limit(2);
  return uniqueOf(userGroups, rows);
}
