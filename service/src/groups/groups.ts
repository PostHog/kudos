// The module map's skeleton of convex/groups/groups.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId, People } from "../workspace/directory.ts";
import { keepsMembers } from "../workspace/userGroups.ts";
import type { GroupModeKind } from "./mode.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type GroupId = Id<"userGroups">;

export type GroupRef = { group: GroupId; name: string };

export type CountingGroup = GroupRef & { people: MemberId[] };

export type GroupMode = { mode: GroupModeKind; allowlist?: GroupId[] };

export function countsAsGroup(row: Doc<"userGroups">, mode: GroupMode): boolean {
  return keepsMembers(row) && isAllowed(row, mode);
}

export function isAllowed(row: Pick<Doc<"userGroups">, "_id">, { mode, allowlist = [] }: GroupMode): boolean {
  return mode === "all" || allowlist.includes(row._id);
}

export async function groupModeOf(ctx: QueryContext, workspace: string): Promise<GroupMode> {
  throw notPorted("groups.groups.groupModeOf");
}

export function groupSettingsRow(ctx: QueryContext, workspace: string): Promise<null | Doc<"groupSettings">> {
  throw notPorted("groups.groups.groupSettingsRow");
}

export async function userGroupsIn(ctx: QueryContext, workspace: string): Promise<Doc<"userGroups">[]> {
  throw notPorted("groups.groups.userGroupsIn");
}

export async function availableIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("groups.groups.availableIn");
}

export async function countingGroupsWithPeopleIn(ctx: QueryContext, workspace: string, people: People): Promise<CountingGroup[]> {
  throw notPorted("groups.groups.countingGroupsWithPeopleIn");
}

export async function groupsShownTo(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("groups.groups.groupsShownTo");
}

export async function groupsShownAndExposedTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("groups.groups.groupsShownAndExposedTo");
}

export async function primaryGroupOf(ctx: QueryContext, member: MemberId): Promise<GroupRef | null> {
  throw notPorted("groups.groups.primaryGroupOf");
}

export async function countingPrimaryGroupOf(ctx: QueryContext, member: MemberId): Promise<GroupRef | null> {
  throw notPorted("groups.groups.countingPrimaryGroupOf");
}

export async function countingGroupsOf(ctx: QueryContext, member: MemberId): Promise<GroupRef[]> {
  throw notPorted("groups.groups.countingGroupsOf");
}

export async function primaryMembersOf(ctx: QueryContext, group: GroupId): Promise<MemberId[]> {
  throw notPorted("groups.groups.primaryMembersOf");
}

export function memberGroupsOf(ctx: QueryContext, member: MemberId): Promise<null | Doc<"memberGroups">> {
  throw notPorted("groups.groups.memberGroupsOf");
}
