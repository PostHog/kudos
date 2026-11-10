// The unlocks' launch: the flag that turns unlocks on, a workspace's one launch that opens what already shipped, and a
// member's one preview. Today's convex/unlocks/launch.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import { achievementsLiveIn } from "../achievements/flag.ts";
import { exposed, memberDecision, workspaceDecision, type Flag } from "../analytics/flags.ts";
import type { UnlocksLaunchedEvent } from "../bus/events.ts";
import { fromDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { members, previewMoments, unlockLaunches } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import { xpLevelsOnFor, xpLevelsShownIn, xpLevelsShownTo } from "../progression/xpLevels.ts";
import { chatUserOf, lookup, type MemberId } from "../workspace/directory.ts";
import { previewMomentOf } from "./previewMoments.ts";
import { shippedIn, shippedTo } from "./schedule.ts";
import { keepOpen, makeReadyFromTheStart } from "./unlocks.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export const unlocksFlag = { key: "unlocks", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type UnlocksFor = "off" | "live" | "previewStarted";

export async function unlocksShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  if (!(await xpLevelsShownTo(ctx, member))) return false;
  const shown = (await unlocksLiveFor(ctx, member)) !== "off";
  await exposed(ctx, unlocksFlag, member, shown);
  return shown;
}

export const exposeUnlocksArgs = z.strictObject({ workspace: z.string(), user: z.string(), shown: z.boolean() });
export async function exposeUnlocks(ctx: MutationContext, { workspace, user }: z.infer<typeof exposeUnlocksArgs>): Promise<void> {
  const person = await lookup(ctx, workspace, user);
  if (person?.kind !== "member" || !(await xpLevelsShownTo(ctx, person.member))) return;
  await exposed(ctx, unlocksFlag, person.member, await memberDecision(ctx, unlocksFlag, person.member));
}
export const exposeUnlocksJob = mutationJob("unlocks.launch.exposeUnlocks", exposeUnlocksArgs, exposeUnlocks);

export async function unlocksLiveFor(ctx: MutationContext, member: MemberId): Promise<UnlocksFor> {
  const { workspace } = await chatUserOf(ctx, member);
  await unlocksLiveIn(ctx, workspace);
  const live = await unlocksOpenedFor(ctx, workspace, member);
  if (live !== "off") await makeReadyFromTheStart(ctx, workspace, member);
  return live;
}

export async function unlocksOpenedFor(ctx: MutationContext, workspace: string, member: MemberId): Promise<UnlocksFor> {
  if (!(await unlocksOnFor(ctx, member))) return "off";
  if ((await launchIn(ctx, workspace)) !== null || !(await previewOnce(ctx, workspace, member))) return "live";
  return "previewStarted";
}

export async function unlocksLiveIn(ctx: MutationContext, workspace: string): Promise<boolean> {
  if (!(await unlocksOnIn(ctx, workspace))) return false;
  if ((await launchIn(ctx, workspace)) === null) await launch(ctx, workspace);
  await achievementsLiveIn(ctx, workspace);
  return true;
}

export async function unlocksPreviewedBy(ctx: MutationContext, member: MemberId): Promise<void> {
  const { workspace } = await chatUserOf(ctx, member);
  if (!(await unlocksOnIn(ctx, workspace))) await unlocksOpenedFor(ctx, workspace, member);
}

export async function readyFromTheStartOnTheWebsite(ctx: MutationContext, member: MemberId): Promise<void> {
  if (!(await unlockPathShownTo(ctx, member))) return;
  const { workspace } = await chatUserOf(ctx, member);
  await makeReadyFromTheStart(ctx, workspace, member);
}

export async function unlockPathShownIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  return (await xpLevelsShownIn(ctx, workspace)) && (await unlocksAppliedIn(ctx, workspace));
}

export async function unlockPathShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await xpLevelsOnFor(ctx, member)) && (await unlocksAppliedTo(ctx, member));
}

export async function unlocksAppliedIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  return (await launchIn(ctx, workspace)) !== null && (await workspaceDecision(ctx, unlocksFlag, workspace));
}

export async function unlocksAppliedTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  if (!(await memberDecision(ctx, unlocksFlag, member))) return false;
  const { workspace } = await chatUserOf(ctx, member);
  return (await launchIn(ctx, workspace)) !== null || (await previewMomentOf(ctx, member, "unlocks")) !== null;
}

export async function unlocksLaunchDueIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  return (await unlocksOnIn(ctx, workspace)) && (await launchIn(ctx, workspace)) === null;
}

async function unlocksOnIn(ctx: QueryContext, workspace: string) {
  return (await xpLevelsShownIn(ctx, workspace)) && (await workspaceDecision(ctx, unlocksFlag, workspace));
}

async function unlocksOnFor(ctx: MutationContext, member: MemberId) {
  return (await xpLevelsOnFor(ctx, member)) && (await memberDecision(ctx, unlocksFlag, member));
}

const membersByUser = indexOrder(members, ["workspace", "user"]);

async function launch(ctx: MutationContext, workspace: string) {
  const at = ctx.now;
  const shipped = await shippedIn(ctx, workspace);
  await ctx.tx.insert(unlockLaunches).values(fromDocument(unlockLaunches, { ...ctx.newRow(), workspace, at, shipped: shipped.map(({ feature }) => feature) }) as typeof unlockLaunches.$inferInsert);
  const existing = await ctx.tx.select({ _id: members._id, kind: members.kind }).from(members).where(eq(members.workspace, workspace)).orderBy(...membersByUser.orderBy());
  const openings: UnlocksLaunchedEvent["openings"] = [];
  for (const { _id: member, kind } of existing) {
    if (kind !== "member") continue;
    for (const { feature } of shipped) {
      if (await keepOpen(ctx, { workspace, member, at, byLaunch: true }, feature)) openings.push({ member, feature });
    }
  }
  for (const page of pagesOf(openings)) await ctx.publish(launched(workspace, page, at));
}

function launched(workspace: string, openings: UnlocksLaunchedEvent["openings"], at: number): UnlocksLaunchedEvent {
  return { type: "unlocksLaunched", workspace, openings, at };
}

const openingsPerEvent = 1000;

function pagesOf(openings: UnlocksLaunchedEvent["openings"]) {
  return Array.from({ length: Math.ceil(openings.length / openingsPerEvent) }, (_, page) => openings.slice(page * openingsPerEvent, (page + 1) * openingsPerEvent));
}

async function previewOnce(ctx: MutationContext, workspace: string, member: MemberId) {
  if ((await previewMomentOf(ctx, member, "unlocks")) !== null) return false;
  const at = ctx.now;
  await ctx.tx.insert(previewMoments).values({ ...ctx.newRow(), member, moment: "unlocks", at });
  const openings: UnlocksLaunchedEvent["openings"] = [];
  for (const { feature } of await shippedTo(ctx, member)) {
    if (await keepOpen(ctx, { workspace, member, at, byLaunch: true }, feature)) openings.push({ member, feature });
  }
  if (openings.length > 0) await ctx.publish(launched(workspace, openings, at));
  return true;
}

const launchesByWorkspace = indexOrder(unlockLaunches, ["workspace"]);

/** The workspace's one launch, or `null`; two fail, as `.unique()` did. */
async function launchIn(ctx: QueryContext, workspace: string) {
  return unique("unlockLaunches", await ctx.tx.select({ _id: unlockLaunches._id }).from(unlockLaunches).where(and(eq(unlockLaunches.workspace, workspace))).orderBy(...launchesByWorkspace.orderBy()).limit(2));
}
