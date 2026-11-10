// The module map's skeleton of convex/website/onboarding.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type LoopLesson } from "../album/items/welcome.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type HowItWorksCard = { slack: string; toLevelTwo: boolean; kudos: LoopLesson };

export type GettingStartedSteps = { hugged: boolean; thoughtful: boolean; turned: boolean; levelTwo: boolean };

export type GettingStarted = { steps: GettingStartedSteps; kudos: LoopLesson };

export type Onboarding = { emojiHowTo?: LoopLesson; gettingStarted?: GettingStarted; howItWorks?: HowItWorksCard };

export type HowItWorksCloseAnswer = { kind: "closed" } | { kind: "refused" };

export async function onboardingOf(ctx: QueryContext, me: VerifiedMember, { level }: { level: number }): Promise<Onboarding> {
  throw notPorted("website.onboarding.onboardingOf");
}
