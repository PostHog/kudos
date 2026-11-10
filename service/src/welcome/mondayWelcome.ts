// The module map's skeleton of convex/welcome/mondayWelcome.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { messageRefValidator, type ChatUserId } from "../engine/messageEvent.ts";
import type { WaitingCount } from "../album/items/ledger.ts";
import type { DmLinks } from "../feedback/dmLinks.ts";
import type { OnboardingQuest, OnboardingStep } from "../quests/onboarding.ts";
import type { TwoQuestsRow } from "../quests/twoQuests.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const mondayWelcomeCauseValidator = z.union([
  z.strictObject({ path: z.literal("hug"), hugged: messageRefValidator }),
  z.strictObject({ path: z.literal("thoughtful-given"), kudos: z.optional(messageRefValidator) }),
  z.strictObject({ path: z.literal("thoughtful-received"), giver: zv.id("members"), kudos: messageRefValidator }),]
);

export type MondayWelcomeCause = z.infer<typeof mondayWelcomeCauseValidator>;

export const onboardingStepValidator = z.union([z.literal("first-thanks"), z.literal("someone-new"), z.literal("two-days")]);

export const onboardingJourneyValidator = z.array(
  z.strictObject({ step: onboardingStepValidator, goal: z.string(), finished: z.boolean(), progress: z.union([z.strictObject({ done: zv.number(), of: zv.number(), unit: z.union([z.literal("kudos"), z.literal("days"), z.literal("people")]) }), z.null()]) }),
);

export type HuggedPeople = { kind: "author"; name?: string } | { kind: "peopleThanked" };

export type MondayWelcomeOpening =
  | { path: "hug"; emoji: string; hugged: HuggedPeople }
  | { path: "thoughtful-given"; recipients: ChatUserId[] }
  | { path: "thoughtful-received"; giver: ChatUserId; quote: string | null };

export type MondayWelcome = {
  kudosEmoji: string;
  opening: MondayWelcomeOpening;
  journey: OnboardingQuest[];
  next: OnboardingStep | null;
  marked: OnboardingStep | null;
  hugLadder: TwoQuestsRow | null;
  waiting: WaitingCount;
  links: DmLinks | null;
};

export const mondayWelcomeOfArgs = z.strictObject({ workspace: z.string(), member: zv.id("members"), cause: mondayWelcomeCauseValidator, journey: onboardingJourneyValidator, owesTheWelcomeItem: z.optional(z.boolean()) });
export async function mondayWelcomeOf(ctx: QueryContext, args: z.infer<typeof mondayWelcomeOfArgs>): Promise<MondayWelcome> {
  throw notPorted("welcome.mondayWelcome.mondayWelcomeOf");
}

export const howToOfArgs = z.strictObject({ workspace: z.string() });
export async function howToOf(ctx: QueryContext, args: z.infer<typeof howToOfArgs>): Promise<{ kudosEmoji: string }> {
  throw notPorted("welcome.mondayWelcome.howToOf");
}
