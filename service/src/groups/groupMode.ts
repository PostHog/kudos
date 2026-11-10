// The group mode an admin sets in the Admin tab: every group counts, or only those on the allowlist.
// Today's convex/groups/groupMode.ts over the service's transaction.
import { groupSettings, type Doc } from "../db/schema/index.ts";
import type { MutationContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { keepsMembers } from "../workspace/userGroups.ts";
import { groupsApplyTo } from "./flag.ts";
import { countsAsGroup, groupModeOf, groupSettingsRow, userGroupsIn, type GroupId, type GroupMode, type GroupRef } from "./groups.ts";
import type { GroupModeKind } from "./mode.ts";
import { reconcileEveryMemberLater } from "./reconcile.ts";
import { insertDocument, patchDocument } from "./rows.ts";
import { recordCountingChange } from "./transitions.ts";

export type GroupModeChange = { mode: GroupModeKind; allowlist?: string[] };

export type GroupModeFacts = { mode: GroupModeKind; groups: GroupRef[]; allowlist: GroupId[] };

type Admin = { member: MemberId; admin: boolean };

export async function groupModeShownTo(ctx: MutationContext, workspace: string, person: Admin): Promise<GroupModeFacts | null> {
  if (!(await setsGroupMode(ctx, person))) return null;
  const pickable = (await userGroupsIn(ctx, workspace)).filter(keepsMembers);
  if (pickable.length === 0) return null;
  const { mode, allowlist = [] } = await groupModeOf(ctx, workspace);
  const groups = pickable.map(({ _id, name }) => ({ group: _id, name })).toSorted((first, second) => first.name.localeCompare(second.name));
  return { mode, groups, allowlist };
}

export async function setGroupMode(ctx: MutationContext, workspace: string, person: Admin, change: GroupModeChange): Promise<boolean> {
  if (!(await setsGroupMode(ctx, person))) return false;
  const groups = await userGroupsIn(ctx, workspace);
  const before = await groupModeOf(ctx, workspace);
  const after = { mode: change.mode, allowlist: allowlistOf(groups, before, change) };
  await saveGroupMode(ctx, workspace, after);
  const flipped = groups.filter((row) => countsAsGroup(row, before) !== countsAsGroup(row, after));
  for (const row of flipped) await recordCountingChange(ctx, row, countsAsGroup(row, after), ctx.now);
  if (flipped.length > 0) await reconcileEveryMemberLater(ctx, workspace);
  return true;
}

async function setsGroupMode(ctx: MutationContext, { member, admin }: Admin) {
  return admin && (await groupsApplyTo(ctx, member));
}

function allowlistOf(groups: Doc<"userGroups">[], before: GroupMode, { mode, allowlist }: GroupModeChange): GroupId[] | undefined {
  if (allowlist !== undefined) {
    const picked = new Set(allowlist);
    return groups.filter(({ _id }) => picked.has(_id)).map(({ _id }) => _id);
  }
  if (mode === "allowlist" && before.allowlist === undefined) return groups.filter(keepsMembers).map(({ _id }) => _id);
  return before.allowlist;
}

async function saveGroupMode(ctx: MutationContext, workspace: string, { mode, allowlist }: GroupMode) {
  const row = await groupSettingsRow(ctx, workspace);
  if (row === null) await insertDocument(ctx.tx, groupSettings, { ...ctx.newRow(), workspace, mode, allowlist });
  else await patchDocument(ctx.tx, groupSettings, row, { mode, allowlist });
}
