// The module map's skeleton of convex/slack/delivery.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { messageRefValidator, type Mention } from "../engine/messageEvent.ts";
import type { Beside } from "../feedback/beside.ts";
import type { DeepLink } from "../feedback/deepLinks.ts";
import type { Line, Segment } from "../feedback/segments.ts";
import { type SlackAnswer } from "./webApi.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export const attemptArgs = { attempt: z.optional(zv.number()) };
export const besideValidator = z.strictObject({ conversation: z.string(), threadRoot: z.optional(z.string()) });
const atMostAttempts = 3;
const longestRetryDelayMs = 60 * 60 * 1000;
const rateLimitErrors = new Set(["ratelimited", "rate_limited"]);
const refusedAsEphemeral = new Set(["user_not_in_channel", "channel_not_found", "not_in_channel"]);

export type Attempt<Data = object> =
  | { kind: "delivered"; answer: SlackAnswer<Data> }
  | { kind: "gone"; error: string }
  | { kind: "held"; until: number }
  | { kind: "failed"; retryAt?: number; error?: string }
  | { kind: "unknown" };
export type Retry = { at: number; attempt: number } | null;
type Send = (attempt: number) => Promise<Retry>;

export const deliverIndicatorArgs = z.strictObject({ ...messageRefValidator.shape, ...attemptArgs });
export async function deliverIndicator(ctx: ActionContext, args: z.infer<typeof deliverIndicatorArgs>): Promise<void> {
  throw notPorted("slack.delivery.deliverIndicator");
}
export const deliverIndicatorJob = actionJob("slack.delivery.deliverIndicator", deliverIndicatorArgs, deliverIndicator);

export const deliverPrivateReplyArgs = z.strictObject({ reply: zv.id("privateReplies"), ...attemptArgs });
export async function deliverPrivateReply(ctx: ActionContext, args: z.infer<typeof deliverPrivateReplyArgs>): Promise<void> {
  throw notPorted("slack.delivery.deliverPrivateReply");
}
export const deliverPrivateReplyJob = actionJob("slack.delivery.deliverPrivateReply", deliverPrivateReplyArgs, deliverPrivateReply);

export async function tryAtMostThreeTimes(attempt: number, send: Send, tryAgain: (retry: NonNullable<Retry>) => Promise<unknown>, giveUp: () => Promise<unknown> = async () => {}) {
  const retry = await retryOnAnyError(attempt, () => send(attempt));
  if (retry === null) return;
  if (retry.attempt <= atMostAttempts) await tryAgain(retry);
  else await giveUp();
}

export async function sendOnce(ctx: ActionContext, workspace: string, method: string, args: Record<string, unknown>, attempt: number): Promise<Retry> {
  throw notPorted("slack.delivery.sendOnce");
}

export async function sendAtMostOnce(ctx: ActionContext, workspace: string, method: string, args: Record<string, unknown>, attempt: number): Promise<Retry> {
  throw notPorted("slack.delivery.sendAtMostOnce");
}

export function isRateLimited(result: Attempt): result is Extract<Attempt, { kind: "held" | "failed" }> {
  return result.kind === "held" || (result.kind === "failed" && (result.retryAt !== undefined || rateLimitErrors.has(result.error ?? "")));
}

export async function sendBesideOrAsDirectMessage(ctx: ActionContext, workspace: string, user: string, beside: Beside, content: Record<string, unknown>, attempt: number): Promise<Retry> {
  throw notPorted("slack.delivery.sendBesideOrAsDirectMessage");
}

export function isRefusedAsEphemeral(result: Attempt) {
  return (result.kind === "gone" || result.kind === "failed") && result.error !== undefined && refusedAsEphemeral.has(result.error);
}

export function failedAttempt(attempt: number, retryAfterMs?: number): Retry {
  return retryAfter({ kind: "failed", ...(retryAfterMs !== undefined && { retryAt: Date.now() + retryAfterMs }) }, attempt);
}

async function retryOnAnyError(attempt: number, deliver: () => Promise<Retry>): Promise<Retry> {
  try {
    return await deliver();
  } catch (error) {
    console.warn(`delivery attempt ${attempt} failed: ${String(error)}`);
    return failedAttempt(attempt);
  }
}

export async function attemptCall<Data = object>(
  ctx: ActionContext,
  workspace: string,
  method: string,
  args: Record<string, unknown>,
  alsoDelivered = new Set<string>(),
): Promise<Attempt<Data>> {
  throw notPorted("slack.delivery.attemptCall");
}

export function isRefusedForItsBlocks(result: Attempt) {
  return result.kind === "failed" && result.error === "invalid_blocks";
}

export function retryAfter(result: Exclude<Attempt, { kind: "delivered" | "gone" }>, attempt: number): Retry {
  if (result.kind === "held") return { at: result.until, attempt };
  const retryAt = result.kind === "failed" ? result.retryAt : undefined;
  return { at: retryAt ?? Date.now() + Math.min(1000 * 2 ** attempt, longestRetryDelayMs), attempt: attempt + 1 };
}

export function slackTextOf(lines: Line[]) {
  return lines.map((line) => line.map(slackTextOfSegment).join("")).join("\n");
}

export function slackLink({ url, label }: DeepLink) {
  return `<${url}|${label}>`;
}

function slackTextOfSegment(segment: Segment) {
  if ("text" in segment) return segment.text;
  if ("link" in segment) return slackLink(segment.link);
  return slackMention(segment.mention);
}

function slackMention(mention: Mention) {
  if (mention.kind === "person") return `<@${mention.user}>`;
  if (mention.kind === "group") return `<!subteam^${mention.group}>`;
  return `\`@${mention.range}\``;
}
