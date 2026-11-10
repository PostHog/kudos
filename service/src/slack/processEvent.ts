// A message event, observed by the engine: today's convex/slack/processEvent.ts. The engine's observation decides what
// follows in Slack: a directory check for the people it is still waiting on, and the workspace's URL once it matters.
import { observe, type Observation } from "../engine/engine.ts";
import type { MessageDeleted, MessageEvent } from "../engine/messageEvent.ts";
import type { MutationContext } from "../operations.ts";
import { checkDirectoryLater } from "./directory.ts";
import { fillWorkspaceUrlLater } from "./workspaceUrl.ts";

export async function processEvent(ctx: MutationContext, event: MessageEvent | MessageDeleted | null): Promise<Observation | null> {
  if (event === null) return null;
  const observation = await observe(ctx, event);
  await checkDirectoryLater(ctx, event.ref, observation);
  if (observation.kind !== "ignored") await fillWorkspaceUrlLater(ctx, event.ref.workspace);
  return observation;
}
