// The module map's skeleton of convex/hugs/weeks.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DayKey } from "../engine/allowance.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Hug } from "./records.ts";
import type { PageOptions } from "../db/page.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type HugWeek = Doc<"hugWeeks">;

export type MostHugged = NonNullable<HugWeek["mostHugged"]>;

type CountedHug = MessageRef & { giver: MemberId; day: DayKey };

export async function countHugGiven(ctx: MutationContext, hug: CountedHug): Promise<void> {
  throw notPorted("hugs.weeks.countHugGiven");
}

export type HugWeeksPage = { weeks: HugWeek[]; next: string | null };

export async function hugWeeksSince(ctx: QueryContext, since: DayKey, page: PageOptions): Promise<HugWeeksPage> {
  throw notPorted("hugs.weeks.hugWeeksSince");
}

export async function weekOfPersonAt(ctx: QueryContext, person: MemberId, at: number): Promise<DayKey> {
  throw notPorted("hugs.weeks.weekOfPersonAt");
}

export async function countHugReceived(ctx: MutationContext, hug: Hug, person: MemberId): Promise<void> {
  throw notPorted("hugs.weeks.countHugReceived");
}

export async function hugsOnTheMessage(ctx: QueryContext, message: MessageRef): Promise<number> {
  throw notPorted("hugs.weeks.hugsOnTheMessage");
}
