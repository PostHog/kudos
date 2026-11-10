// The module map's skeleton of convex/groups/groupMode.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import { type GroupId, type GroupRef } from "./groups.ts";
import type { GroupModeKind } from "./mode.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type GroupModeChange = { mode: GroupModeKind; allowlist?: string[] };

export type GroupModeFacts = { mode: GroupModeKind; groups: GroupRef[]; allowlist: GroupId[] };

type Admin = { member: MemberId; admin: boolean };

export async function groupModeShownTo(ctx: MutationContext, workspace: string, person: Admin): Promise<GroupModeFacts | null> {
  throw notPorted("groups.groupMode.groupModeShownTo");
}

export async function setGroupMode(ctx: MutationContext, workspace: string, person: Admin, change: GroupModeChange): Promise<boolean> {
  throw notPorted("groups.groupMode.setGroupMode");
}
