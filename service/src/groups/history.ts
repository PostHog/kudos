// The module map's skeleton of convex/groups/history.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { PrimaryGroupCause } from "./cause.ts";
import type { GroupId } from "./groups.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function primaryGroupAt(ctx: QueryContext, member: MemberId, at: number): Promise<GroupId | null> {
  throw notPorted("groups.history.primaryGroupAt");
}

export function latestEntryOf(ctx: QueryContext, member: MemberId): Promise<null | Doc<"primaryGroupHistory">> {
  throw notPorted("groups.history.latestEntryOf");
}

export async function recordChange(ctx: MutationContext, person: Doc<"members">, from: GroupId | null, to: GroupId | null, cause: PrimaryGroupCause, recordedAt: number): Promise<void> {
  throw notPorted("groups.history.recordChange");
}
