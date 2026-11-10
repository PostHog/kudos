// The module map's skeleton of convex/slack/commandReplies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { ReportableError } from "../analytics/exceptions.ts";
import type { Line } from "../feedback/segments.ts";
import { slackTextOf, type Retry } from "./delivery.ts";
import type { LookUp } from "./directory.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Viewer = { workspace: string; user: string };

export function replyPrivately(lines: Line[]) {
  return Response.json({ response_type: "ephemeral", text: slackTextOf(lines) });
}

export async function answerCommand(responseUrl: string, text: string) {
  const response = await fetch(responseUrl, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ response_type: "ephemeral", text }),
  });
  if (!response.ok) throw new ReportableError(`Slack response_url answered HTTP ${response.status}`);
}

export async function onceKnown(ctx: ActionContext, attempt: number, viewer: Viewer, then: () => Promise<unknown>, tryAgain: (retry: NonNullable<Retry>) => Promise<unknown>): Promise<void> {
  throw notPorted("slack.commandReplies.onceKnown");
}

export async function knownOrLookedUp(ctx: ActionContext, { workspace, user }: Viewer): Promise<LookUp> {
  throw notPorted("slack.commandReplies.knownOrLookedUp");
}
