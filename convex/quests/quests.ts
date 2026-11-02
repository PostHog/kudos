import { internalMutation, type MutationCtx } from "../_generated/server";
import { hugGivenEventValidator, kudosGivenEventValidator, type KudosGivenEvent } from "../bus/events";
import { releaseSuccessReply, type QuestDone } from "../feedback/replies";
import { mondayPathShownTo, onTheMondayPath, twoQuestsShownTo } from "./flag";
import { advanceHugLadder, startTheHugLadder } from "./hugLadder";
import { judgeQuestsOf } from "./judged";
import type { MovedQuest } from "./progress";
import { advanceOnboarding, onboardingMovedBy } from "./onboarding";
import { factOfHugGiven, factOfKudosGiven, recognize } from "./recognitions";
import { questStartOf, startQuests } from "./start";
import { advanceWeeklyQuests } from "./weekly";
import type { MemberId } from "../workspace/directory";

export const followKudosGiven = internalMutation({
  args: { event: kudosGivenEventValidator },
  handler: async (ctx, { event }) => {
    const { done, moved } = await questsMovedBy(ctx, event);
    await judgeQuestsOf(ctx, event.awards);
    await releaseSuccessReply(ctx, event.message, done, moved);
  },
});

export const followHugGiven = internalMutation({
  args: { event: hugGivenEventValidator },
  handler: async (ctx, { event }) => {
    if (!(await onTheMondayPath(ctx, event.giver))) return;
    await startQuestsOf(ctx, event.giver, event.at);
    const twoQuests = await twoQuestsShownTo(ctx, event.giver);
    if (twoQuests) await startTheHugLadder(ctx, event.giver, event.at);
    await recognize(ctx, factOfHugGiven(event));
    if (twoQuests) await advanceHugLadder(ctx, event.workspace, event.giver);
  },
});

type QuestsMoved = { done: QuestDone[]; moved: MovedQuest[] };

async function questsMovedBy(ctx: MutationCtx, event: KudosGivenEvent): Promise<QuestsMoved> {
  if (!(await onTheMondayPath(ctx, event.giver))) return { done: [], moved: [] };
  await startQuestsOf(ctx, event.giver, event.at);
  await recognize(ctx, factOfKudosGiven(event));
  const drawn = await advanceWeeklyQuests(ctx, event);
  const onboarding = await advanceOnboarding(ctx, event);
  const done = [...drawn.finished.map(({ goal, reward: { xp } }) => ({ kind: "weekly", goal, xp, hoggie: true }) as const), ...onboarding.map(({ step, reward: { xp } }) => ({ kind: "journey", step, xp, hoggie: true }) as const)];
  return { done, moved: [...drawn.moved, ...(await onboardingMovedBy(ctx, event))] };
}

async function startQuestsOf(ctx: MutationCtx, member: MemberId, at: number): Promise<void> {
  if ((await questStartOf(ctx, member)) === null && (await mondayPathShownTo(ctx, member))) await startQuests(ctx, member, at);
}
