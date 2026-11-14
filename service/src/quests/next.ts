// The member's one next quest on the Monday path: under two-quests the week's two quests' next one, else the next
// onboarding quest. Today's convex/quests/next.ts over the service's transaction.
import type { MemberId } from "../workspace/directory.ts";
import { onTheMondayPath, twoQuestsOn } from "./flag.ts";
import { nextOnboardingQuestOf } from "./onboarding.ts";
import type { Side } from "./sides.ts";
import type { Quest } from "./step.ts";
import { twoQuestsOf } from "./twoQuests.ts";
import type { QueryContext } from "../operations.ts";

export type NextQuest = { side: Side; quest: Quest };

export async function nextQuestOf(ctx: QueryContext, member: MemberId, at: number): Promise<NextQuest | null> {
  if (!(await onTheMondayPath(ctx, member))) return null;
  if (!(await twoQuestsOn(ctx, member))) return kudosOnboardingQuestOf(ctx, member);
  const next = (await twoQuestsOf(ctx, member, at)).find(({ next }) => next);
  return next === undefined ? null : { side: next.side, quest: next.quest };
}

async function kudosOnboardingQuestOf(ctx: QueryContext, member: MemberId): Promise<NextQuest | null> {
  const step = await nextOnboardingQuestOf(ctx, member);
  return step === null ? null : { side: "kudos", quest: { kind: "journey", step } };
}
