// The website's clock: one row the cron moves every 15 minutes. Its write wakes the live views (live.ts), so an open tab
// refetches and rolls into a new day, week or month without anyone's kudos.
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { websiteClock } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const tickArgs = z.strictObject({});
export async function tick(ctx: MutationContext, _args: z.infer<typeof tickArgs>): Promise<void> {
  const [clock] = await ctx.tx.select({ _id: websiteClock._id }).from(websiteClock).orderBy(asc(websiteClock._creationTime), asc(websiteClock._id)).limit(1);
  if (clock === undefined) await ctx.tx.insert(websiteClock).values({ ...ctx.newRow(), tick: ctx.now });
  else await ctx.tx.update(websiteClock).set({ tick: ctx.now }).where(eq(websiteClock._id, clock._id));
}
export const tickJob = mutationJob("website.clock.tick", tickArgs, tick);

export async function followTheClock(ctx: QueryContext): Promise<void> {
  throw notPorted("website.clock.followTheClock");
}
