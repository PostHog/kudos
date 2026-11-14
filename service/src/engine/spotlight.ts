// The spotlight: which given kudos messages may be drawn for the website's spotlight, kept up to date as words,
// members and boards change, and the draw itself. Today's convex/engine/spotlight.ts over the service's transaction;
// its recomputes are jobs, as they were scheduled functions.
import { z } from "zod";
import { withholdingWords } from "../analytics/exceptions.ts";
import { mutationJob } from "../jobs/define.ts";
import { isOnTheBoards } from "../leaderboard/visibility.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { zv } from "../values.ts";
import { isMember, type MemberId } from "../workspace/directory.ts";
import { awardsOfMessage, awardsReceivedNewestFirst, fromTheNewest, messagesGivenNewestFirst, type Before } from "./awards.ts";
import { wordsOf, type KudosText } from "./kudosText.ts";
import { messageRefValidator, type MessageRef, type WordSegment } from "./messageEvent.ts";
import { drawnAlong, placeInSpotlight, type DrawPoint, type DrawWalk, type Drawn } from "./spotlightDraws.ts";

export type DrawableKudos = { at: number; giver: MemberId; recipients: MemberId[]; segments: WordSegment[]; edited: boolean };

export type Draw = { kind: "kudos"; drawn: Drawn; kudos: DrawableKudos; mentionLookups: number } | { kind: "skipped"; at: DrawPoint } | { kind: "empty" };

type Awards = Awaited<ReturnType<typeof awardsOfMessage>>;

type Budget = { checks: number; lookups: number };

const turnedAwayAtMost = 25;

const lookupsPerDraw = 3_000;

const recomputedAtMost: Budget = { checks: 10, lookups: 1_000 };

const peopleCheckedRightAway = 50;

const sideValidator = z.union([z.literal("given"), z.literal("received")]);

const beforeValidator = z.union([z.strictObject({ at: zv.number(), created: zv.number() }), z.null()]);

type Recompute = { member: MemberId; side: z.infer<typeof sideValidator>; before: Before | null };

export async function drawFrom(ctx: QueryContext, workspace: string, walk: DrawWalk): Promise<Draw> {
  const spent: Budget = { checks: 0, lookups: 0 };
  let turnedAway: Drawn | null = null;
  for await (const drawn of drawnAlong(ctx, workspace, walk)) {
    const awards = await awardsOfMessage(ctx, drawn.ref);
    const needed = checkLookupsOf(awards) + answerLookupsOf(awards);
    if (turnedAway !== null && (spent.checks === turnedAwayAtMost || spent.lookups + needed > lookupsPerDraw)) return { kind: "skipped", at: turnedAway };
    const kudos = await drawableAmong(ctx, drawn.ref, awards);
    if (kudos !== null) return { kind: "kudos", drawn, kudos, mentionLookups: Math.max(0, lookupsPerDraw - spent.lookups - needed) };
    turnedAway = drawn;
    spend(spent, checkLookupsOf(awards));
  }
  return { kind: "empty" };
}

export async function publicKudosOf(ctx: QueryContext, ref: MessageRef): Promise<DrawableKudos | null> {
  if (!isPublic(await wordsOf(ctx, ref))) return null;
  return drawableAmong(ctx, ref, await awardsOfMessage(ctx, ref));
}

export async function keepSpotlightUpToDate(ctx: MutationContext, ref: MessageRef): Promise<void> {
  const awards = await awardsOfMessage(ctx, ref);
  if (peopleOf(awards).length > peopleCheckedRightAway) await ctx.jobs.enqueue(recomputeSpotlightOfMessageJob, { ref });
  else await placeAmong(ctx, ref, awards);
}

export const recomputeSpotlightOfMessageArgs = z.strictObject({ ref: messageRefValidator });
export const recomputeSpotlightOfMessage = withholdingWords(async (ctx: MutationContext, { ref }: z.infer<typeof recomputeSpotlightOfMessageArgs>): Promise<void> => {
  await placeAmong(ctx, ref, await awardsOfMessage(ctx, ref));
});
export const recomputeSpotlightOfMessageJob = mutationJob("engine.spotlight.recomputeSpotlightOfMessage", recomputeSpotlightOfMessageArgs, recomputeSpotlightOfMessage);

export const recomputeSpotlightOfArgs = z.strictObject({ member: zv.id("members"), side: sideValidator, before: beforeValidator });
export const recomputeSpotlightOf = withholdingWords(recomputeSome);
export const recomputeSpotlightOfJob = mutationJob("engine.spotlight.recomputeSpotlightOf", recomputeSpotlightOfArgs, recomputeSpotlightOf);

async function recomputeSome(ctx: MutationContext, { member, side, before }: Recompute): Promise<void> {
  const spent: Budget = { checks: 0, lookups: 0 };
  let recomputedThrough = before;
  for await (const { message, at, created } of messagesOf(ctx, member, side, before ?? fromTheNewest)) {
    if (spent.checks >= recomputedAtMost.checks || spent.lookups >= recomputedAtMost.lookups) return recomputeLater(ctx, { member, side, before: recomputedThrough });
    const awards = await awardsOfMessage(ctx, message);
    await placeAmong(ctx, message, awards);
    spend(spent, checkLookupsOf(awards));
    recomputedThrough = { at, created };
  }
  if (side === "given") await recomputeLater(ctx, { member, side: "received", before: null });
}

async function recomputeLater(ctx: MutationContext, recompute: Recompute): Promise<void> {
  await ctx.jobs.enqueue(recomputeSpotlightOfJob, recompute);
}

function messagesOf(ctx: QueryContext, member: MemberId, side: Recompute["side"], before: Before) {
  return side === "given" ? messagesGivenNewestFirst(ctx, member, before) : awardsReceivedNewestFirst(ctx, member, before);
}

async function placeAmong(ctx: MutationContext, ref: MessageRef, awards: Awards) {
  await placeInSpotlight(ctx, ref, (await drawableAmong(ctx, ref, awards)) !== null);
}

async function drawableAmong(ctx: QueryContext, ref: MessageRef, awards: Awards): Promise<DrawableKudos | null> {
  const first = awards[0];
  if (first === undefined) return null;
  if (!(await isMember(ctx, first.giver)) || !(await allOnTheBoards(ctx, peopleOf(awards)))) return null;
  const words = await wordsOf(ctx, ref);
  if (!isPublic(words)) return null;
  return { at: first.at, giver: first.giver, recipients: awards.map(({ recipient }) => recipient), segments: words.segments, edited: words.edited };
}

function isPublic(words: KudosText): words is Extract<KudosText, { kind: "text" }> {
  return words.kind === "text" && words.visibility === "public";
}

async function allOnTheBoards(ctx: QueryContext, members: MemberId[]) {
  for (const member of members) if (!(await isOnTheBoards(ctx, member))) return false;
  return true;
}

function peopleOf(awards: Awards): MemberId[] {
  const first = awards[0];
  return first === undefined ? [] : [...new Set([first.giver, ...awards.map(({ recipient }) => recipient)])];
}

function checkLookupsOf(awards: Awards) {
  return 4 + peopleOf(awards).length;
}

function answerLookupsOf(awards: Awards) {
  return 2 + peopleOf(awards).length;
}

function spend(spent: Budget, lookups: number) {
  spent.checks += 1;
  spent.lookups += lookups;
}
