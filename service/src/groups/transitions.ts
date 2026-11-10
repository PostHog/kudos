// The module map's skeleton of convex/groups/transitions.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ChatUserId } from "../engine/messageEvent.ts";
import { type GroupId } from "./groups.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type CountingChange = Pick<Doc<"groupCountingChanges">, "counts" | "at">;

type LoggedGroup = Pick<Doc<"userGroups">, "_id" | "workspace">;

export function joinedAtOf({ _creationTime }: Doc<"userGroupMembers">): number {
  return Math.floor(_creationTime);
}

export async function recordDepartures(ctx: MutationContext, group: Doc<"userGroups">, memberships: Doc<"userGroupMembers">[], at: number): Promise<void> {
  throw notPorted("groups.transitions.recordDepartures");
}

export function departuresSince(ctx: QueryContext, workspace: string, user: ChatUserId, since: number): Promise<Doc<"userGroupDepartures">[]> {
  throw notPorted("groups.transitions.departuresSince");
}

export class KeepingChanges {
  constructor(_ctx: MutationContext) {}

  async record(group: LoggedGroup, keepsMembers: boolean, at: number): Promise<void> {
    throw notPorted("groups.transitions.KeepingChanges.record");
  }
}

export async function recordCountingChange(ctx: MutationContext, group: LoggedGroup, counts: boolean, at: number): Promise<void> {
  throw notPorted("groups.transitions.recordCountingChange");
}

export function countingChangesOf(ctx: QueryContext, group: GroupId): Promise<CountingChange[]> {
  throw notPorted("groups.transitions.countingChangesOf");
}
