// XP and levels: what a kudos pays each member it names, what a reward pays, and each member's standing.
// Today's convex/progression/progression.ts over the service's transaction.
import { eq } from "drizzle-orm";
import { kudosGivenEventValidator, membersNamedIn, type KudosGivenEvent, type XpRecordedEvent } from "../bus/events.ts";
import type { MemberId } from "../workspace/directory.ts";
import { awardsOfMessage } from "../engine/awards.ts";
import type { DayKey } from "../engine/allowance.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { catalogue } from "./catalogue.ts";
import type { Award, AwardWithId } from "../engine/awards.ts";
import { awardsBefore, insertEffects, isRecorded } from "./effects.ts";
import { firstThanksTopUpFor } from "./firstThanks.ts";
import { baseXpOf, bonusPaidIn, coinsIn, effectsFor, noGiving, progress, rewarded, sideOf, standing, xpToNextLevel, type BonusLine, type Giving, type MemberProgress, type Progressed, type Standing } from "./progress.ts";
import { receivingOf, receivingWeekOf, recordReceiving } from "./receiving.ts";
import { insertReward, rewardOf, type AppliedReward, type RewardRecord, type StandingWithCoins } from "./rewards.ts";
import { perksPayingIn } from "./skillTree.ts";
import { balanceOf, credit, wholeCoins } from "../wallet/wallet.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { unique } from "../db/unique.ts";
import { memberProgress } from "../db/schema/index.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

const membersAPage = 100;

export const recordEffectsArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });
export async function recordEffects(ctx: MutationContext, { event, from = 0 }: z.infer<typeof recordEffectsArgs>): Promise<void> {
  const members = membersNamedIn(event);
  const next = from + membersAPage;
  for (const member of members.slice(from, next)) await recordEffectsOf(ctx, event, member);
  if (next < members.length) await ctx.jobs.enqueue(recordEffectsJob, { event, from: next });
}
export const recordEffectsJob = mutationJob("progression.progression.recordEffects", recordEffectsArgs, recordEffects);

async function recordEffectsOf(ctx: MutationContext, event: KudosGivenEvent, member: MemberId) {
  const awards = await unrecordedAwardsOf(ctx, member, event.awards);
  if (awards.length === 0) return;
  const receivingWeek = await receivingWeekOf(ctx, event, member);
  const { state, effects, events } = progress(await progressOf(ctx, member), { ...event, awards }, catalogue, await givingOf(ctx, event, member), receivingOf(receivingWeek));
  await record(ctx, { state, effects });
  await recordReceiving(ctx, receivingWeek, event.giver, effects);
  await ctx.publish(xpRecorded(event.workspace, member, event.at));
  for (const levelReached of events) await ctx.publish(levelReached);
  if (member === event.giver) await topUpTheFirstThanks(ctx, event, awards, state.xp);
}

async function topUpTheFirstThanks(ctx: MutationContext, event: KudosGivenEvent, recorded: AwardWithId[], xpAfter: number) {
  const topUp = await firstThanksTopUpFor(ctx, event, recorded, xpAfter);
  if (topUp !== null) await recordReward(ctx, event.workspace, topUp);
}

type GivenBy = { workspace: string; giver: MemberId; day: DayKey; awards: AwardWithId[] };

async function givingOf(ctx: QueryContext, { workspace, giver, day, awards }: GivenBy, member: MemberId): Promise<Giving> {
  if (member !== giver || awards.length === 0) return noGiving;
  return { perks: await perksPayingIn(ctx, workspace, giver), earlier: await awardsBefore(ctx, giver, day, awards[0]!.award) };
}

export type GiverLines = { bonus: BonusLine[]; coins: number };

export async function giverLinesOf(ctx: QueryContext, giver: MemberId, message: MessageRef): Promise<GiverLines> {
  const awards = await awardsOfMessage(ctx, message);
  const day = awards[0]?.day;
  if (day === undefined) return { bonus: [], coins: 0 };
  const giving = await givingOf(ctx, { workspace: message.workspace, giver, day, awards }, giver);
  const effects = effectsFor(giver, awards, { day, gate: null }, catalogue, giving);
  return { bonus: bonusPaidIn(effects), coins: coinsIn(effects) };
}

export function giverXpOf(awards: Pick<Award, "kudos">[]): number {
  return awards.reduce((sum, award) => sum + baseXpOf("giver", award, catalogue), 0);
}

