// What a draw weighs: the days left in the member's week, the kudos or hugs left them, and the teammates each kind of
// quest could still thank. Today's convex/quests/drawFacts.ts over the service's transaction.
import { eq } from "drizzle-orm";
import { members } from "../db/schema/index.ts";
import { allowanceDay, allowanceLeft } from "../engine/allowance.ts";
import { lastThankedSince } from "../engine/awards.ts";
import { hugsLeftOf } from "../hugs/hugs.ts";
import { chatUserOf, teammatesOf, type MemberId } from "../workspace/directory.ts";
import { hugBudgetOf, settingsOf } from "../workspace/settings.ts";
import type { DrawFacts, HugDrawFacts, Recipient } from "./pool.ts";
import { isRecipient, notThankedForMs } from "./progress.ts";
import { daysLeftInWeek } from "./week.ts";
import type { QueryContext } from "../operations.ts";

export async function drawFactsOf(ctx: QueryContext, member: MemberId, at: number): Promise<DrawFacts> {
  const facts = await factsWithTheDayUnspent(ctx, member, at, await lastThankedAsOf(ctx, member, at, at));
  const kudosLeftToday = await allowanceLeft(ctx, member, allowanceDay(at, await timeZoneOf(ctx, member)), facts.dailyAllowance);
  return { ...facts, kudosLeftToday };
}

export async function factsAtTheStartOf(ctx: QueryContext, member: MemberId, weekStart: number): Promise<DrawFacts> {
  return factsWithTheDayUnspent(ctx, member, weekStart, await lastThankedAsOf(ctx, member, weekStart, weekStart - 1));
}

export async function hugDrawFactsOf(ctx: QueryContext, member: MemberId, at: number): Promise<HugDrawFacts> {
  const timeZone = await timeZoneOf(ctx, member);
  const { workspace } = await chatUserOf(ctx, member);
  return { daysLeft: daysLeftInWeek(at, timeZone), hugsLeftToday: await hugsLeftOf(ctx, member, workspace, allowanceDay(at, timeZone)), hugBudget: await hugBudgetOf(ctx, workspace) };
}

export async function hugFactsAtTheStartOf(ctx: QueryContext, member: MemberId, weekStart: number): Promise<HugDrawFacts> {
  const { workspace } = await chatUserOf(ctx, member);
  const hugBudget = await hugBudgetOf(ctx, workspace);
  return { daysLeft: daysLeftInWeek(weekStart, await timeZoneOf(ctx, member)), hugsLeftToday: hugBudget, hugBudget };
}

/** The member's time zone, or `undefined` when they have none or there is no such member, as `db.get` read it. */
export async function timeZoneOf(ctx: QueryContext, member: MemberId): Promise<undefined | string> {
  const [row] = await ctx.tx.select({ timeZone: members.timeZone }).from(members).where(eq(members._id, member));
  return row?.timeZone ?? undefined;
}

type LastThanked = Map<MemberId, number>;

function lastThankedAsOf(ctx: QueryContext, member: MemberId, at: number, atOrBefore: number): Promise<LastThanked> {
  return lastThankedSince(ctx, member, at - notThankedForMs, atOrBefore);
}

async function factsWithTheDayUnspent(ctx: QueryContext, member: MemberId, at: number, lastThanked: LastThanked): Promise<DrawFacts> {
  const { workspace } = await chatUserOf(ctx, member);
  const { baseAllowance } = await settingsOf(ctx, workspace);
  const teammates = await teammatesOf(ctx, workspace, member);
  const left = (to: Recipient) => teammates.filter((teammate) => isRecipient(to, lastThanked.get(teammate) ?? null, at)).length;
  return {
    daysLeft: daysLeftInWeek(at, await timeZoneOf(ctx, member)),
    kudosLeftToday: baseAllowance,
    dailyAllowance: baseAllowance,
    peopleLeft: { anyone: left("anyone"), "someone-new": left("someone-new"), "someone-not-thanked-in-30-days": left("someone-not-thanked-in-30-days") },
  };
}
