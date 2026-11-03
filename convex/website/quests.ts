import { reportQuestsViewed } from "../analytics/isolatedUsage";
import { questsSurfaceValidator } from "../analytics/projections";
import { onTheMondayPath } from "../quests/flag";
import { memberMutation } from "./memberMutation";
import { memberQuery } from "./memberQuery";
import { mondayQuestsOf, type MondayQuests } from "./mondayQuests";

export type { DrawnQuest, GettingStartedStep, MondayQuests, QuestItemState, SideQuest } from "./mondayQuests";

export type QuestsAnswer = MondayQuests | { kind: "not-found" };

export type QuestsViewAnswer = { kind: "viewed" } | { kind: "refused" };

export const getQuests = memberQuery(async (ctx, me): Promise<QuestsAnswer> => {
  return (await onTheMondayPath(ctx, me.member)) ? mondayQuestsOf(ctx, me) : { kind: "not-found" };
});

export const viewQuests = memberMutation({
  args: { surface: questsSurfaceValidator },
  handler: async (ctx, me, _person, { surface }): Promise<QuestsViewAnswer> => {
    if (!(await onTheMondayPath(ctx, me.member))) return { kind: "refused" };
    await reportQuestsViewed(ctx, { workspace: me.workspace, member: me.member, surface, at: Date.now() });
    return { kind: "viewed" };
  },
});
