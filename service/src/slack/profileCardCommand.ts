// `/hedgehug @someone`: their profile card as the command's answer, looked up first when the directory doesn't know
// them yet, and the view recorded as usage. Today's convex/slack/profileCardCommand.ts.
import { ReportableError } from "../analytics/exceptions.ts";
import { recordUsage, recordUsageWithoutBlocking } from "../analytics/usage.ts";
import { avatarShownOn } from "../album/hoggies/avatar.ts";
import { renderLookUpFailed, renderNotAMember, renderProfileCard, renderProfileCardUsage } from "../feedback/profileCard.ts";
import type { Line } from "../feedback/segments.ts";
import { isProfileCardShownTo } from "../profileCard/flag.ts";
import { groupNameOnCard, profileCardOf } from "../profileCard/profileCard.ts";
import { lookup, type MemberFacts, type MemberId } from "../workspace/directory.ts";
import { answerCommand, knownOrLookedUp, onceKnown, replyPrivately, type Viewer } from "./commandReplies.ts";
import type { CommandContext } from "./frontDoor.ts";
import { attemptArgs, enqueueAt, failedAttempt, slackTextOf, tryAtMostThreeTimes } from "./delivery.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { actionJob } from "../jobs/define.ts";

export type CardRequest = { kind: "card"; target: string } | { kind: "usage" };

export type CardReply = { shown: false } | { shown: true; lines: Line[] | null };

type Viewing = Viewer & { arrivedAt: number };

type Viewed = Viewing & { own: boolean };

type Answer = { lines: Line[]; own: boolean | null };

