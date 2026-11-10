// A notice as its delivery job carries it, and the message setting that governs it. It sits apart from notify.ts, which sends notices through
// slack/directMessages.ts, so that file's job arguments can read it while notify.ts is still loading.
import { z } from "zod";
import { tierRefValidator } from "../achievements/ladders.ts";
import { featureValidator } from "../unlocks/feature.ts";
import type { MessageKind } from "../messageSettings/kinds.ts";
import { zv } from "../values.ts";

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
  z.strictObject({ kind: z.literal("coins-opened"), balance: zv.number() }),
]);

export type Notification = z.infer<typeof notificationValidator>;

const messageKindOf: Record<Notification["kind"], MessageKind> = {
  "level-reached": "level-ups",
  "features-shipped": "new-features",
  "tiers-earned": "achievements",
  "coins-opened": "new-features",
};

export function messageKindOfNotification(notification: Notification): MessageKind {
  return messageKindOf[notification.kind];
}
