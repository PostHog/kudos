// The module map's skeleton of convex/slack/processEvent.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Observation } from "../engine/engine.ts";
import type { MessageDeleted, MessageEvent } from "../engine/messageEvent.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function processEvent(ctx: MutationContext, event: MessageEvent | MessageDeleted | null): Promise<Observation | null> {
  throw notPorted("slack.processEvent.processEvent");
}
