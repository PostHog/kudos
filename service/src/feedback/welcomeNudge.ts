// The module map's skeleton of convex/feedback/welcomeNudge.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { hugGivenEventValidator, kudosGivenEventValidator } from "../bus/events.ts";
import { messageRefValidator, type ChatUserId, type MessageRef, type WordSegment } from "../engine/messageEvent.ts";
import { type MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const welcomeNudgeCauseValidator = z.strictObject({ kind: z.union([z.literal("thanks"), z.literal("hug"), z.literal("kudosHug")]), giver: zv.id("members"), message: messageRefValidator });

export type WelcomeNudgeCause = z.infer<typeof welcomeNudgeCauseValidator>;

export type WelcomeNudgeMessage = { giver: ChatUserId; kudosEmoji: string; cause: { kind: "thanks"; quote: string | null } | { kind: "hug"; onKudos: boolean; permalink: string | null }; album: string };

export const nudgeTheThankedArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });
export async function nudgeTheThanked(ctx: MutationContext, args: z.infer<typeof nudgeTheThankedArgs>): Promise<void> {
  throw notPorted("feedback.welcomeNudge.nudgeTheThanked");
}
export const nudgeTheThankedJob = mutationJob("feedback.welcomeNudge.nudgeTheThanked", nudgeTheThankedArgs, nudgeTheThanked);

export const nudgeTheHuggedArgs = z.strictObject({ event: hugGivenEventValidator, cursor: z.optional(z.string()) });
export async function nudgeTheHugged(ctx: MutationContext, args: z.infer<typeof nudgeTheHuggedArgs>): Promise<void> {
  throw notPorted("feedback.welcomeNudge.nudgeTheHugged");
}
export const nudgeTheHuggedJob = mutationJob("feedback.welcomeNudge.nudgeTheHugged", nudgeTheHuggedArgs, nudgeTheHugged);

export const welcomeNudgeMessageArgs = z.strictObject({ workspace: z.string(), member: zv.id("members"), cause: welcomeNudgeCauseValidator });
export async function welcomeNudgeMessage(ctx: QueryContext, args: z.infer<typeof welcomeNudgeMessageArgs>): Promise<null | WelcomeNudgeMessage> {
  throw notPorted("feedback.welcomeNudge.welcomeNudgeMessage");
}

export async function welcomeNudgeSwitchOf(ctx: QueryContext, viewer: { workspace: string; member: MemberId }): Promise<boolean | null> {
  throw notPorted("feedback.welcomeNudge.welcomeNudgeSwitchOf");
}

export async function setWelcomeNudge(ctx: MutationContext, workspace: string, member: MemberId, on: boolean): Promise<boolean> {
  throw notPorted("feedback.welcomeNudge.setWelcomeNudge");
}

export async function publicQuoteOf(ctx: QueryContext, message: MessageRef, quoted: (segments: WordSegment[]) => WordSegment[] = (segments) => segments): Promise<string | null> {
  throw notPorted("feedback.welcomeNudge.publicQuoteOf");
}
