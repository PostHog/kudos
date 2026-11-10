// The module map's skeleton of convex/activity/activity.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import type { Activity, ActivityEntry, Found, RecentKudos } from "./entries.ts";
import { type Position } from "./position.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Filter = "all" | "received" | "given";

export type Direction = Exclude<Filter, "all">;

export const recipientsPerPage = 700;

export const mostReadSince = 50;

export type EntrySince = Exclude<ActivityEntry, Found>;

export type ReadSince = { decided: number; entry: EntrySince; xp: number; recorded: boolean; settled: boolean };

export type Since = { above?: number; upTo?: number; questsAwaitedAbove?: number; talliesAwaitedAbove?: number };

export async function activitySince(ctx: QueryContext, member: MemberId, since: Since): Promise<ReadSince[]> {
  throw notPorted("activity.activity.activitySince");
}

export async function positionsSince(ctx: QueryContext, member: MemberId, since: Since): Promise<Position[]> {
  throw notPorted("activity.activity.positionsSince");
}

export async function newestDecidedSince(ctx: QueryContext, member: MemberId, since: Since): Promise<number | null> {
  throw notPorted("activity.activity.newestDecidedSince");
}

export async function newestDecidedTakenBackOrNotSince(ctx: QueryContext, member: MemberId, since: Since): Promise<number | null> {
  throw notPorted("activity.activity.newestDecidedTakenBackOrNotSince");
}

export async function activityOf(ctx: QueryContext, member: MemberId, { filter, cursor, limit }: { filter: Filter; cursor: string | null; limit?: number }): Promise<Activity> {
  throw notPorted("activity.activity.activityOf");
}

export async function recentKudosOf(ctx: QueryContext, member: MemberId, { direction, limit }: { direction: Direction; limit?: number }): Promise<RecentKudos> {
  throw notPorted("activity.activity.recentKudosOf");
}
