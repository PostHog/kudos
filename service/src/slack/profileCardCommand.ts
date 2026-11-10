// The module map's skeleton of convex/slack/profileCardCommand.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Line } from "../feedback/segments.ts";
import { type Viewer } from "./commandReplies.ts";
import { attemptArgs } from "./delivery.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export type CardRequest = { kind: "card"; target: string } | { kind: "usage" };

export type CardReply = { shown: false } | { shown: true; lines: Line[] | null };

type Viewing = Viewer & { arrivedAt: number };

type Viewed = Viewing & { own: boolean };

type Answer = { lines: Line[]; own: boolean | null };

const personMention = /^<@([^|>\s]+)(?:\|[^>]*)?>$/;
const anyMention = /^<[@!#]/;

const cardRequestValidator = z.union([z.strictObject({ kind: z.literal("card"), target: z.string() }), z.strictObject({ kind: z.literal("usage") })]);

const viewingArgs = { workspace: z.string(), user: z.string(), arrivedAt: zv.number() };

const cardViewedArgs = { ...viewingArgs, own: z.boolean() };

export const cardViewedValidator = z.strictObject({ own: z.boolean(), arrivedAt: zv.number() });

export function cardRequestOf(text: string): CardRequest | null {
  const trimmed = text.trim();
  const person = personMention.exec(trimmed);
  if (person !== null) return { kind: "card", target: person[1]! };
  return anyMention.test(trimmed) ? { kind: "usage" } : null;
}

export const profileCardReplyArgs = z.strictObject({ ...viewingArgs, request: cardRequestValidator, responseUrl: z.string() });
export async function profileCardReply(ctx: MutationContext, args: z.infer<typeof profileCardReplyArgs>): Promise<{ shown: false } | { shown: true; lines: null | import("../feedback/segments.ts").Line[] }> {
  throw notPorted("slack.profileCardCommand.profileCardReply");
}

export const answerUnknownTargetArgs = z.strictObject({ ...viewingArgs, target: z.string(), responseUrl: z.string(), ...attemptArgs });
export async function answerUnknownTarget(ctx: ActionContext, args: z.infer<typeof answerUnknownTargetArgs>): Promise<void> {
  throw notPorted("slack.profileCardCommand.answerUnknownTarget");
}
export const answerUnknownTargetJob = actionJob("slack.profileCardCommand.answerUnknownTarget", answerUnknownTargetArgs, answerUnknownTarget);

export const cardOfKnownTargetArgs = z.strictObject({ workspace: z.string(), user: z.string(), target: z.string() });
export async function cardOfKnownTarget(ctx: MutationContext, args: z.infer<typeof cardOfKnownTargetArgs>): Promise<Answer> {
  throw notPorted("slack.profileCardCommand.cardOfKnownTarget");
}

export const reportProfileCardViewedArgs = z.strictObject({ ...cardViewedArgs, ...attemptArgs });
export async function reportProfileCardViewed(ctx: ActionContext, args: z.infer<typeof reportProfileCardViewedArgs>): Promise<void> {
  throw notPorted("slack.profileCardCommand.reportProfileCardViewed");
}
export const reportProfileCardViewedJob = actionJob("slack.profileCardCommand.reportProfileCardViewed", reportProfileCardViewedArgs, reportProfileCardViewed);

export function recordProfileCardViewedWithoutBlocking(ctx: ActionContext, viewed: Viewed): Promise<void> {
  throw notPorted("slack.profileCardCommand.recordProfileCardViewedWithoutBlocking");
}

export const recordProfileCardViewedArgs = z.strictObject(cardViewedArgs);
export async function recordProfileCardViewed(ctx: MutationContext, args: z.infer<typeof recordProfileCardViewedArgs>): Promise<void> {
  throw notPorted("slack.profileCardCommand.recordProfileCardViewed");
}
