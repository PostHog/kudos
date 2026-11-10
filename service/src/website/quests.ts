// The module map's skeleton of convex/website/quests.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MondayQuests } from "./mondayQuests.ts";

export type { DrawnQuest, GettingStartedStep, MondayQuests, QuestItemState, SideQuest } from "./mondayQuests.ts";

export type QuestsAnswer = MondayQuests | { kind: "not-found" };

export type QuestsViewAnswer = { kind: "viewed" } | { kind: "refused" };
