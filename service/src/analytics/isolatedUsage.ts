// The module map's skeleton of convex/analytics/isolatedUsage.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { boardPeriodValidator } from "../album/boards.ts";
import { messageKindValidator, messagePlaceValidator } from "../messageSettings/kinds.ts";
import { sentMondayDmSectionValidator } from "../mondayDm/records.ts";
import { hugMeasureValidator } from "../website/peopleBoards.ts";
import { welcomePathValidator } from "../welcome/welcomedAs.ts";
import { activityStateValidator, dmKindValidator, dmLinkDestinationValidator, hugsRecapCarrierValidator, questsSurfaceValidator } from "./projections.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

const leaderboardViewValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  board: z.union([z.literal("everyone"), z.literal("groups"), z.literal("my-group"), z.literal("people")]),
  period: boardPeriodValidator,
  surface: z.union([z.literal("app-home"), z.literal("command"), z.literal("website")]),
  measure: z.optional(hugMeasureValidator),
  at: zv.number(),
});

export type LeaderboardView = z.infer<typeof leaderboardViewValidator>;

export async function reportLeaderboardViewed(ctx: MutationContext, view: LeaderboardView): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportLeaderboardViewed");
}

export const recordLeaderboardViewedArgs = leaderboardViewValidator;
export async function recordLeaderboardViewed(ctx: MutationContext, args: z.infer<typeof recordLeaderboardViewedArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordLeaderboardViewed");
}
export const recordLeaderboardViewedJob = mutationJob("analytics.isolatedUsage.recordLeaderboardViewed", recordLeaderboardViewedArgs, recordLeaderboardViewed);

const leaderboardVisibilityChangeValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  visible: z.boolean(),
  at: zv.number(),
});

export type LeaderboardVisibilityChange = z.infer<typeof leaderboardVisibilityChangeValidator>;

export async function reportLeaderboardVisibilityChanged(ctx: MutationContext, change: LeaderboardVisibilityChange): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportLeaderboardVisibilityChanged");
}

export const recordLeaderboardVisibilityChangedArgs = leaderboardVisibilityChangeValidator;
export async function recordLeaderboardVisibilityChanged(ctx: MutationContext, args: z.infer<typeof recordLeaderboardVisibilityChangedArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordLeaderboardVisibilityChanged");
}
export const recordLeaderboardVisibilityChangedJob = mutationJob("analytics.isolatedUsage.recordLeaderboardVisibilityChanged", recordLeaderboardVisibilityChangedArgs, recordLeaderboardVisibilityChanged);

export const pickSurfaceValidator = z.union([z.literal("welcome"), z.literal("settings"), z.literal("website")]);

const primaryGroupPickValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  surface: pickSurfaceValidator,
  at: zv.number(),
});

export type PrimaryGroupPick = z.infer<typeof primaryGroupPickValidator>;

export async function reportPrimaryGroupPicked(ctx: MutationContext, pick: PrimaryGroupPick): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportPrimaryGroupPicked");
}

export const recordPrimaryGroupPickedArgs = primaryGroupPickValidator;
export async function recordPrimaryGroupPicked(ctx: MutationContext, args: z.infer<typeof recordPrimaryGroupPickedArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordPrimaryGroupPicked");
}
export const recordPrimaryGroupPickedJob = mutationJob("analytics.isolatedUsage.recordPrimaryGroupPicked", recordPrimaryGroupPickedArgs, recordPrimaryGroupPicked);

const messageSettingChangeValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  setting: messageKindValidator,
  on: z.boolean(),
  place: z.optional(messagePlaceValidator),
  via: z.optional(z.literal("dm-button")),
  at: zv.number(),
});

export type MessageSettingChange = z.infer<typeof messageSettingChangeValidator>;

export async function reportMessageSettingChanged(ctx: MutationContext, change: MessageSettingChange): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportMessageSettingChanged");
}

export const recordMessageSettingChangedArgs = messageSettingChangeValidator;
export async function recordMessageSettingChanged(ctx: MutationContext, args: z.infer<typeof recordMessageSettingChangedArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordMessageSettingChanged");
}
export const recordMessageSettingChangedJob = mutationJob("analytics.isolatedUsage.recordMessageSettingChanged", recordMessageSettingChangedArgs, recordMessageSettingChanged);

const hugsRecapValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  given: zv.number(),
  received: zv.number(),
  xp: zv.number(),
  via: z.optional(hugsRecapCarrierValidator),
  at: zv.number(),
});

export type HugsRecap = z.infer<typeof hugsRecapValidator>;

export async function reportHugsRecapSent(ctx: MutationContext, recap: HugsRecap): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportHugsRecapSent");
}

export const recordHugsRecapSentArgs = hugsRecapValidator;
export async function recordHugsRecapSent(ctx: MutationContext, args: z.infer<typeof recordHugsRecapSentArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordHugsRecapSent");
}
export const recordHugsRecapSentJob = mutationJob("analytics.isolatedUsage.recordHugsRecapSent", recordHugsRecapSentArgs, recordHugsRecapSent);

const mondayDmSentValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  sections: z.array(sentMondayDmSectionValidator),
  at: zv.number(),
});

export type MondayDmSent = z.infer<typeof mondayDmSentValidator>;

export async function reportMondayDmSent(ctx: MutationContext, sent: MondayDmSent): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportMondayDmSent");
}

export const recordMondayDmSentArgs = mondayDmSentValidator;
export async function recordMondayDmSent(ctx: MutationContext, args: z.infer<typeof recordMondayDmSentArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordMondayDmSent");
}
export const recordMondayDmSentJob = mutationJob("analytics.isolatedUsage.recordMondayDmSent", recordMondayDmSentArgs, recordMondayDmSent);

export const dmLinkValidator = z.strictObject({ dm: dmKindValidator, destination: dmLinkDestinationValidator });

export type DmLink = z.infer<typeof dmLinkValidator>;

const dmLinkClickValidator = z.strictObject({ workspace: z.string(), member: zv.id("members"), ...dmLinkValidator.shape, at: zv.number() });

export async function reportDmLinkClicked(ctx: MutationContext, click: z.infer<typeof dmLinkClickValidator>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportDmLinkClicked");
}

export const recordDmLinkClickedArgs = dmLinkClickValidator;
export async function recordDmLinkClicked(ctx: MutationContext, args: z.infer<typeof recordDmLinkClickedArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordDmLinkClicked");
}
export const recordDmLinkClickedJob = mutationJob("analytics.isolatedUsage.recordDmLinkClicked", recordDmLinkClickedArgs, recordDmLinkClicked);

const welcomeDmSentValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  path: welcomePathValidator,
  at: zv.number(),
});

export const recordWelcomeDmSentArgs = welcomeDmSentValidator;
export async function recordWelcomeDmSent(ctx: MutationContext, args: z.infer<typeof recordWelcomeDmSentArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordWelcomeDmSent");
}
export const recordWelcomeDmSentJob = mutationJob("analytics.isolatedUsage.recordWelcomeDmSent", recordWelcomeDmSentArgs, recordWelcomeDmSent);

const xpMomentEndingValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  skipped: z.boolean(),
  excerptsShown: zv.number(),
  folded: zv.number(),
  at: zv.number(),
});

export type XpMomentEnding = z.infer<typeof xpMomentEndingValidator>;

export async function reportXpMomentEnded(ctx: MutationContext, ending: XpMomentEnding): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportXpMomentEnded");
}

export const recordXpMomentEndedArgs = xpMomentEndingValidator;
export async function recordXpMomentEnded(ctx: MutationContext, args: z.infer<typeof recordXpMomentEndedArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordXpMomentEnded");
}
export const recordXpMomentEndedJob = mutationJob("analytics.isolatedUsage.recordXpMomentEnded", recordXpMomentEndedArgs, recordXpMomentEnded);

const howItWorksCloseValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  triedSlack: z.boolean(),
  at: zv.number(),
});

export type HowItWorksClose = z.infer<typeof howItWorksCloseValidator>;

export async function reportHowItWorksClosed(ctx: MutationContext, close: HowItWorksClose): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportHowItWorksClosed");
}

export const recordHowItWorksClosedArgs = howItWorksCloseValidator;
export async function recordHowItWorksClosed(ctx: MutationContext, args: z.infer<typeof recordHowItWorksClosedArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordHowItWorksClosed");
}
export const recordHowItWorksClosedJob = mutationJob("analytics.isolatedUsage.recordHowItWorksClosed", recordHowItWorksClosedArgs, recordHowItWorksClosed);

const questsViewValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  surface: questsSurfaceValidator,
  at: zv.number(),
});

export type QuestsView = z.infer<typeof questsViewValidator>;

export async function reportQuestsViewed(ctx: MutationContext, view: QuestsView): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportQuestsViewed");
}

export const recordQuestsViewedArgs = questsViewValidator;
export async function recordQuestsViewed(ctx: MutationContext, args: z.infer<typeof recordQuestsViewedArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordQuestsViewed");
}
export const recordQuestsViewedJob = mutationJob("analytics.isolatedUsage.recordQuestsViewed", recordQuestsViewedArgs, recordQuestsViewed);

const activityViewValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  state: activityStateValidator,
  at: zv.number(),
});

export type ActivityView = z.infer<typeof activityViewValidator>;

export async function reportActivityViewed(ctx: MutationContext, view: ActivityView): Promise<void> {
  throw notPorted("analytics.isolatedUsage.reportActivityViewed");
}

export const recordActivityViewedArgs = activityViewValidator;
export async function recordActivityViewed(ctx: MutationContext, args: z.infer<typeof recordActivityViewedArgs>): Promise<void> {
  throw notPorted("analytics.isolatedUsage.recordActivityViewed");
}
export const recordActivityViewedJob = mutationJob("analytics.isolatedUsage.recordActivityViewed", recordActivityViewedArgs, recordActivityViewed);
