// The module map's skeleton of convex/website/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const websiteFlag = { key: "website", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function websiteOpen(ctx: QueryContext | MutationContext): Promise<boolean> {
  throw notPorted("website.flag.websiteOpen");
}

export function websiteOpenWithoutWriting(ctx: QueryContext | MutationContext): Promise<boolean> {
  throw notPorted("website.flag.websiteOpenWithoutWriting");
}

export function websiteOpenTo(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("website.flag.websiteOpenTo");
}

export async function websiteShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("website.flag.websiteShownTo");
}

export async function websiteAdmits(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("website.flag.websiteAdmits");
}

export async function workspaceLaunchDueIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("website.flag.workspaceLaunchDueIn");
}

export async function noLaunchWaitsFor(ctx: QueryContext, { workspace }: { workspace: string }): Promise<boolean> {
  throw notPorted("website.flag.noLaunchWaitsFor");
}

export async function readyFromTheStartOnceVerified(ctx: MutationContext, member: MemberId): Promise<void> {
  throw notPorted("website.flag.readyFromTheStartOnceVerified");
}
