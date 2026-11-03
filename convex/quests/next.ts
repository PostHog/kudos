import type { QueryCtx } from "../_generated/server";
import type { MemberId } from "../workspace/directory";
import { onTheMondayPath, twoQuestsOn } from "./flag";
import { nextOnboardingQuestOf } from "./onboarding";
import type { Side } from "./sides";
import type { Quest } from "./step";
import { twoQuestsOf } from "./twoQuests";

export type NextQuest = { side: Side; quest: Quest };

export async function nextQuestOf(ctx: QueryCtx, member: MemberId, at: number): Promise<NextQuest | null> {
  if (!(await onTheMondayPath(ctx, member))) return null;
  if (!(await twoQuestsOn(ctx, member))) return kudosOnboardingQuestOf(ctx, member);
  const next = (await twoQuestsOf(ctx, member, at)).find(({ next }) => next);
  return next === undefined ? null : { side: next.side, quest: next.quest };
}

async function kudosOnboardingQuestOf(ctx: QueryCtx, member: MemberId): Promise<NextQuest | null> {
  const step = await nextOnboardingQuestOf(ctx, member);
  return step === null ? null : { side: "kudos", quest: { kind: "journey", step } };
}
