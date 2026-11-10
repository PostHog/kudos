// The workspace's URL, an https origin Slack answers, which permalinks read; one request for it pending at a time,
// released when it fails and lapsing after 10 minutes. Today's convex/workspace/url.ts over the service's transaction.
import { z } from "zod";
import { workspaces } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { insertRow, patchRow } from "./rows.ts";
import { workspaceRow } from "./settings.ts";

const requestExpiresAfterMs = 10 * 60 * 1000;

export async function workspaceUrlOf(ctx: QueryContext, workspace: string): Promise<string | null> {
  return (await workspaceRow(ctx, workspace))?.url ?? null;
}

export async function customEmojiPageOf(ctx: QueryContext, workspace: string): Promise<string | null> {
  const url = await workspaceUrlOf(ctx, workspace);
  return url === null ? null : `${url}customize/emoji`;
}

export async function claimWorkspaceUrlRequest(ctx: MutationContext, workspace: string): Promise<boolean> {
  const row = await workspaceRow(ctx, workspace);
  if (row?.url !== undefined || isPending(ctx.now, row?.urlRequestedAt)) return false;
  if (row === null) await insertRow(ctx, workspaces, { workspace, urlRequestedAt: ctx.now });
  else await patchRow(ctx, workspaces, row._id, { urlRequestedAt: ctx.now });
  return true;
}

export const rememberWorkspaceUrlArgs = z.strictObject({ workspace: z.string(), url: z.string() });
export async function rememberWorkspaceUrl(ctx: MutationContext, { workspace, url }: z.infer<typeof rememberWorkspaceUrlArgs>): Promise<boolean> {
  const workspaceUrl = slackWorkspaceUrlOf(url);
  if (workspaceUrl === null) return false;
  const row = await workspaceRow(ctx, workspace);
  if (row === null) await insertRow(ctx, workspaces, { workspace, url: workspaceUrl });
  else await patchRow(ctx, workspaces, row._id, { url: workspaceUrl, urlRequestedAt: undefined });
  return true;
}

export const releaseWorkspaceUrlRequestArgs = z.strictObject({ workspace: z.string() });
export async function releaseWorkspaceUrlRequest(ctx: MutationContext, { workspace }: z.infer<typeof releaseWorkspaceUrlRequestArgs>): Promise<null> {
  const row = await workspaceRow(ctx, workspace);
  if (row !== null && row.urlRequestedAt !== undefined) await patchRow(ctx, workspaces, row._id, { urlRequestedAt: undefined });
  return null;
}

function isPending(now: number, requestedAt: number | undefined) {
  return requestedAt !== undefined && now - requestedAt < requestExpiresAfterMs;
}

function slackWorkspaceUrlOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? `${parsed.origin}/` : null;
  } catch {
    return null;
  }
}
