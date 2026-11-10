// The module map's skeleton of convex/leaderboard/backfill.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

type Page = { cursor: string; isDone: boolean; messages: number };

type FilledPage = { cursor: string; isDone: boolean; filled: number };

type CountedPage = { cursor: string; isDone: boolean; counted: number };

const pageArgs = { cursor: z.union([z.string(), z.null()]), pageSize: zv.number() };

export const countEarlierKudosPageArgs = z.strictObject({ cursor: z.union([z.string(), z.null()]), pageSize: zv.number() });
export async function countEarlierKudosPage(ctx: MutationContext, args: z.infer<typeof countEarlierKudosPageArgs>): Promise<Page> {
  throw notPorted("leaderboard.backfill.countEarlierKudosPage");
}

export const fillRunningTotalsPageArgs = z.strictObject({ cursor: z.union([z.string(), z.null()]), pageSize: zv.number() });
export async function fillRunningTotalsPage(ctx: MutationContext, args: z.infer<typeof fillRunningTotalsPageArgs>): Promise<FilledPage> {
  throw notPorted("leaderboard.backfill.fillRunningTotalsPage");
}

export const countEarlierKudosReceivedPageArgs = z.strictObject(pageArgs);
export async function countEarlierKudosReceivedPage(ctx: MutationContext, args: z.infer<typeof countEarlierKudosReceivedPageArgs>): Promise<CountedPage> {
  throw notPorted("leaderboard.backfill.countEarlierKudosReceivedPage");
}

export const countEarlierHugsGivenPageArgs = z.strictObject(pageArgs);
export async function countEarlierHugsGivenPage(ctx: MutationContext, args: z.infer<typeof countEarlierHugsGivenPageArgs>): Promise<CountedPage> {
  throw notPorted("leaderboard.backfill.countEarlierHugsGivenPage");
}

export const countEarlierHugsReceivedPageArgs = z.strictObject(pageArgs);
export async function countEarlierHugsReceivedPage(ctx: MutationContext, args: z.infer<typeof countEarlierHugsReceivedPageArgs>): Promise<CountedPage> {
  throw notPorted("leaderboard.backfill.countEarlierHugsReceivedPage");
}
