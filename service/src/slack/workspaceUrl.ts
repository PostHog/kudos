// Asks Slack for the workspace's URL once, when something needs it and no request is pending. Today's
// convex/slack/workspaceUrl.ts: a job that reads auth.test and remembers the origin, releasing the claim when it can't.
import { z } from "zod";
import type { ActionContext, MutationContext } from "../operations.ts";
import { actionJob } from "../jobs/define.ts";
import { claimWorkspaceUrlRequest, releaseWorkspaceUrlRequest, rememberWorkspaceUrl } from "../workspace/url.ts";
import { readSlack, slackErrorCodeOf } from "./webApi.ts";

type Identity = { url?: unknown; team_id?: unknown };

export async function fillWorkspaceUrlLater(ctx: MutationContext, workspace: string): Promise<void> {
  if (await claimWorkspaceUrlRequest(ctx, workspace)) await ctx.jobs.enqueue(fillWorkspaceUrlJob, { workspace });
}

export const fillWorkspaceUrlArgs = z.strictObject({ workspace: z.optional(z.string()) });
export async function fillWorkspaceUrl(ctx: ActionContext, { workspace }: z.infer<typeof fillWorkspaceUrlArgs>): Promise<void> {
  let remembered = false;
  try {
    remembered = await rememberedWorkspaceUrl(ctx);
  } finally {
    if (!remembered && workspace !== undefined) await ctx.run.mutation("workspace.url.releaseWorkspaceUrlRequest", (m) => releaseWorkspaceUrlRequest(m, { workspace }));
  }
}
export const fillWorkspaceUrlJob = actionJob("slack.workspaceUrl.fillWorkspaceUrl", fillWorkspaceUrlArgs, fillWorkspaceUrl);

async function rememberedWorkspaceUrl(ctx: ActionContext): Promise<boolean> {
  const identity = await readSlack<Identity>("auth.test", {});
  if (!identity.ok) {
    console.warn("slack.workspace_url_not_read", { error: slackErrorCodeOf(identity.error) });
    return false;
  }
  if (typeof identity.url !== "string" || typeof identity.team_id !== "string") return false;
  const url = identity.url;
  return ctx.run.mutation("workspace.url.rememberWorkspaceUrl", (m) => rememberWorkspaceUrl(m, { workspace: identity.team_id as string, url }));
}
