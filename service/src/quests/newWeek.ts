// The hourly sweep: pages through every member, starts the quests of the welcomed on the Monday path, and schedules a
// draw for each member whose week, or a side of it, awaits one. Today's convex/quests/newWeek.ts over the service's
// operations. The members are paged in creation order, as Convex's `paginate` without an index read them, and each page
// schedules the next with its cursor.
import type { Doc } from "../db/schema/index.ts";
import { members } from "../db/schema/index.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { paginate } from "../db/page.ts";
import { isWelcomed } from "../welcome/welcome.ts";
import type { MemberId } from "../workspace/directory.ts";
import { mondayPathShownTo, onTheMondayPath } from "./flag.ts";
import { questStartOf, startQuests } from "./start.ts";
import { awaitsASideDraw } from "./sides.ts";
import { awaitsThisWeeksDraw, drawNewWeekJob } from "./weekly.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

const membersPerSweep = 100;

const inCreationOrder = indexOrder(members, []);

export const sweepArgs = z.strictObject({ cursor: z.optional(z.string()) });
export async function sweep(ctx: MutationContext, { cursor }: z.infer<typeof sweepArgs>): Promise<void> {
  const now = ctx.now;
  const page = await paginate<Doc<"members">>(ctx.tx, { table: members, order: inCreationOrder }, { numItems: membersPerSweep, cursor: cursor ?? null });
  for (const member of page.page) {
    if (member.kind !== "member") continue;
    await startQuestsOfTheWelcomed(ctx, member._id, now);
    if (await isDueANewWeek(ctx, member, now)) await ctx.jobs.enqueue(drawNewWeekJob, { member: member._id });
  }
  if (!page.isDone) await ctx.jobs.enqueue(sweepJob, { cursor: page.continueCursor });
}
export const sweepJob = mutationJob("quests.newWeek.sweep", sweepArgs, sweep);

async function isDueANewWeek(ctx: MutationContext, member: Doc<"members">, at: number): Promise<boolean> {
  return ((await awaitsThisWeeksDraw(ctx, member, at)) || (await awaitsASideDraw(ctx, member._id, at))) && (await onTheMondayPath(ctx, member._id));
}

async function startQuestsOfTheWelcomed(ctx: MutationContext, member: MemberId, at: number): Promise<void> {
  if ((await questStartOf(ctx, member)) !== null || !(await isWelcomed(ctx, member))) return;
  if (await mondayPathShownTo(ctx, member)) await startQuests(ctx, member, at);
}
