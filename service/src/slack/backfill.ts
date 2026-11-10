// The module map's skeleton of convex/slack/backfill.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { fetchedMessageValidator, messageRefValidator } from "../engine/messageEvent.ts";
import { z } from "zod";
import type { ActionContext, MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export const backfillWordsArgs = z.strictObject({ cursor: z.optional(z.string()), queue: z.optional(z.array(messageRefValidator)) });
export async function backfillWords(ctx: ActionContext, args: z.infer<typeof backfillWordsArgs>): Promise<void> {
  throw notPorted("slack.backfill.backfillWords");
}
export const backfillWordsJob = actionJob("slack.backfill.backfillWords", backfillWordsArgs, backfillWords);

export const givenWithoutWordsPageArgs = z.strictObject({ cursor: z.union([z.string(), z.null()]) });
export async function givenWithoutWordsPage(ctx: QueryContext, args: z.infer<typeof givenWithoutWordsPageArgs>): Promise<{ refs: { workspace: string; conversation: string; message: string }[]; cursor: string; isDone: boolean }> {
  throw notPorted("slack.backfill.givenWithoutWordsPage");
}

export const threadOfMessageWithoutWordsArgs = z.strictObject({ ref: messageRefValidator });
export async function threadOfMessageWithoutWords(ctx: QueryContext, args: z.infer<typeof threadOfMessageWithoutWordsArgs>): Promise<null | { threadRoot?: string }> {
  throw notPorted("slack.backfill.threadOfMessageWithoutWords");
}

const hydrateWordsArgs = { fetched: fetchedMessageValidator };

export const hydrateWordsArgs2 = z.strictObject(hydrateWordsArgs);
export async function hydrateWords(ctx: MutationContext, args: z.infer<typeof hydrateWordsArgs2>): Promise<{ kind: "hydrated" } | { kind: "refused"; why: "not-a-member" | "not-given" | "stale-revision" | "ordinary-chat" | "already-known" | "deletion-requested" }> {
  throw notPorted("slack.backfill.hydrateWords");
}

const forgetMissingArgs = { ref: messageRefValidator };

export const forgetMissingArgs2 = z.strictObject(forgetMissingArgs);
export async function forgetMissing(ctx: MutationContext, args: z.infer<typeof forgetMissingArgs2>): Promise<void> {
  throw notPorted("slack.backfill.forgetMissing");
}
