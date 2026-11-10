// The module map's skeleton of convex/feedback/notify.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { tierRefValidator } from "../achievements/ladders.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { purchaseOutcomeValidator } from "../progression/purchases.ts";
import type { MessageKind } from "../messageSettings/kinds.ts";
import { featureValidator } from "../unlocks/feature.ts";
import type { ScheduledFeature } from "../unlocks/schedule.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { DeepLink } from "./deepLinks.ts";
import type { HomeAction } from "./home.ts";
import type { SettingsFooter } from "./settingsFooter.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { CommandAction, LinkAction } from "./home.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const completedTeamValidator = z.strictObject({ team: z.string(), name: z.string(), crestEarned: z.boolean() });

export type CompletedTeam = z.infer<typeof completedTeamValidator>;

export const notificationValidator = z.union([
  z.strictObject({
    kind: z.literal("level-reached"),
    level: zv.number(),
    skillPoints: z.union([zv.number(), z.null()]),
    xpToNextLevel: zv.number(),
    ready: z.array(featureValidator),
  }),
  z.strictObject({ kind: z.literal("features-shipped"), ready: z.array(featureValidator) }),
  z.strictObject({ kind: z.literal("tiers-earned"), tiers: z.array(tierRefValidator), teams: z.optional(z.array(completedTeamValidator)) }),
  z.strictObject({ kind: z.literal("coins-opened"), balance: zv.number() }),]
);

export type Notification = z.infer<typeof notificationValidator>;

export type NotificationLine = string | { text: string; action: HomeAction } | { link: DeepLink } | { footer: SettingsFooter };

const messageKindOf: Record<Notification["kind"], MessageKind> = {
  "level-reached": "level-ups",
  "features-shipped": "new-features",
  "tiers-earned": "achievements",
  "coins-opened": "new-features",
};

export async function notifyLevelReached(ctx: MutationContext, { member, level, skillPoints, xpToNextLevel, message }: LevelReachedEvent, ready: ScheduledFeature[]): Promise<void> {
  throw notPorted("feedback.notify.notifyLevelReached");
}

export async function notifyFeaturesShipped(ctx: MutationContext, member: MemberId, ready: ScheduledFeature[]): Promise<void> {
  throw notPorted("feedback.notify.notifyFeaturesShipped");
}

export async function notify(ctx: MutationContext, member: MemberId, notification: Notification, kudos?: MessageRef): Promise<void> {
  throw notPorted("feedback.notify.notify");
}

export function messageKindOfNotification(notification: Notification): MessageKind {
  return messageKindOf[notification.kind];
}

export const linesStillWantedArgs = z.strictObject({ member: zv.id("members"), notification: notificationValidator });
export async function linesStillWanted(ctx: QueryContext, args: z.infer<typeof linesStillWantedArgs>): Promise<null | (string | { text: string; action: CommandAction | LinkAction } | { link: import("./deepLinks.ts").DeepLink } | { footer: import("./settingsFooter.ts").SettingsFooter })[]> {
  throw notPorted("feedback.notify.linesStillWanted");
}

export const followersAwaitedUntilArgs = z.strictObject({ member: zv.id("members"), notification: notificationValidator });
export async function followersAwaitedUntil(ctx: QueryContext, args: z.infer<typeof followersAwaitedUntilArgs>): Promise<null | number> {
  throw notPorted("feedback.notify.followersAwaitedUntil");
}

export const purchaseReplyStillWantedArgs = z.strictObject({ member: zv.id("members"), outcome: purchaseOutcomeValidator });
export async function purchaseReplyStillWanted(ctx: QueryContext, args: z.infer<typeof purchaseReplyStillWantedArgs>): Promise<null | string> {
  throw notPorted("feedback.notify.purchaseReplyStillWanted");
}
