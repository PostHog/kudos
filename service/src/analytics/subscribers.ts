// The module map's skeleton of convex/analytics/subscribers.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { achievementEarnedEventValidator, teamPagesCompletedEventValidator, attemptFailedEventValidator, hoggieDroppedEventValidator, kudosGivenEventValidator, levelReachedEventValidator, memberWelcomedEventValidator, perkBoughtEventValidator, questFinishedEventValidator, questsDrawnEventValidator, hugGivenEventValidator, stickersCollectedEventValidator, thoughtfulPacksGrantedEventValidator, stickerPutInEventValidator, itemTurnedEventValidator, unlockOpenedEventValidator, unlockReadyEventValidator, unlocksLaunchedEventValidator } from "../bus/events.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const recordKudosGivenArgs = z.strictObject({ event: kudosGivenEventValidator });
export async function recordKudosGiven(ctx: MutationContext, args: z.infer<typeof recordKudosGivenArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordKudosGiven");
}
export const recordKudosGivenJob = mutationJob("analytics.subscribers.recordKudosGiven", recordKudosGivenArgs, recordKudosGiven);

export const recordAttemptFailedArgs = z.strictObject({ event: attemptFailedEventValidator });
export async function recordAttemptFailed(ctx: MutationContext, args: z.infer<typeof recordAttemptFailedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordAttemptFailed");
}
export const recordAttemptFailedJob = mutationJob("analytics.subscribers.recordAttemptFailed", recordAttemptFailedArgs, recordAttemptFailed);

export const recordMemberWelcomedArgs = z.strictObject({ event: memberWelcomedEventValidator });
export async function recordMemberWelcomed(ctx: MutationContext, args: z.infer<typeof recordMemberWelcomedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordMemberWelcomed");
}
export const recordMemberWelcomedJob = mutationJob("analytics.subscribers.recordMemberWelcomed", recordMemberWelcomedArgs, recordMemberWelcomed);

export const recordLevelReachedArgs = z.strictObject({ event: levelReachedEventValidator });
export async function recordLevelReached(ctx: MutationContext, args: z.infer<typeof recordLevelReachedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordLevelReached");
}
export const recordLevelReachedJob = mutationJob("analytics.subscribers.recordLevelReached", recordLevelReachedArgs, recordLevelReached);

export const recordUnlockReadyArgs = z.strictObject({ event: unlockReadyEventValidator });
export async function recordUnlockReady(ctx: MutationContext, args: z.infer<typeof recordUnlockReadyArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordUnlockReady");
}
export const recordUnlockReadyJob = mutationJob("analytics.subscribers.recordUnlockReady", recordUnlockReadyArgs, recordUnlockReady);

export const recordUnlockOpenedArgs = z.strictObject({ event: unlockOpenedEventValidator });
export async function recordUnlockOpened(ctx: MutationContext, args: z.infer<typeof recordUnlockOpenedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordUnlockOpened");
}
export const recordUnlockOpenedJob = mutationJob("analytics.subscribers.recordUnlockOpened", recordUnlockOpenedArgs, recordUnlockOpened);

export const recordUnlocksLaunchedArgs = z.strictObject({ event: unlocksLaunchedEventValidator });
export async function recordUnlocksLaunched(ctx: MutationContext, args: z.infer<typeof recordUnlocksLaunchedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordUnlocksLaunched");
}
export const recordUnlocksLaunchedJob = mutationJob("analytics.subscribers.recordUnlocksLaunched", recordUnlocksLaunchedArgs, recordUnlocksLaunched);

export const recordQuestsDrawnArgs = z.strictObject({ event: questsDrawnEventValidator });
export async function recordQuestsDrawn(ctx: MutationContext, args: z.infer<typeof recordQuestsDrawnArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordQuestsDrawn");
}
export const recordQuestsDrawnJob = mutationJob("analytics.subscribers.recordQuestsDrawn", recordQuestsDrawnArgs, recordQuestsDrawn);

