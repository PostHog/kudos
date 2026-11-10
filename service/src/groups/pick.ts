// The module map's skeleton of convex/groups/pick.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { GroupId, GroupRef } from "./groups.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type PickOutcome = "picked" | "kept" | "refused";

export type GroupChoice = { primary: GroupRef; groups: GroupRef[] };

export async function pickPrimaryGroup(ctx: MutationContext, member: MemberId, group: GroupId): Promise<PickOutcome> {
  throw notPorted("groups.pick.pickPrimaryGroup");
}

export async function groupChoiceOf(ctx: QueryContext, member: MemberId): Promise<GroupChoice | null> {
  throw notPorted("groups.pick.groupChoiceOf");
}
