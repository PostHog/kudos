// The module map's skeleton of convex/slack/workspaceUrl.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { ActionContext, MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export async function fillWorkspaceUrlLater(ctx: MutationContext, workspace: string): Promise<void> {
  throw notPorted("slack.workspaceUrl.fillWorkspaceUrlLater");
}

export const fillWorkspaceUrlArgs = z.strictObject({ workspace: z.optional(z.string()) });
export async function fillWorkspaceUrl(ctx: ActionContext, args: z.infer<typeof fillWorkspaceUrlArgs>): Promise<void> {
  throw notPorted("slack.workspaceUrl.fillWorkspaceUrl");
}
export const fillWorkspaceUrlJob = actionJob("slack.workspaceUrl.fillWorkspaceUrl", fillWorkspaceUrlArgs, fillWorkspaceUrl);
