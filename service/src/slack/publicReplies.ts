// The one public reply, as today's convex/slack/publicReplies.ts: posted once, then edited in place as sections arrive,
// with the reply's version telling a delivery whether a newer change still has to go out. A post whose answer is lost
// is never posted again; a post Slack refused waits to be posted again, at most three tries in all.
import { ReportableError } from "../analytics/exceptions.ts";
import type { Doc } from "../db/schema/index.ts";
import { desired, linesOf, recordPosted, sendingFailed, startSending, stopPosting, stopSending } from "../feedback/publicReplies.ts";
import { actionJob } from "../jobs/define.ts";
import type { ActionContext } from "../operations.ts";
import { zv } from "../values.ts";
import { attemptArgs, attemptCall, enqueueAt, retryAfter, slackTextOf, tryAtMostThreeTimes, type Retry } from "./delivery.ts";
import { z } from "zod";
import type { Id } from "../db/columns.ts";

export const deliverPublicReplyArgs = z.strictObject({ reply: zv.id("publicReplies"), ...attemptArgs });
/** Makes Slack show the reply as it is now: posts it, edits it, or leaves it unposted when nothing in it may show. */
export async function deliverPublicReply(ctx: ActionContext, { reply, attempt = 1 }: z.infer<typeof deliverPublicReplyArgs>): Promise<void> {
  await tryAtMostThreeTimes(
    ctx.clock,
    attempt,
    (attempt) => reconcilePublicReply(ctx, reply, attempt),
    (retry) => enqueueAt(ctx, deliverPublicReplyJob, { reply, attempt: retry.attempt }, retry.at),
    () => ctx.run.mutation("feedback.publicReplies.stopPosting", (m) => stopPosting(m, { reply })),
  );
}
export const deliverPublicReplyJob = actionJob("slack.publicReplies.deliverPublicReply", deliverPublicReplyArgs, deliverPublicReply);

async function reconcilePublicReply(ctx: ActionContext, reply: Id<"publicReplies">, attempt: number): Promise<Retry> {
  const row = await desiredReply(ctx, reply);
  if (row === null) return null;
  if (row.sections.length === 0) return nothingToShow(ctx, row);
  if (row.shown.state === "posting") return post(ctx, row, attempt);
  if (row.shown.state === "posted") return update(ctx, row, row.shown.ts, attempt);
  return null;
}

async function nothingToShow(ctx: ActionContext, row: Doc<"publicReplies">): Promise<Retry> {
  if (row.shown.state === "posting") await ctx.run.mutation("feedback.publicReplies.stopPosting", (m) => stopPosting(m, { reply: row._id }));
  return null;
}

async function post(ctx: ActionContext, row: Doc<"publicReplies">, attempt: number): Promise<Retry> {
  if (!(await ctx.run.mutation("feedback.publicReplies.startSending", (m) => startSending(m, { reply: row._id })))) return null;
  const message = { channel: row.channel, text: slackTextOf(linesOf(row)) };
  const result = await attemptCall<{ ts: string }>(ctx, row.workspace, "chat.postMessage", message);
  if (result.kind === "unknown") return null;
  if (result.kind === "gone") {
    await ctx.run.mutation("feedback.publicReplies.stopSending", (m) => stopSending(m, { reply: row._id }));
    return null;
  }
  if (result.kind !== "delivered") {
    await ctx.run.mutation("feedback.publicReplies.sendingFailed", (m) => sendingFailed(m, { reply: row._id }));
    return retryAfter(result, attempt, ctx.clock.now());
  }
  const ts = result.answer.ok ? result.answer.ts : undefined;
  if (ts === undefined) throw new ReportableError("chat.postMessage answered without the message's ts");
  const latestVersion = await ctx.run.mutation("feedback.publicReplies.recordPosted", (m) => recordPosted(m, { reply: row._id, ts }));
  return againIfChanged(ctx, row, latestVersion);
}

async function update(ctx: ActionContext, row: Doc<"publicReplies">, ts: string, attempt: number): Promise<Retry> {
  const result = await attemptCall(ctx, row.workspace, "chat.update", { channel: row.channel, ts, text: slackTextOf(linesOf(row)) });
  if (result.kind === "gone") return null;
  if (result.kind !== "delivered") return retryAfter(result, attempt, ctx.clock.now());
  const latest = await desiredReply(ctx, row._id);
  return againIfChanged(ctx, row, latest?.version ?? row.version);
}

function againIfChanged(ctx: ActionContext, delivered: Doc<"publicReplies">, latestVersion: number): Retry {
  return latestVersion === delivered.version ? null : { at: ctx.clock.now(), attempt: 1 };
}

function desiredReply(ctx: ActionContext, reply: Id<"publicReplies">) {
  return ctx.run.query("feedback.publicReplies.desired", (q) => desired(q, { reply }));
}
