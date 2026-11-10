// The module map's skeleton of convex/workspace/url.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function workspaceUrlOf(ctx: QueryContext, workspace: string): Promise<string | null> {
  throw notPorted("workspace.url.workspaceUrlOf");
}

export async function customEmojiPageOf(ctx: QueryContext, workspace: string): Promise<string | null> {
  throw notPorted("workspace.url.customEmojiPageOf");
}

export async function claimWorkspaceUrlRequest(ctx: MutationContext, workspace: string): Promise<boolean> {
  throw notPorted("workspace.url.claimWorkspaceUrlRequest");
}

export const rememberWorkspaceUrlArgs = z.strictObject({ workspace: z.string(), url: z.string() });
export async function rememberWorkspaceUrl(ctx: MutationContext, args: z.infer<typeof rememberWorkspaceUrlArgs>): Promise<boolean> {
  throw notPorted("workspace.url.rememberWorkspaceUrl");
}

export const releaseWorkspaceUrlRequestArgs = z.strictObject({ workspace: z.string() });
export async function releaseWorkspaceUrlRequest(ctx: MutationContext, args: z.infer<typeof releaseWorkspaceUrlRequestArgs>): Promise<null> {
  throw notPorted("workspace.url.releaseWorkspaceUrlRequest");
}
