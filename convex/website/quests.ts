import { reportQuestsViewed } from "../analytics/isolatedUsage";
import { questsSurfaceValidator } from "../analytics/projections";
import { onTheMondayPath } from "../quests/flag";
import { memberMutation } from "./memberMutation";
import { memberQuery } from "./memberQuery";
import { mondayQuestsOf, type MondayQuests } from "./mondayQuests";

export type { DrawnQuest, GettingStartedStep, MondayQuests, QuestItemState, SideQuest } from "./mondayQuests";

export type QuestsAnswer = MondayQuests | { kind: "not-found" };

export type QuestsViewAnswer = { kind: "viewed" } | { kind: "refused" };

const notFound = { kind: "not-found" } as const;

export const getQuests = memberQuery(async (ctx, me): Promise<QuestsAnswer> => {
  if (!(await onTheMondayPath(ctx, me.member))) return notFound;
  const monday = await mondayQuestsOf(ctx, me);
  return monday.quests.kind === "two-quests" && monday.quests.quests.length === 0 ? notFound : monday;
});

export const viewQuests = memberMutation({
  args: { surface: questsSurfaceValidator },
  handler: async (ctx, me, _person, { surface }): Promise<QuestsViewAnswer> => {
    if (!(await onTheMondayPath(ctx, me.member))) return { kind: "refused" };
    await reportQuestsViewed(ctx, { workspace: me.workspace, member: me.member, surface, at: Date.now() });
    return { kind: "viewed" };
  },
});
