// The hourly sweep: launches unlocks where they turned on, and makes ready what shipped since a member reached its level,
// 25 members a job. Today's convex/unlocks/sweep.ts over the service's transaction and its keyset paging.
import { eq } from "drizzle-orm";
import { indexOrder } from "../db/indexOrder.ts";
import { paginate } from "../db/page.ts";
import { memberProgress, members, type Doc } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import { republish } from "../feedback/homes.ts";
import { notifyFeaturesShipped } from "../feedback/notify.ts";
import { levelOf } from "../progression/levels.ts";
import { xpLevelsOnFor } from "../progression/xpLevels.ts";
import type { MemberId } from "../workspace/directory.ts";
import { unlocksLiveIn, unlocksOpenedFor } from "./launch.ts";
import { readyFromTheStart, schedule, shippedTo } from "./schedule.ts";
import { reachedAt, storeReadiness, withoutReadiness } from "./unlocks.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

const membersPerSweep = 25;

const membersInCreationOrder = indexOrder(members, []);

export const sweepArgs = z.strictObject({ cursor: z.optional(z.string()) });
export async function sweep(ctx: MutationContext, { cursor }: z.infer<typeof sweepArgs>): Promise<void> {
  const launched = launchOncePerWorkspace(ctx);
  const page = await paginate<Doc<"members">>(ctx.tx, { table: members, order: membersInCreationOrder }, { numItems: membersPerSweep, cursor: cursor ?? null });
  for (const member of page.page) {
    if (member.kind !== "member") continue;
    await launched(member.workspace);
    await makeShippedReady(ctx, member);
  }
  if (!page.isDone) await ctx.jobs.enqueue(sweepJob, { cursor: page.continueCursor });
}
export const sweepJob = mutationJob("unlocks.sweep.sweep", sweepArgs, sweep);

async function makeShippedReady(ctx: MutationContext, { _id: member, workspace }: Doc<"members">) {
  const level = await levelOfStarted(ctx, member);
  if (level === null) return;
  const due = await shippedTo(ctx, member, await withoutReadiness(ctx, member, reachedAt(schedule.features, level)));
  if (due.length === 0) return;
  const previewStarted = (await unlocksOpenedFor(ctx, workspace, member)) === "previewStarted";
  const madeReady = await storeReadiness(ctx, { workspace, member, at: ctx.now }, due);
  const news = madeReady.filter((entry) => !readyFromTheStart(entry));
  if (news.length > 0) await notifyFeaturesShipped(ctx, member, news);
  if (previewStarted || (madeReady.length > 0 && (await xpLevelsOnFor(ctx, member)))) await republish(ctx, member);
}

function launchOncePerWorkspace(ctx: MutationContext) {
  const byWorkspace = new Map<string, Promise<boolean>>();
  return (workspace: string) => {
    if (!byWorkspace.has(workspace)) byWorkspace.set(workspace, unlocksLiveIn(ctx, workspace));
    return byWorkspace.get(workspace)!;
  };
}

const progressByMember = indexOrder(memberProgress, ["member"]);

/** The member's level, or `null` before their first XP; two progress rows fail, as `.unique()` did. */
async function levelOfStarted(ctx: MutationContext, member: MemberId) {
  const progress = unique("memberProgress", await ctx.tx.select({ xp: memberProgress.xp }).from(memberProgress).where(eq(memberProgress.member, member)).orderBy(...progressByMember.orderBy()).limit(2));
  return progress === null ? null : levelOf(progress.xp);
}
