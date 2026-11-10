// Groups: the user groups that count, each member's groups and primary group, and the workspace's group mode.
// Today's convex/groups/groups.ts over the service's transaction.
import { eq } from "drizzle-orm";
import { ReportableError } from "../analytics/exceptions.ts";
import { memberDecision } from "../analytics/flags.ts";
import type { ChatUserId } from "../engine/messageEvent.ts";
import { chatUserOf, type MemberId, type People } from "../workspace/directory.ts";
import { keepsMembers, usersInUserGroup } from "../workspace/userGroups.ts";
import { groupsApplyTo, groupsFlag } from "./flag.ts";
import type { GroupModeKind } from "./mode.ts";
import type { Id } from "../db/columns.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { groupSettings, memberGroups, userGroups, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { documentsOf, uniqueOf } from "./rows.ts";

export type GroupId = Id<"userGroups">;

export type GroupRef = { group: GroupId; name: string };

export type CountingGroup = GroupRef & { people: MemberId[] };

export type GroupMode = { mode: GroupModeKind; allowlist?: GroupId[] };

const everyGroup: GroupMode = { mode: "all" };

const settingsByWorkspace = indexOrder(groupSettings, ["workspace"]);
const userGroupsByGroup = indexOrder(userGroups, ["workspace", "group"]);
const memberGroupsByMember = indexOrder(memberGroups, ["member"]);
const memberGroupsByPrimary = indexOrder(memberGroups, ["primary"]);

export function countsAsGroup(row: Doc<"userGroups">, mode: GroupMode): boolean {
  return keepsMembers(row) && isAllowed(row, mode);
}

export function isAllowed(row: Pick<Doc<"userGroups">, "_id">, { mode, allowlist = [] }: GroupMode): boolean {
  return mode === "all" || allowlist.includes(row._id);
}

export async function groupModeOf(ctx: QueryContext, workspace: string): Promise<GroupMode> {
  const row = await groupSettingsRow(ctx, workspace);
  return row ?? everyGroup;
}

export async function groupSettingsRow(ctx: QueryContext, workspace: string): Promise<null | Doc<"groupSettings">> {
  const rows = await ctx.tx.select().from(groupSettings).where(eq(groupSettings.workspace, workspace)).orderBy(...settingsByWorkspace.orderBy()).limit(2);
  return uniqueOf(groupSettings, rows);
}

/** The workspace's user groups, in Convex's `by_group` order; the copy keeps at most `maxUserGroupsKept` of them. */
export async function userGroupsIn(ctx: QueryContext, workspace: string): Promise<Doc<"userGroups">[]> {
  const rows = await ctx.tx.select().from(userGroups).where(eq(userGroups.workspace, workspace)).orderBy(...userGroupsByGroup.orderBy());
  return documentsOf(userGroups, rows);
}

export async function availableIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  const mode = await groupModeOf(ctx, workspace);
  return (await userGroupsIn(ctx, workspace)).some((row) => countsAsGroup(row, mode));
}

export async function countingGroupsWithPeopleIn(ctx: QueryContext, workspace: string, people: People): Promise<CountingGroup[]> {
  const mode = await groupModeOf(ctx, workspace);
  const counting = (await userGroupsIn(ctx, workspace)).filter((row) => countsAsGroup(row, mode));
  const membersByUser = currentMembersByUser(people);
  const groups: CountingGroup[] = [];
  for (const row of counting) groups.push({ group: row._id, name: row.name, people: membersAmong(await usersInUserGroup(ctx, row), membersByUser) });
  return groups;
}

function currentMembersByUser(people: People): Map<ChatUserId, MemberId> {
  return new Map([...people].filter(([, { former }]) => !former).map(([member, { user }]) => [user, member]));
}

function membersAmong(users: ChatUserId[], membersByUser: Map<ChatUserId, MemberId>): MemberId[] {
  return users.flatMap((user) => membersByUser.get(user) ?? []);
}

export async function groupsShownTo(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  return (await memberDecision(ctx, groupsFlag, member)) && (await availableIn(ctx, (await chatUserOf(ctx, member)).workspace));
}

export async function groupsShownAndExposedTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  return (await groupsApplyTo(ctx, member)) && (await availableIn(ctx, (await chatUserOf(ctx, member)).workspace));
}

export async function primaryGroupOf(ctx: QueryContext, member: MemberId): Promise<GroupRef | null> {
  const primary = (await memberGroupsOf(ctx, member))?.primary ?? null;
  return primary === null ? null : groupRefOf(ctx, primary);
}

export async function countingPrimaryGroupOf(ctx: QueryContext, member: MemberId): Promise<GroupRef | null> {
  const primary = (await memberGroupsOf(ctx, member))?.primary ?? null;
  const row = primary === null ? null : await userGroupById(ctx, primary);
  if (row === null || !countsAsGroup(row, await groupModeOf(ctx, row.workspace))) return null;
  return { group: row._id, name: row.name };
}

export async function countingGroupsOf(ctx: QueryContext, member: MemberId): Promise<GroupRef[]> {
  const groups = (await memberGroupsOf(ctx, member))?.groups ?? [];
  const refs: GroupRef[] = [];
  for (const group of groups) refs.push(await groupRefOf(ctx, group));
  return refs.toSorted((first, second) => first.name.localeCompare(second.name));
}

export async function primaryMembersOf(ctx: QueryContext, group: GroupId): Promise<MemberId[]> {
  const rows = await ctx.tx.select().from(memberGroups).where(eq(memberGroups.primary, group)).orderBy(...memberGroupsByPrimary.orderBy());
  return documentsOf<Doc<"memberGroups">>(memberGroups, rows).map(({ member }) => member);
}

export async function memberGroupsOf(ctx: QueryContext, member: MemberId): Promise<null | Doc<"memberGroups">> {
  const rows = await ctx.tx.select().from(memberGroups).where(eq(memberGroups.member, member)).orderBy(...memberGroupsByMember.orderBy()).limit(2);
  return uniqueOf(memberGroups, rows);
}

/** The user group with this ID, or `null`, as `ctx.db.get` read it. */
export async function userGroupById(ctx: QueryContext, group: GroupId): Promise<Doc<"userGroups"> | null> {
  const rows = await ctx.tx.select().from(userGroups).where(eq(userGroups._id, group));
  return uniqueOf(userGroups, rows);
}

async function groupRefOf(ctx: QueryContext, group: GroupId): Promise<GroupRef> {
  const row = await userGroupById(ctx, group);
  if (row === null) throw new ReportableError("a member's group is missing from the user group copy");
  return { group, name: row.name };
}
