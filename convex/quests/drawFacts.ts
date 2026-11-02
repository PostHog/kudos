import type { QueryCtx } from "../_generated/server";
import { allowanceDay, allowanceLeft } from "../engine/allowance";
import { lastThankedSince } from "../engine/awards";
import { hugsLeftOf } from "../hugs/hugs";
import { chatUserOf, teammatesOf, type MemberId } from "../workspace/directory";
import { hugBudgetOf, settingsOf } from "../workspace/settings";
import type { DrawFacts, HugDrawFacts, Recipient } from "./pool";
import { isRecipient, notThankedForMs } from "./progress";
import { daysLeftInWeek } from "./week";

export async function drawFactsOf(ctx: QueryCtx, member: MemberId, at: number): Promise<DrawFacts> {
  const facts = await factsWithTheDayUnspent(ctx, member, at, await lastThankedAsOf(ctx, member, at, at));
  const kudosLeftToday = await allowanceLeft(ctx, member, allowanceDay(at, await timeZoneOf(ctx, member)), facts.dailyAllowance);
  return { ...facts, kudosLeftToday };
}

export async function factsAtTheStartOf(ctx: QueryCtx, member: MemberId, weekStart: number): Promise<DrawFacts> {
  return factsWithTheDayUnspent(ctx, member, weekStart, await lastThankedAsOf(ctx, member, weekStart, weekStart - 1));
}

export async function hugDrawFactsOf(ctx: QueryCtx, member: MemberId, at: number): Promise<HugDrawFacts> {
  const timeZone = await timeZoneOf(ctx, member);
  const { workspace } = await chatUserOf(ctx, member);
  return { daysLeft: daysLeftInWeek(at, timeZone), hugsLeftToday: await hugsLeftOf(ctx, member, workspace, allowanceDay(at, timeZone)), hugBudget: await hugBudgetOf(ctx, workspace) };
}

export async function hugFactsAtTheStartOf(ctx: QueryCtx, member: MemberId, weekStart: number): Promise<HugDrawFacts> {
  const { workspace } = await chatUserOf(ctx, member);
  const hugBudget = await hugBudgetOf(ctx, workspace);
  return { daysLeft: daysLeftInWeek(weekStart, await timeZoneOf(ctx, member)), hugsLeftToday: hugBudget, hugBudget };
}

export async function timeZoneOf(ctx: QueryCtx, member: MemberId) {
  return (await ctx.db.get(member))?.timeZone;
}

type LastThanked = Map<MemberId, number>;

function lastThankedAsOf(ctx: QueryCtx, member: MemberId, at: number, atOrBefore: number): Promise<LastThanked> {
  return lastThankedSince(ctx, member, at - notThankedForMs, atOrBefore);
}

async function factsWithTheDayUnspent(ctx: QueryCtx, member: MemberId, at: number, lastThanked: LastThanked): Promise<DrawFacts> {
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
