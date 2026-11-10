// The module map's skeleton of convex/quests/finishedBy.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type QuestFinishedBy = { kind: "weekly" | "journey"; goal: string; xp: number; hoggie: boolean };

export async function questsFinishedByMessage(ctx: QueryContext, member: MemberId, message: MessageRef): Promise<QuestFinishedBy[]> {
  throw notPorted("quests.finishedBy.questsFinishedByMessage");
}