export async function recordReward(ctx: MutationContext, workspace: string, reward: RewardRecord): Promise<"recorded" | "already recorded"> {
  if ((await rewardOf(ctx, reward.member, reward.key)) !== null) return "already recorded";
  wholeCoins(reward.coins);
  await insertReward(ctx, reward);
  if (reward.held !== true) await applyReward(ctx, workspace, reward, reward.at);
  return "recorded";
}

export type Gain = Pick<RewardRecord, "member" | "xp" | "coins">;

export async function applyGain(ctx: MutationContext, workspace: string, gain: Gain, at: number): Promise<AppliedReward> {
  const from = await standingWithCoinsOf(ctx, gain.member);
  await applyReward(ctx, workspace, gain, at);
  return { xp: gain.xp, coins: gain.coins, from, to: await standingWithCoinsOf(ctx, gain.member) };
}

async function applyReward(ctx: MutationContext, workspace: string, { member, xp, coins }: Gain, at: number) {
  await credit(ctx, member, coins);
  const { state, events } = rewarded(await progressOf(ctx, member), { xp }, { workspace, at });
  await saveProgress(ctx, state);
  await ctx.publish(xpRecorded(workspace, member, at));
  for (const levelReached of events) await ctx.publish(levelReached);
}

function xpRecorded(workspace: string, member: MemberId, at: number): XpRecordedEvent {
  return { type: "xpRecorded", workspace, member, at };
}

async function standingWithCoinsOf(ctx: QueryContext, member: MemberId): Promise<StandingWithCoins> {
  const { xp, level, skillPoints } = await standingOf(ctx, member);
  return { xp, level, coins: await balanceOf(ctx, member), skillPoints };
}

export async function unrecordedAwardsOf<A extends AwardWithId>(ctx: QueryContext, member: MemberId, awards: A[]): Promise<A[]> {
  const unrecorded: A[] = [];
  for (const award of awards) {
    const side = sideOf(member, award);
    if (side !== null && !(await isRecorded(ctx, award.award, side))) unrecorded.push(award);
  }
  return unrecorded;
}

export async function record(ctx: MutationContext, { state, effects }: Pick<Progressed, "state" | "effects">): Promise<void> {
  await insertEffects(ctx, effects);
  await credit(ctx, state.member, coinsIn(effects));
  await saveProgress(ctx, state);
}

export async function standingOf(ctx: QueryContext, member: MemberId): Promise<Standing> {
  return standing(await progressOf(ctx, member));
}

export type ProgressionHome = Standing & { xpToNextLevel: number };

export async function progressionHomeOf(ctx: QueryContext, member: MemberId): Promise<ProgressionHome> {
  const memberStanding = await standingOf(ctx, member);
  return { ...memberStanding, xpToNextLevel: xpToNextLevel(memberStanding) };
}

export async function spendSkillPoints(ctx: MutationContext, member: MemberId, points: number): Promise<void> {
  const state = await progressOf(ctx, member);
  await saveProgress(ctx, { ...state, pointsSpent: state.pointsSpent + points });
}

export async function progressOf(ctx: QueryContext, member: MemberId): Promise<MemberProgress> {
  const row = await progressRow(ctx, member);
  return { member, xp: row?.xp ?? 0, pointsSpent: row?.pointsSpent ?? 0 };
}

async function saveProgress(ctx: MutationContext, { member, xp, pointsSpent }: MemberProgress) {
  const row = await progressRow(ctx, member);
  if (row === null) await ctx.tx.insert(memberProgress).values({ ...ctx.newRow(), member, xp, pointsSpent });
  else await ctx.tx.update(memberProgress).set({ xp, pointsSpent }).where(eq(memberProgress._id, row._id));
}

const byMember = indexOrder(memberProgress, ["member"]);

/** The member's one progress row, or `null`; two fail, as `.unique()` did. */
async function progressRow(ctx: QueryContext, member: MemberId) {
  return unique(
    "memberProgress",
    await ctx.tx
      .select({ _id: memberProgress._id, xp: memberProgress.xp, pointsSpent: memberProgress.pointsSpent })
      .from(memberProgress)
      .where(eq(memberProgress.member, member))
      .orderBy(...byMember.orderBy())
      .limit(2),
  );
}
