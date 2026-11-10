// What Quests does when a member gives kudos or a hug: starts their quests, records the recognition once, and moves
// every quest it counts toward. Today's convex/quests/quests.ts over the service's operations.
import { hugGivenEventValidator, kudosGivenEventValidator, type KudosGivenEvent } from "../bus/events.ts";
import { releaseSuccessReply, type QuestDone } from "../feedback/replies.ts";
import type { MemberId } from "../workspace/directory.ts";
import { mondayPathShownTo, onTheMondayPath, twoQuestsOn, twoQuestsShownTo } from "./flag.ts";
import { advanceHugLadder, startTheHugLadder } from "./hugLadder.ts";
import { judgeQuestsOf } from "./judged.ts";
import { advanceOnboarding, onboardingMovedBy } from "./onboarding.ts";
import type { MovedQuest } from "./progress.ts";
import { factOfHugGiven, factOfKudosGiven, recognize } from "./recognitions.ts";
import { advanceSide, drawSidesWhenDue, kudosQuestFinishedBy } from "./sides.ts";
import { questStartOf, startQuests } from "./start.ts";
import { advanceWeeklyQuests } from "./weekly.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export const followKudosGivenArgs = z.strictObject({ event: kudosGivenEventValidator });
export async function followKudosGiven(ctx: MutationContext, { event }: z.infer<typeof followKudosGivenArgs>): Promise<void> {
  const { done, moved } = await questsMovedBy(ctx, event);
  await judgeQuestsOf(ctx, event.awards);
  await releaseSuccessReply(ctx, event.message, done, moved);
}
export const followKudosGivenJob = mutationJob("quests.quests.followKudosGiven", followKudosGivenArgs, followKudosGiven);

export const followHugGivenArgs = z.strictObject({ event: hugGivenEventValidator });
export async function followHugGiven(ctx: MutationContext, { event }: z.infer<typeof followHugGivenArgs>): Promise<void> {
  if (!(await onTheMondayPath(ctx, event.giver))) return;
  await startQuestsOf(ctx, event.giver, event.at);
  const twoQuests = await twoQuestsShownTo(ctx, event.giver);
  const recorded = await recognize(ctx, factOfHugGiven(event));
  if (!twoQuests) return;
  // Only a hug recorded for the first time draws or counts: a replayed hugGiven may come from a week long gone.
  if (recorded) {
    await drawSidesWhenDue(ctx, event.giver, event.at);
    await advanceSide(ctx, factOfHugGiven(event));
    await startTheHugLadder(ctx, event.giver, event.at);
  }
  await advanceHugLadder(ctx, event.workspace, event.giver);
}
export const followHugGivenJob = mutationJob("quests.quests.followHugGiven", followHugGivenArgs, followHugGiven);

type QuestsMoved = { done: QuestDone[]; moved: MovedQuest[] };

async function questsMovedBy(ctx: MutationContext, event: KudosGivenEvent): Promise<QuestsMoved> {
  if (!(await onTheMondayPath(ctx, event.giver))) return { done: [], moved: [] };
  await startQuestsOf(ctx, event.giver, event.at);
  if (await recognize(ctx, factOfKudosGiven(event))) await advanceSidesBy(ctx, event);
  const drawn = await advanceWeeklyQuests(ctx, event);
  const onboarding = await advanceOnboarding(ctx, event);
  const kudosQuest = await kudosQuestFinishedBy(ctx, event.giver, event.day, event.message);
  const done = [...kudosQuest.map(({ goal, xp }) => ({ kind: "weekly", goal, xp, hoggie: true }) as const), ...drawn.finished.map(({ goal, reward: { xp } }) => ({ kind: "weekly", goal, xp, hoggie: true }) as const), ...onboarding.map(({ step, reward: { xp } }) => ({ kind: "journey", step, xp, hoggie: true }) as const)];
  return { done, moved: [...drawn.moved, ...(await onboardingMovedBy(ctx, event))] };
}

// Only a kudos recorded for the first time draws or counts: a replayed kudosGiven may come from a week long gone.
async function advanceSidesBy(ctx: MutationContext, event: KudosGivenEvent): Promise<void> {
  if (!(await twoQuestsOn(ctx, event.giver))) return;
  await drawSidesWhenDue(ctx, event.giver, event.at);
  await advanceSide(ctx, factOfKudosGiven(event));
}

async function startQuestsOf(ctx: MutationContext, member: MemberId, at: number): Promise<void> {
  if ((await questStartOf(ctx, member)) === null && (await mondayPathShownTo(ctx, member))) await startQuests(ctx, member, at);
}
