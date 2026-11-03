import { v, type Infer } from "convex/values";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { awardsOfMessage } from "../engine/awards";
import { messageRefValidator, type ChatUserId, type MessageRef } from "../engine/messageEvent";
import { publicQuoteOf } from "../feedback/welcomeNudge";
import { hugOf } from "../hugs/records";
import type { WaitingCount } from "../album/items/ledger";
import { shownWaitingHoggiesAtTheWelcomeOf } from "../album/items/welcome";
import { dmLinksFor, type DmLinks } from "../feedback/dmLinks";
import { twoQuestsOn } from "../quests/flag";
import { nextQuestOf } from "../quests/next";
import { isOnboardingStep, type OnboardingQuest, type OnboardingStep } from "../quests/onboarding";
import { hugLadderRowOf, type TwoQuestsRow } from "../quests/twoQuests";
import { chatUserOf, profileNameOf, type MemberId } from "../workspace/directory";
import { settingsOf } from "../workspace/settings";

export const mondayWelcomeCauseValidator = v.union(
  v.object({ path: v.literal("hug"), hugged: messageRefValidator }),
  v.object({ path: v.literal("thoughtful-given"), kudos: v.optional(messageRefValidator) }),
  v.object({ path: v.literal("thoughtful-received"), giver: v.id("members"), kudos: messageRefValidator }),
);

export type MondayWelcomeCause = Infer<typeof mondayWelcomeCauseValidator>;

export const onboardingStepValidator = v.union(v.literal("first-thanks"), v.literal("someone-new"), v.literal("two-days"));

export const onboardingJourneyValidator = v.array(
  v.object({ step: onboardingStepValidator, goal: v.string(), finished: v.boolean(), progress: v.union(v.object({ done: v.number(), of: v.number(), unit: v.union(v.literal("kudos"), v.literal("days"), v.literal("people")) }), v.null()) }),
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

export const mondayWelcomeOf = internalQuery({
  args: { workspace: v.string(), member: v.id("members"), cause: mondayWelcomeCauseValidator, journey: onboardingJourneyValidator, owesTheWelcomeItem: v.optional(v.boolean()) },
  handler: (ctx, { workspace, member, cause, journey, owesTheWelcomeItem = false }): Promise<MondayWelcome> => mondayWelcomeFor(ctx, workspace, member, cause, journey, owesTheWelcomeItem),
});

async function mondayWelcomeFor(ctx: QueryCtx, workspace: string, member: MemberId, cause: MondayWelcomeCause, journey: OnboardingQuest[], owesTheWelcomeItem: boolean): Promise<MondayWelcome> {
  const next = journey.find(({ finished }) => !finished)?.step ?? null;
  const links = await dmLinksFor(ctx, workspace, member, "welcome");
  const twoQuests = await twoQuestsOn(ctx, member);
  return {
    kudosEmoji: (await settingsOf(ctx, workspace)).kudosEmoji,
    opening: await openingOf(ctx, member, cause),
    journey,
    next,
    marked: twoQuests ? await markedOnboardingStepOf(ctx, member) : next,
    hugLadder: twoQuests ? await hugLadderRowOf(ctx, member, Date.now()) : null,
    waiting: await shownWaitingHoggiesAtTheWelcomeOf(ctx, member, links, owesTheWelcomeItem),
    links,
  };
}

async function markedOnboardingStepOf(ctx: QueryCtx, member: MemberId): Promise<OnboardingStep | null> {
  const next = await nextQuestOf(ctx, member, Date.now());
  return next?.quest.kind === "journey" && next.side === "kudos" && isOnboardingStep(next.quest.step) ? next.quest.step : null;
}

export const howToOf = internalQuery({
  args: { workspace: v.string() },
  handler: async (ctx, { workspace }) => ({ kudosEmoji: (await settingsOf(ctx, workspace)).kudosEmoji }),
});

async function openingOf(ctx: QueryCtx, member: MemberId, cause: MondayWelcomeCause): Promise<MondayWelcomeOpening> {
  switch (cause.path) {
    case "hug":
      return hugOpeningOf(ctx, member, cause.hugged);
    case "thoughtful-given":
      return { path: cause.path, recipients: cause.kudos === undefined ? [] : await recipientsOf(ctx, member, cause.kudos) };
    case "thoughtful-received":
      return { path: cause.path, giver: (await chatUserOf(ctx, cause.giver)).user, quote: await publicQuoteOf(ctx, cause.kudos) };
  }
}

async function hugOpeningOf(ctx: QueryCtx, member: MemberId, hugged: MessageRef): Promise<MondayWelcomeOpening> {
  const hug = await hugOf(ctx, hugged, member);
  const emoji = hug?.emoji ?? (await settingsOf(ctx, hugged.workspace)).kudosEmoji;
  if (hug?.author === undefined) return { path: "hug", emoji, hugged: { kind: "peopleThanked" } };
  const name = await profileNameOf(ctx, hug.author);
  return { path: "hug", emoji, hugged: { kind: "author", ...(name !== undefined && { name }) } };
}

async function recipientsOf(ctx: QueryCtx, member: MemberId, kudos: MessageRef): Promise<ChatUserId[]> {
  const recipients = new Set((await awardsOfMessage(ctx, kudos)).map(({ recipient }) => recipient).filter((recipient) => recipient !== member));
  return Promise.all([...recipients].map(async (recipient) => (await chatUserOf(ctx, recipient)).user));
}
