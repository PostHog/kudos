// The transition log: departures from user groups and the instants a group started or stopped counting, which
// reconciliation replays. Only ever inserted. Today's convex/groups/transitions.ts over the service's transaction.
import { and, eq, gte } from "drizzle-orm";
import type { ChatUserId } from "../engine/messageEvent.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { groupCountingChanges, userGroupDepartures, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { groupModeOf, isAllowed, type GroupId, type GroupMode } from "./groups.ts";
import { documentsOf, insertDocument } from "./rows.ts";

export type CountingChange = Pick<Doc<"groupCountingChanges">, "counts" | "at">;

type LoggedGroup = Pick<Doc<"userGroups">, "_id" | "workspace">;

const departuresByUserAt = indexOrder(userGroupDepartures, ["workspace", "user", "at"]);
const changesByGroupAt = indexOrder(groupCountingChanges, ["group", "at"]);

export function joinedAtOf({ _creationTime }: Doc<"userGroupMembers">): number {
  return Math.floor(_creationTime);
}

export async function recordDepartures(ctx: MutationContext, group: Doc<"userGroups">, memberships: Doc<"userGroupMembers">[], at: number): Promise<void> {
  for (const membership of memberships) {
    await insertDocument(ctx.tx, userGroupDepartures, { ...ctx.newRow(), workspace: group.workspace, user: membership.user, group: group._id, joinedAt: joinedAtOf(membership), at });
  }
}

export async function departuresSince(ctx: QueryContext, workspace: string, user: ChatUserId, since: number): Promise<Doc<"userGroupDepartures">[]> {
  const rows = await ctx.tx
    .select()
    .from(userGroupDepartures)
    .where(and(eq(userGroupDepartures.workspace, workspace), eq(userGroupDepartures.user, user), gte(userGroupDepartures.at, since)))
    .orderBy(...departuresByUserAt.orderBy());
  return documentsOf(userGroupDepartures, rows);
}

/** Records the counting changes of one sync's groups, reading each workspace's group mode once. */
export class KeepingChanges {
  private readonly modes = new Map<string, Promise<GroupMode>>();

  private readonly ctx: MutationContext;

  constructor(ctx: MutationContext) {
    this.ctx = ctx;
  }

  async record(group: LoggedGroup, keepsMembers: boolean, at: number): Promise<void> {
    const mode = this.modes.get(group.workspace) ?? groupModeOf(this.ctx, group.workspace);
    this.modes.set(group.workspace, mode);
    if (isAllowed(group, await mode)) await recordCountingChange(this.ctx, group, keepsMembers, at);
  }
}

export async function recordCountingChange(ctx: MutationContext, group: LoggedGroup, counts: boolean, at: number): Promise<void> {
  await insertDocument(ctx.tx, groupCountingChanges, { ...ctx.newRow(), workspace: group.workspace, group: group._id, counts, at });
}

export async function countingChangesOf(ctx: QueryContext, group: GroupId): Promise<CountingChange[]> {
  const rows = await ctx.tx.select().from(groupCountingChanges).where(eq(groupCountingChanges.group, group)).orderBy(...changesByGroupAt.orderBy());
  return documentsOf(groupCountingChanges, rows);
}
