// The module map's skeleton of convex/quests/next.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { Side } from "./sides.ts";
import type { Quest } from "./step.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type NextQuest = { side: Side; quest: Quest };

export async function nextQuestOf(ctx: QueryContext, member: MemberId, at: number): Promise<NextQuest | null> {
  throw notPorted("quests.next.nextQuestOf");
}
