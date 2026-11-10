// A new member's onboarding on the website: the emoji how-to, the getting-started steps off the Monday path, and the
// how-it-works card until they give their first kudos or close it. Today's convex/website/onboarding.ts; closeHowItWorks
// is a plain handler the website platform's route table runs after the member check.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { albumShownTo } from "../album/flag.ts";
import { hasGivenAThoughtfulAward } from "../album/boards.ts";
import { reportHowItWorksClosed } from "../analytics/isolatedUsage.ts";
import { hasGivenAnAward } from "../engine/awards.ts";
import { hasHuggedBefore } from "../hugs/records.ts";
import { newestTurnOf } from "../album/items/ledger.ts";
import { onboardingShownTo } from "../album/items/onboardingFlag.ts";
import { onTheMondayPath } from "../quests/flag.ts";
import { loopLessonIn, type LoopLesson } from "../album/items/welcome.ts";
import { workspaceLink } from "../slack/workspaceLink.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { howItWorksCloses } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { HomeMember } from "../feedback/homes.ts";
import type { VerifiedMember } from "./memberQuery.ts";

export type HowItWorksCard = { slack: string; toLevelTwo: boolean; kudos: LoopLesson };

export type GettingStartedSteps = { hugged: boolean; thoughtful: boolean; turned: boolean; levelTwo: boolean };

export type GettingStarted = { steps: GettingStartedSteps; kudos: LoopLesson };

export type Onboarding = { emojiHowTo?: LoopLesson; gettingStarted?: GettingStarted; howItWorks?: HowItWorksCard };

export type HowItWorksCloseAnswer = { kind: "closed" } | { kind: "refused" };

const levelTwo = 2;

export async function onboardingOf(ctx: QueryContext, me: VerifiedMember, { level }: { level: number }): Promise<Onboarding> {
  if (!(await onboardingShownTo(ctx, me.member))) return {};
  const kudos = await loopLessonIn(ctx, me.workspace);
  return { emojiHowTo: kudos, ...(await gettingStartedFor(ctx, me, { level, kudos })), ...(await howItWorksFor(ctx, me, { level, kudos })) };
}

async function gettingStartedFor(ctx: QueryContext, me: VerifiedMember, { level, kudos }: { level: number; kudos: LoopLesson }): Promise<Pick<Onboarding, "gettingStarted">> {
  if (await onTheMondayPath(ctx, me.member)) return {};
  return { gettingStarted: { steps: await stepsDoneBy(ctx, me, level), kudos } };
}

async function stepsDoneBy(ctx: QueryContext, me: VerifiedMember, level: number): Promise<GettingStartedSteps> {
  return {
    hugged: await hasHuggedBefore(ctx, me.member),
    thoughtful: await hasGivenAThoughtfulAward(ctx, me.workspace, me.member),
    turned: (await newestTurnOf(ctx, me.member)) !== null,
    levelTwo: level >= levelTwo,
  };
}

async function howItWorksFor(ctx: QueryContext, me: VerifiedMember, { level, kudos }: { level: number; kudos: LoopLesson }): Promise<Pick<Onboarding, "howItWorks">> {
  if ((await hasGivenAnAward(ctx, me.member)) || (await closeOf(ctx, me.member)) !== null) return {};
  return { howItWorks: { slack: workspaceLink(me.workspace), toLevelTwo: level < levelTwo, kudos } };
}

export const closeHowItWorksArgs = { triedSlack: z.boolean() };

export async function closeHowItWorks(ctx: MutationContext, me: VerifiedMember, _person: HomeMember, { triedSlack }: { triedSlack: boolean }): Promise<HowItWorksCloseAnswer> {
  if (!(await albumShownTo(ctx, me.member)) || !(await onboardingShownTo(ctx, me.member))) return { kind: "refused" };
  if ((await closeOf(ctx, me.member)) === null) await storeTheClose(ctx, me, triedSlack);
  return { kind: "closed" };
}

async function storeTheClose(ctx: MutationContext, me: VerifiedMember, triedSlack: boolean) {
  const at = ctx.now;
  await ctx.tx.insert(howItWorksCloses).values({ ...ctx.newRow(), member: me.member, triedSlack, at } as typeof howItWorksCloses.$inferInsert);
  await reportHowItWorksClosed(ctx, { workspace: me.workspace, member: me.member, triedSlack, at });
}

const byMember = indexOrder(howItWorksCloses, ["member"]);

async function closeOf(ctx: QueryContext, member: MemberId) {
  const rows = await ctx.tx.select().from(howItWorksCloses).where(and(eq(howItWorksCloses.member, member))).orderBy(...byMember.orderBy()).limit(2);
  return unique("howItWorksCloses", rows);
}
