// The website flag: whether the website is open, to the sign-in workspace and to each member, and what a member's first
// admitted visit runs. Today's convex/website/flag.ts; the launch moments it reaches stay unlocks' and achievements'
// (S6), so a visit that reaches them throws their notPorted until S6 lands. Convex's `prepareWebsiteFlag`, which only
// tests ran, made the workspace's key; a test here makes it with `workspaceKeyOf`.
import { exposed, memberDecision, memberDecisionBeforeWriting, memberDecisionWithoutWriting, workspaceDecision, workspaceDecisionWithoutWriting, type Flag } from "../analytics/flags.ts";
import { bookLaunchDueIn } from "../achievements/flag.ts";
import { signInWorkspace } from "../slack/signIn.ts";
import { readyFromTheStartOnTheWebsite, unlocksLaunchDueIn, unlocksPreviewedBy } from "../unlocks/launch.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const websiteFlag = { key: "website", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function websiteOpen(ctx: QueryContext | MutationContext): Promise<boolean> {
  return websiteFlagThrough(ctx, workspaceDecision);
}

export function websiteOpenWithoutWriting(ctx: QueryContext | MutationContext): Promise<boolean> {
  return websiteFlagThrough(ctx, workspaceDecisionWithoutWriting);
}

export function websiteOpenTo(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, websiteFlag, member);
}

export async function websiteShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const shown = await memberDecision(ctx, websiteFlag, member);
  await exposed(ctx, websiteFlag, member, shown);
  if (shown) await runDueMoments(ctx, member);
  return shown;
}

export async function websiteAdmits(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const decision = await memberDecisionBeforeWriting(ctx, websiteFlag, member);
  if (!decision.value) return false;
  await decision.keep();
  return websiteShownTo(ctx, member);
}

export async function workspaceLaunchDueIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  return (await unlocksLaunchDueIn(ctx, workspace)) || (await bookLaunchDueIn(ctx, workspace));
}

export async function noLaunchWaitsFor(ctx: QueryContext, { workspace }: { workspace: string }): Promise<boolean> {
  return !(await workspaceLaunchDueIn(ctx, workspace));
}

async function runDueMoments(ctx: MutationContext, member: MemberId): Promise<void> {
  if (await launchDueFor(ctx, member)) return;
  await unlocksPreviewedBy(ctx, member);
  await readyFromTheStartOnTheWebsite(ctx, member);
}

export async function readyFromTheStartOnceVerified(ctx: MutationContext, member: MemberId): Promise<void> {
  if (!(await launchDueFor(ctx, member))) await readyFromTheStartOnTheWebsite(ctx, member);
}

async function launchDueFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  return workspaceLaunchDueIn(ctx, (await chatUserOf(ctx, member)).workspace);
}

function websiteFlagThrough(ctx: QueryContext | MutationContext, read: typeof workspaceDecisionWithoutWriting): Promise<boolean> {
  const workspace = signInWorkspace();
  if (workspace === undefined) return Promise.resolve(false);
  return read(ctx, websiteFlag, workspace);
}
