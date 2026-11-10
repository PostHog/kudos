// The module map's skeleton of convex/quests/start.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function startQuests(ctx: MutationContext, member: MemberId, at: number): Promise<void> {
  throw notPorted("quests.start.startQuests");
}

export async function questStartOf(ctx: QueryContext, member: MemberId): Promise<number | null> {
  throw notPorted("quests.start.questStartOf");
}
