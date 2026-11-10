// The module map's skeleton of convex/slack/welcome.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { welcomePickValidator } from "../feedback/welcome.ts";
import { questRewardLineOf } from "../mondayDm/questsCopy.ts";
import { onboardingReward } from "../quests/onboarding.ts";
import { mondayWelcomeCauseValidator, onboardingJourneyValidator, onboardingStepValidator } from "../welcome/mondayWelcome.ts";
import { welcomedAsValidator } from "../welcome/welcomedAs.ts";
import { attemptArgs } from "./delivery.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export const deliverWelcomeArgs = z.strictObject({ workspace: z.string(), user: z.string(), welcomed: z.optional(welcomedAsValidator), groups: z.optional(z.literal(true)), ...attemptArgs });
export async function deliverWelcome(ctx: ActionContext, args: z.infer<typeof deliverWelcomeArgs>): Promise<void> {
  throw notPorted("slack.welcome.deliverWelcome");
}
export const deliverWelcomeJob = actionJob("slack.welcome.deliverWelcome", deliverWelcomeArgs, deliverWelcome);

export const updateWelcomeArgs = z.strictObject({ workspace: z.string(), user: z.string(), conversation: z.string(), message: z.string(), pick: welcomePickValidator, ...attemptArgs });
export async function updateWelcome(ctx: ActionContext, args: z.infer<typeof updateWelcomeArgs>): Promise<void> {
  throw notPorted("slack.welcome.updateWelcome");
}
export const updateWelcomeJob = actionJob("slack.welcome.updateWelcome", updateWelcomeArgs, updateWelcome);

export const deliverMondayWelcomeArgs = z.strictObject({ workspace: z.string(), user: z.string(), member: zv.id("members"), cause: mondayWelcomeCauseValidator, journey: onboardingJourneyValidator, owesTheWelcomeItem: z.optional(z.boolean()), ...attemptArgs });
export async function deliverMondayWelcome(ctx: ActionContext, args: z.infer<typeof deliverMondayWelcomeArgs>): Promise<void> {
  throw notPorted("slack.welcome.deliverMondayWelcome");
}
export const deliverMondayWelcomeJob = actionJob("slack.welcome.deliverMondayWelcome", deliverMondayWelcomeArgs, deliverMondayWelcome);

const rewardLine = questRewardLineOf(onboardingReward.xp);

export const howToAskedValidator = z.strictObject({ conversation: z.string(), welcome: z.string(), step: onboardingStepValidator });

export const replyWithHowToArgs = z.strictObject({ workspace: z.string(), ...howToAskedValidator.shape, ...attemptArgs });
export async function replyWithHowTo(ctx: ActionContext, args: z.infer<typeof replyWithHowToArgs>): Promise<void> {
  throw notPorted("slack.welcome.replyWithHowTo");
}
export const replyWithHowToJob = actionJob("slack.welcome.replyWithHowTo", replyWithHowToArgs, replyWithHowTo);