const personMention = /^<@([^|>\s]+)(?:\|[^>]*)?>$/;
const anyMention = /^<[@!#]/;
const replyWindowMs = 25 * 60_000;

const cardRequestValidator = z.union([z.strictObject({ kind: z.literal("card"), target: z.string() }), z.strictObject({ kind: z.literal("usage") })]);

const viewingArgs = { workspace: z.string(), user: z.string(), arrivedAt: zv.number() };

const cardViewedArgs = { ...viewingArgs, own: z.boolean() };

export const cardViewedValidator = z.strictObject({ own: z.boolean(), arrivedAt: zv.number() });

export function cardRequestOf(text: string): CardRequest | null {
  const trimmed = text.trim();
  const person = personMention.exec(trimmed);
  if (person !== null) return { kind: "card", target: person[1]! };
  return anyMention.test(trimmed) ? { kind: "usage" } : null;
}

/**
 * The front door's `profileCard` command: `/hedgehug @someone` answers with the card where it is shown, and passes
 * anything else down the chain, as today's slackCommands did first.
 */
export async function profileCardCommand({ operations, arrivedAt }: CommandContext, command: URLSearchParams): Promise<Response | undefined> {
  const request = cardRequestOf(command.get("text") ?? "");
  if (request === null) return undefined;
  const asked = { workspace: field(command, "team_id"), user: field(command, "user_id"), arrivedAt, request, responseUrl: field(command, "response_url") };
  const reply = await operations.mutation("slack.profileCardCommand.profileCardReply", (ctx) => profileCardReply(ctx, asked));
  if (!reply.shown) return undefined;
  return reply.lines === null ? new Response(null, { status: 200 }) : replyPrivately(reply.lines);
}

function field(command: URLSearchParams, name: string) {
  const value = command.get(name);
  if (value === null) throw new ReportableError(`the slash command has no ${name}`);
  return value;
}

export const profileCardReplyArgs = z.strictObject({ ...viewingArgs, request: cardRequestValidator, responseUrl: z.string() });
export async function profileCardReply(ctx: MutationContext, { request, responseUrl, ...viewing }: z.infer<typeof profileCardReplyArgs>): Promise<CardReply> {
  const viewer = await lookup(ctx, viewing.workspace, viewing.user);
  const shown = await isProfileCardShownTo(ctx, viewing.workspace, viewer?.kind === "member" ? viewer.member : undefined);
  const answer = shown ? await answerTo(ctx, viewing, request, responseUrl) : null;
  const own = answer?.own ?? null;
  if (viewer === undefined) await exposeOnceKnown(ctx, viewing, shown, own);
  else if (own !== null) await reportViewed(ctx, { ...viewing, own });
  return shown ? { shown, lines: answer?.lines ?? null } : { shown };
}

async function answerTo(ctx: MutationContext, viewing: Viewing, request: CardRequest, responseUrl: string): Promise<Answer | null> {
  if (request.kind === "usage") return { lines: renderProfileCardUsage(), own: null };
  const target = await lookup(ctx, viewing.workspace, request.target);
  if (target !== undefined) return cardAnswerOf(ctx, viewing, request.target, target);
  await ctx.jobs.enqueue(answerUnknownTargetJob, { ...viewing, target: request.target, responseUrl }, { after: 0 });
  return null;
}

async function cardAnswerOf(ctx: MutationContext, viewing: Viewer, user: string, target: MemberFacts): Promise<Answer> {
  if (target.kind !== "member") return { lines: renderNotAMember(user), own: null };
  const own = viewing.user === user;
  const card = { ...(await profileCardOf(ctx, target.member, { own, viewer: await viewerOf(ctx, viewing) })), ...(await shownTo(ctx, viewing, target.member)) };
  return { lines: renderProfileCard(user, card), own };
}

async function shownTo(ctx: MutationContext, viewing: Viewer, member: MemberId) {
  const viewer = await viewerOf(ctx, viewing);
  if (viewer === null) return { group: null };
  return { group: await groupNameOnCard(ctx, viewer, member), ...(await avatarShownOn(ctx, viewer, member)) };
}

async function viewerOf(ctx: MutationContext, { workspace, user }: Viewer): Promise<MemberId | null> {
  const viewer = await lookup(ctx, workspace, user);
  return viewer?.kind === "member" ? viewer.member : null;
}

// commands.ts takes this module's cardViewedValidator for its job's arguments, so its job is loaded when it's enqueued:
// importing it here would close an import cycle that leaves one of the two undefined.
async function exposeOnceKnown(ctx: MutationContext, viewing: Viewing, shown: boolean, own: boolean | null) {
  const { exposeOnceKnownJob } = await import("./commands.ts");
  const cardViewed = own === null ? {} : { cardViewed: { own, arrivedAt: viewing.arrivedAt } };
  await ctx.jobs.enqueue(exposeOnceKnownJob, { workspace: viewing.workspace, user: viewing.user, flag: "profile-card", shown, ...cardViewed }, { after: 0 });
}

async function reportViewed(ctx: MutationContext, viewed: Viewed) {
  await ctx.jobs.enqueue(reportProfileCardViewedJob, viewed, { after: 0 });
}

export const answerUnknownTargetArgs = z.strictObject({ ...viewingArgs, target: z.string(), responseUrl: z.string(), ...attemptArgs });
export async function answerUnknownTarget(ctx: ActionContext, { attempt = 1, ...asked }: z.infer<typeof answerUnknownTargetArgs>): Promise<void> {
  const { target, responseUrl, arrivedAt, ...viewing } = asked;
  const lookUpFailed = () => answerCommand(responseUrl, slackTextOf(renderLookUpFailed(target)));
  const windowClosedAt = (at: number) => at > arrivedAt + replyWindowMs;
  await tryAtMostThreeTimes(
    ctx.clock,
    attempt,
    async (attempt) => {
      if (windowClosedAt(ctx.clock.now())) {
        await lookUpFailed();
        return null;
      }
      const person = await knownOrLookedUp(ctx, { workspace: viewing.workspace, user: target });
      if (person.kind === "failed") return failedAttempt(attempt, ctx.clock.now(), person.retryAfterMs);
      const { lines, own } = await ctx.run.mutation("slack.profileCardCommand.cardOfKnownTarget", (mutation) => cardOfKnownTarget(mutation, { ...viewing, target }));
      await answerCommand(responseUrl, slackTextOf(lines));
      if (own !== null) await ctx.run.mutation(`${reportProfileCardViewedJob.name}.enqueue`, ({ jobs }) => jobs.enqueue(reportProfileCardViewedJob, { ...viewing, arrivedAt, own }, { after: 0 }));
      return null;
    },
    async (retry) => {
      if (windowClosedAt(retry.at)) await lookUpFailed();
      else await enqueueAt(ctx, answerUnknownTargetJob, { ...asked, attempt: retry.attempt }, retry.at);
    },
    lookUpFailed,
  );
}
export const answerUnknownTargetJob = actionJob("slack.profileCardCommand.answerUnknownTarget", answerUnknownTargetArgs, answerUnknownTarget);

export const cardOfKnownTargetArgs = z.strictObject({ workspace: z.string(), user: z.string(), target: z.string() });
export async function cardOfKnownTarget(ctx: MutationContext, { target, ...viewing }: z.infer<typeof cardOfKnownTargetArgs>): Promise<Answer> {
  const person = await lookup(ctx, viewing.workspace, target);
  return person === undefined ? { lines: renderLookUpFailed(target), own: null } : await cardAnswerOf(ctx, viewing, target, person);
}

export const reportProfileCardViewedArgs = z.strictObject({ ...cardViewedArgs, ...attemptArgs });
export async function reportProfileCardViewed(ctx: ActionContext, { attempt = 1, ...viewed }: z.infer<typeof reportProfileCardViewedArgs>): Promise<void> {
  await onceKnown(
    ctx,
    attempt,
    viewed,
    () => recordProfileCardViewedWithoutBlocking(ctx, viewed),
    (retry) => enqueueAt(ctx, reportProfileCardViewedJob, { ...viewed, attempt: retry.attempt }, retry.at),
  );
}
export const reportProfileCardViewedJob = actionJob("slack.profileCardCommand.reportProfileCardViewed", reportProfileCardViewedArgs, reportProfileCardViewed);

export function recordProfileCardViewedWithoutBlocking(ctx: ActionContext, viewed: Viewed): Promise<void> {
  return recordUsageWithoutBlocking(() => ctx.run.mutation("slack.profileCardCommand.recordProfileCardViewed", (mutation) => recordProfileCardViewed(mutation, viewed)));
}

export const recordProfileCardViewedArgs = z.strictObject(cardViewedArgs);
export async function recordProfileCardViewed(ctx: MutationContext, { workspace, user, arrivedAt, own }: z.infer<typeof recordProfileCardViewedArgs>): Promise<void> {
  const person = await lookup(ctx, workspace, user);
  if (person?.kind === "member") await recordUsage(ctx, { kind: "profileCardViewed", workspace, member: person.member, own, surface: "command", at: arrivedAt });
}