export const recordQuestFinishedArgs = z.strictObject({ event: questFinishedEventValidator });
export async function recordQuestFinished(ctx: MutationContext, args: z.infer<typeof recordQuestFinishedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordQuestFinished");
}
export const recordQuestFinishedJob = mutationJob("analytics.subscribers.recordQuestFinished", recordQuestFinishedArgs, recordQuestFinished);

export const recordHoggieDroppedArgs = z.strictObject({ event: hoggieDroppedEventValidator });
export async function recordHoggieDropped(ctx: MutationContext, args: z.infer<typeof recordHoggieDroppedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordHoggieDropped");
}
export const recordHoggieDroppedJob = mutationJob("analytics.subscribers.recordHoggieDropped", recordHoggieDroppedArgs, recordHoggieDropped);

export const recordHugGivenArgs = z.strictObject({ event: hugGivenEventValidator });
export async function recordHugGiven(ctx: MutationContext, args: z.infer<typeof recordHugGivenArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordHugGiven");
}
export const recordHugGivenJob = mutationJob("analytics.subscribers.recordHugGiven", recordHugGivenArgs, recordHugGiven);

export const recordTeamPagesCompletedArgs = z.strictObject({ event: teamPagesCompletedEventValidator });
export async function recordTeamPagesCompleted(ctx: MutationContext, args: z.infer<typeof recordTeamPagesCompletedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordTeamPagesCompleted");
}
export const recordTeamPagesCompletedJob = mutationJob("analytics.subscribers.recordTeamPagesCompleted", recordTeamPagesCompletedArgs, recordTeamPagesCompleted);

export const recordPersonCollectedArgs = z.strictObject({ event: stickersCollectedEventValidator });
export async function recordPersonCollected(ctx: MutationContext, args: z.infer<typeof recordPersonCollectedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordPersonCollected");
}
export const recordPersonCollectedJob = mutationJob("analytics.subscribers.recordPersonCollected", recordPersonCollectedArgs, recordPersonCollected);

export const recordPacksEarnedArgs = z.strictObject({ event: thoughtfulPacksGrantedEventValidator });
export async function recordPacksEarned(ctx: MutationContext, args: z.infer<typeof recordPacksEarnedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordPacksEarned");
}
export const recordPacksEarnedJob = mutationJob("analytics.subscribers.recordPacksEarned", recordPacksEarnedArgs, recordPacksEarned);

export const recordAlbumStickerCollectedArgs = z.strictObject({ event: stickerPutInEventValidator });
export async function recordAlbumStickerCollected(ctx: MutationContext, args: z.infer<typeof recordAlbumStickerCollectedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordAlbumStickerCollected");
}
export const recordAlbumStickerCollectedJob = mutationJob("analytics.subscribers.recordAlbumStickerCollected", recordAlbumStickerCollectedArgs, recordAlbumStickerCollected);

export const recordItemTurnedArgs = z.strictObject({ event: itemTurnedEventValidator });
export async function recordItemTurned(ctx: MutationContext, args: z.infer<typeof recordItemTurnedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordItemTurned");
}
export const recordItemTurnedJob = mutationJob("analytics.subscribers.recordItemTurned", recordItemTurnedArgs, recordItemTurned);

export const recordPerkBoughtArgs = z.strictObject({ event: perkBoughtEventValidator });
export async function recordPerkBought(ctx: MutationContext, args: z.infer<typeof recordPerkBoughtArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordPerkBought");
}
export const recordPerkBoughtJob = mutationJob("analytics.subscribers.recordPerkBought", recordPerkBoughtArgs, recordPerkBought);

export const recordAchievementEarnedArgs = z.strictObject({ event: achievementEarnedEventValidator });
export async function recordAchievementEarned(ctx: MutationContext, args: z.infer<typeof recordAchievementEarnedArgs>): Promise<void> {
  throw notPorted("analytics.subscribers.recordAchievementEarned");
}
export const recordAchievementEarnedJob = mutationJob("analytics.subscribers.recordAchievementEarned", recordAchievementEarnedArgs, recordAchievementEarned);
