// Slack delivery, as today's convex/slack/delivery.ts. Every send to Slack goes through `attemptCall`, which holds a
// workspace's calls to a method while Slack's Retry-After lasts, and tells apart a send that landed, one that is gone
// for good, one Slack refused, and one whose result nobody knows. A delivery's retries are jobs of its own, at most
// three tries for a reply; no generic retry runs on top. Every instant comes from the app's clock, never
// `Date.now()`, so the test route's clock moves Retry-After and backoff with it.
import type { Clock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import { messageRefValidator, type Mention, type MessageRef } from "../engine/messageEvent.ts";
import type { Beside } from "../feedback/beside.ts";
import type { DeepLink } from "../feedback/deepLinks.ts";
import { desired, type Indicator } from "../feedback/indicator.ts";
import { privateReply } from "../feedback/replies.ts";
import type { Line, Segment } from "../feedback/segments.ts";
import { actionJob, type Job } from "../jobs/define.ts";
import type { ActionContext } from "../operations.ts";
import { zv } from "../values.ts";
import { settingsFooterText } from "./appHomeLinks.ts";
import { oneReplyContentOf } from "./oneReply.ts";
import { on as placedOn, remember as rememberPlaced } from "./placedReactions.ts";
import { heldUntil, hold } from "./rateLimits.ts";
import { callSlack, type SlackAnswer } from "./webApi.ts";
import { z } from "zod";

export const attemptArgs = { attempt: z.optional(zv.number()) };
export const besideValidator = z.strictObject({ conversation: z.string(), threadRoot: z.optional(z.string()) });
const atMostAttempts = 3;
const longestRetryDelayMs = 60 * 60 * 1000;
const goneErrors = new Set(["message_not_found", "channel_not_found", "not_in_channel", "is_archived", "not_reactable", "invalid_name"]);
const rateLimitErrors = new Set(["ratelimited", "rate_limited"]);
const refusedAsEphemeral = new Set(["user_not_in_channel", "channel_not_found", "not_in_channel"]);
const reactionShown = new Set(["already_reacted"]);
const reactionNotShown = new Set(["no_reaction"]);

export type Attempt<Data = object> =
  | { kind: "delivered"; answer: SlackAnswer<Data> }
  | { kind: "gone"; error: string }
  | { kind: "held"; until: number }
  | { kind: "failed"; retryAt?: number; error?: string }
  | { kind: "unknown" };
export type Retry = { at: number; attempt: number } | null;
type Send = (attempt: number) => Promise<Retry>;

export const deliverIndicatorArgs = z.strictObject({ ...messageRefValidator.shape, ...attemptArgs });
/** Makes the message's reactions show the desired indicator, retrying until they do or the message is gone. */
export async function deliverIndicator(ctx: ActionContext, { attempt = 1, ...ref }: z.infer<typeof deliverIndicatorArgs>): Promise<void> {
  const retry = await retryOnAnyError(ctx.clock, attempt, () => reconcileIndicator(ctx, ref, attempt));
  if (retry !== null) await enqueueAt(ctx, deliverIndicatorJob, { ...ref, attempt: retry.attempt }, retry.at);
}
export const deliverIndicatorJob = actionJob("slack.delivery.deliverIndicator", deliverIndicatorArgs, deliverIndicator);

export const deliverPrivateReplyArgs = z.strictObject({ reply: zv.id("privateReplies"), ...attemptArgs });
/** Sends a private reply, tried at most three times. */
export async function deliverPrivateReply(ctx: ActionContext, { reply, attempt = 1 }: z.infer<typeof deliverPrivateReplyArgs>): Promise<void> {
  await tryAtMostThreeTimes(
    ctx.clock,
    attempt,
    (attempt) => sendPrivateReply(ctx, reply, attempt),
    (retry) => enqueueAt(ctx, deliverPrivateReplyJob, { reply, attempt: retry.attempt }, retry.at),
  );
}
export const deliverPrivateReplyJob = actionJob("slack.delivery.deliverPrivateReply", deliverPrivateReplyArgs, deliverPrivateReply);

/** Schedules a delivery's next try, as `ctx.scheduler.runAt` did: in a mutation of its own, since an action has none. */
export function enqueueAt<Args, Input>(ctx: ActionContext, job: Job<Args, Input>, args: Input, at: number): Promise<string> {
  return ctx.run.mutation(`${job.name}.retry`, ({ jobs }) => jobs.enqueue(job, args, { at }));
}

export async function tryAtMostThreeTimes(clock: Clock, attempt: number, send: Send, tryAgain: (retry: NonNullable<Retry>) => Promise<unknown>, giveUp: () => Promise<unknown> = async () => {}) {
  const retry = await retryOnAnyError(clock, attempt, () => send(attempt));
  if (retry === null) return;
  if (retry.attempt <= atMostAttempts) await tryAgain(retry);
  else await giveUp();
}

/** Sends until Slack takes it: a send whose result nobody knows is sent again. */
export async function sendOnce(ctx: ActionContext, workspace: string, method: string, args: Record<string, unknown>, attempt: number): Promise<Retry> {
  const result = await attemptCall(ctx, workspace, method, args);
  if (result.kind === "delivered" || result.kind === "gone") return null;
  return retryAfter(result, attempt, ctx.clock.now());
}

/** Sends again only when Slack held it back for its rate limit: a failed or uncertain send is never repeated. */
export async function sendAtMostOnce(ctx: ActionContext, workspace: string, method: string, args: Record<string, unknown>, attempt: number): Promise<Retry> {
  const result = await attemptCall(ctx, workspace, method, args);
  return isRateLimited(result) ? retryAfter(result, attempt, ctx.clock.now()) : null;
}

export function isRateLimited(result: Attempt): result is Extract<Attempt, { kind: "held" | "failed" }> {
  return result.kind === "held" || (result.kind === "failed" && (result.retryAt !== undefined || rateLimitErrors.has(result.error ?? "")));
}

export async function sendBesideOrAsDirectMessage(ctx: ActionContext, workspace: string, user: string, beside: Beside, content: Record<string, unknown>, attempt: number): Promise<Retry> {
  const ephemeral = { channel: beside.conversation, user, ...content, ...(beside.threadRoot && { thread_ts: beside.threadRoot }) };
  const result = await attemptCall(ctx, workspace, "chat.postEphemeral", ephemeral);
  if (result.kind === "delivered") return null;
  if (isRefusedAsEphemeral(result)) return sendOnce(ctx, workspace, "chat.postMessage", { channel: user, ...content }, attempt);
  return result.kind === "gone" ? null : retryAfter(result, attempt, ctx.clock.now());
}

export function isRefusedAsEphemeral(result: Attempt) {
  return (result.kind === "gone" || result.kind === "failed") && result.error !== undefined && refusedAsEphemeral.has(result.error);
}

/** The next try after a failure, at `now` plus Slack's Retry-After when it gave one, else after the backoff. */
export function failedAttempt(attempt: number, now: number, retryAfterMs?: number): Retry {
  return retryAfter({ kind: "failed", ...(retryAfterMs !== undefined && { retryAt: now + retryAfterMs }) }, attempt, now);
}

async function reconcileIndicator(ctx: ActionContext, ref: MessageRef, attempt: number): Promise<Retry> {
  const { indicator, version } = await ctx.run.query("feedback.indicator.desired", (q) => desired(q, ref));
  const placed = await ctx.run.query("slack.placedReactions.on", (q) => placedOn(q, ref));
  for (const step of reactionStepsTo(indicator, placed)) {
    if (step.op === "add") await ctx.run.mutation("slack.placedReactions.remember", (m) => rememberPlaced(m, { ref, emoji: step.emoji }));
    const result =
      step.op === "add"
        ? await attemptCall(ctx, ref.workspace, "reactions.add", reactionArgs(ref, step.emoji), reactionShown)
        : await attemptCall(ctx, ref.workspace, "reactions.remove", reactionArgs(ref, step.emoji), reactionNotShown);
    if (result.kind === "gone") return null;
    if (result.kind !== "delivered") return retryAfter(result, attempt, ctx.clock.now());
  }
  const latest = await ctx.run.query("feedback.indicator.desired", (q) => desired(q, ref));
  return latest.version === version ? null : { at: ctx.clock.now(), attempt: 1 };
}

async function sendPrivateReply(ctx: ActionContext, reply: Id<"privateReplies">, attempt: number): Promise<Retry> {
  const row = await ctx.run.query("feedback.replies.privateReply", (q) => privateReply(q, { reply }));
  if (row === null) return null;
  const content = row.oneReply === null ? { text: [slackTextOf(row.lines), ...(row.footer === null ? [] : [settingsFooterText(row.workspace, row.footer)])].join("\n") } : oneReplyContentOf(row.workspace, row.oneReply, row.footer);
  if (row.asDirectMessage) return sendOnce(ctx, row.workspace, "chat.postMessage", { channel: row.to, ...content }, attempt);
  const message = { channel: row.conversation, user: row.to, ...content, ...(row.threadRoot && { thread_ts: row.threadRoot }) };
  if (row.oneReply !== null) return sendBesideOrAtMostOnceAsDirectMessage(ctx, row.workspace, message, { channel: row.to, ...content }, attempt);
  return sendOnce(ctx, row.workspace, "chat.postEphemeral", message, attempt);
}

async function sendBesideOrAtMostOnceAsDirectMessage(ctx: ActionContext, workspace: string, ephemeral: Record<string, unknown>, direct: Record<string, unknown>, attempt: number): Promise<Retry> {
  const result = await attemptCall(ctx, workspace, "chat.postEphemeral", ephemeral);
  if (isRefusedAsEphemeral(result)) return sendAtMostOnce(ctx, workspace, "chat.postMessage", direct, attempt);
  return result.kind === "delivered" || result.kind === "gone" ? null : retryAfter(result, attempt, ctx.clock.now());
}

async function retryOnAnyError(clock: Clock, attempt: number, deliver: () => Promise<Retry>): Promise<Retry> {
  try {
    return await deliver();
  } catch (error) {
    console.warn(`delivery attempt ${attempt} failed: ${String(error)}`);
    return failedAttempt(attempt, clock.now());
  }
}

type ReactionStep = { op: "add" | "remove"; emoji: string };

function reactionStepsTo(desired: Indicator, placed: string[]): ReactionStep[] {
  const removals = placed.filter((emoji) => emoji !== desired?.emoji).map((emoji): ReactionStep => ({ op: "remove", emoji }));
  return desired ? [...removals, { op: "add", emoji: desired.emoji }] : removals;
}

function reactionArgs(ref: MessageRef, emoji: string) {
  return { channel: ref.conversation, timestamp: ref.message, name: emoji };
}

/**
 * One call to Slack. Held while the workspace's calls to the method are rate limited; a Retry-After Slack answers
 * holds the method for every delivery. `alsoDelivered` names errors that mean the call's effect already shows.
 */
export async function attemptCall<Data = object>(
  ctx: ActionContext,
  workspace: string,
  method: string,
  args: Record<string, unknown>,
  alsoDelivered = new Set<string>(),
): Promise<Attempt<Data>> {
  const until = await ctx.run.query("slack.rateLimits.heldUntil", (q) => heldUntil(q, { workspace, method }));
  if (until > ctx.clock.now()) return { kind: "held", until };
  const answer = await answerOrUnknown<Data>(method, args);
  if (answer === "unknown") return { kind: "unknown" };
  if (answer.ok || alsoDelivered.has(answer.error)) return { kind: "delivered", answer };
  if (goneErrors.has(answer.error)) return { kind: "gone", error: answer.error };
  console.warn(`${method} failed: ${answer.error}`);
  if (answer.retryAfterMs === undefined) return { kind: "failed", error: answer.error };
  const retryAt = ctx.clock.now() + answer.retryAfterMs;
  await ctx.run.mutation("slack.rateLimits.hold", (m) => hold(m, { workspace, method, until: retryAt }));
  return { kind: "failed", retryAt, error: answer.error };
}

async function answerOrUnknown<Data>(method: string, args: Record<string, unknown>): Promise<SlackAnswer<Data> | "unknown"> {
  try {
    return await callSlack<Data>(method, args);
  } catch (error) {
    console.warn(`${method} has no known result: ${String(error)}`);
    return "unknown";
  }
}

export function isRefusedForItsBlocks(result: Attempt) {
  return result.kind === "failed" && result.error === "invalid_blocks";
}

/** The next try: when the hold ends for a held call, else at Slack's Retry-After or after the backoff from `now`. */
export function retryAfter(result: Exclude<Attempt, { kind: "delivered" | "gone" }>, attempt: number, now: number): Retry {
  if (result.kind === "held") return { at: result.until, attempt };
  const retryAt = result.kind === "failed" ? result.retryAt : undefined;
  return { at: retryAt ?? now + Math.min(1000 * 2 ** attempt, longestRetryDelayMs), attempt: attempt + 1 };
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
