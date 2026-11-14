// What App Home shows a member about kudos: the allowance left of the base and when it refills, the kudos emoji, and
// the kudos given and received this week and in all. Today's convex/engine/home.ts over the service's transaction; the
// operation's `now` stands in for `Date.now()`.
import { z } from "zod";
import type { QueryContext } from "../operations.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import { settingsOf } from "../workspace/settings.ts";
import { allowanceDay, allowanceLeft, nextAllowanceDayStart, weekOf } from "./allowance.ts";
import { weekTotals, type WeekTotals } from "./awards.ts";
import { lifetimeTotals, type LifetimeTotals } from "./totals.ts";

export type KudosHome = { left: number; base: number; kudosEmoji: string; refillsAt: number } & WeekTotals & LifetimeTotals;

export type HomeFacts = ({ kind: "member" } & KudosHome) | { kind: "not-a-member" };

export const homeOfArgs = z.strictObject({ workspace: z.string(), user: z.string() });
export async function homeOf(ctx: QueryContext, { workspace, user }: z.infer<typeof homeOfArgs>): Promise<HomeFacts | null> {
  return homeFacts(ctx, workspace, user);
}

export async function homeFacts(ctx: QueryContext, workspace: string, user: string): Promise<HomeFacts | null> {
  const person = await lookup(ctx, workspace, user);
  if (person === undefined) return null;
  if (person.kind !== "member") return { kind: "not-a-member" };
  return { kind: "member", ...(await kudosHomeOf(ctx, workspace, person.member, person.timeZone)) };
}

export async function kudosHomeOf(ctx: QueryContext, workspace: string, member: MemberId, timeZone: string | undefined): Promise<KudosHome> {
  const { baseAllowance, kudosEmoji } = await settingsOf(ctx, workspace);
  const today = allowanceDay(ctx.now, timeZone);
  return {
    left: await allowanceLeft(ctx, member, today, baseAllowance),
    base: baseAllowance,
    kudosEmoji,
    refillsAt: nextAllowanceDayStart(ctx.now, timeZone),
    ...(await weekTotals(ctx, member, weekOf(today))),
    ...(await lifetimeTotals(ctx, member)),
  };
}
