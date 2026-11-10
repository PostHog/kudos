// The module map's skeleton of convex/website/activityWeek.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Message } from "../activity/entries.ts";
import { type LoopLesson } from "../album/items/welcome.ts";
import { type DayKey } from "../engine/allowance.ts";
import { type AlbumPersonFace } from "./albumPages.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type NextStep = { kind: "thanked"; giver: AlbumPersonFace; words: Message; permalink: string; at: number } | { kind: "empty" } | { kind: "quiet"; firstHugPaysExtra: boolean };

export type Thanks = { from: AlbumPersonFace; at: number } & ThanksFacts;

export type LastWeek = { week: DayKey; hugsGiven: number; kudosGiven: number; hugsReceived: number };

export type ActivityWeek = { kind: "week"; next: NextStep; thanked: Thanks[]; lastWeek: LastWeek | null; kudos: LoopLesson; slack: string };

export const kudosReadForAHugBack = 20;

export const thanksListed = 30;

export type HugBack = Extract<NextStep, { kind: "thanked" }>;

type ThanksFacts = { way: "hugged-your-message"; permalink: string | null } | { way: "hugged-your-kudos-back" | "hugged-a-kudos-you-got" | "gave-you-a-kudos"; words: Message | null };

export async function activityWeekOf(ctx: QueryContext, me: VerifiedMember, now: number): Promise<ActivityWeek> {
  throw notPorted("website.activityWeek.activityWeekOf");
}

export async function hugBackThisWeekOf(ctx: QueryContext, me: VerifiedMember, now: number): Promise<HugBack | null> {
  throw notPorted("website.activityWeek.hugBackThisWeekOf");
}
