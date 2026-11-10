// What a reaction on a teammate's message is: a hug with the kudos emoji or an earned emoji, a hype with someone's
// hype emoji, or nothing. Today's convex/hugs/hugs.ts.
import { holdsEarnedEmojiNamed } from "../album/earnedEmojis.ts";
import { hypeEmojiFor } from "../album/hypes.ts";
import type { HugGivenEvent, HypeReactedEvent } from "../bus/events.ts";
import { allowanceDay } from "../engine/allowance.ts";
import { authorOfGiven, receivedOn } from "../engine/awards.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { lookup, type MemberFacts, type MemberId } from "../workspace/directory.ts";
import { hugBudgetOf, settingsOf } from "../workspace/settings.ts";
import { withoutSkinTone } from "../workspace/slackEmoji.ts";
import { hugRewardsOnAndExposedFor, hugsOnAndExposedFor } from "./flag.ts";
import type { HugReaction } from "./reaction.ts";
import { hasHuggedBefore, hugOf, hugsGivenOn, insertHug, type HugFor, type NewHug } from "./records.ts";
import { countHugGiven } from "./weeks.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export type ReactionDecision = { kind: "hug" } | { kind: "hype"; owner: MemberId } | { kind: "nothing" } | { kind: "unknown-people"; users: string[] };

type Reacted = { reaction: HugReaction; ref: MessageRef; giver: MemberFacts & { kind: "member" }; author: MemberId; emoji: string };

const dayMs = 24 * 60 * 60 * 1000;
const nothing: ReactionDecision = { kind: "nothing" };

export async function mayReactWith(ctx: QueryContext, workspace: string, user: string, toned: string): Promise<boolean> {
  const emoji = withoutSkinTone(toned);
  if (await isKudosEmojiOf(ctx, workspace, emoji)) return true;
  const giver = await lookup(ctx, workspace, user);
  const member = giver?.kind === "member" ? giver.member : null;
  if (member !== null && (await holdsEarnedEmojiNamed(ctx, workspace, member, emoji))) return true;
  return (await hypeEmojiFor(ctx, workspace, member, emoji)) !== null;
}

export async function decideReaction(ctx: MutationContext, reaction: HugReaction): Promise<ReactionDecision> {
  if (!isWithinADayOfTheMessage(reaction)) return nothing;
  const giver = await lookup(ctx, reaction.workspace, reaction.giver);
  const author = await lookup(ctx, reaction.workspace, reaction.author);
  if (giver === undefined || author === undefined) return { kind: "unknown-people", users: unknownOf(reaction, { giver, author }) };
  if (giver.kind !== "member" || author.kind !== "member") return nothing;
  const ref = { workspace: reaction.workspace, conversation: reaction.conversation, message: reaction.message };
  const reacted = { reaction, ref, giver, author: author.member, emoji: withoutSkinTone(reaction.emoji) };
  return (await givesHugs(ctx, reaction.workspace, giver.member, reacted.emoji)) ? hugOn(ctx, reacted) : hypeOn(ctx, reacted);
}

async function hugOn(ctx: MutationContext, { reaction, ref, giver, author, emoji }: Reacted): Promise<ReactionDecision> {
  const hugFor = await hugForOf(ctx, ref, giver.member, author);
  if (hugFor === null || (await hugOf(ctx, ref, giver.member)) !== null) return nothing;
  const day = allowanceDay(reaction.at, giver.timeZone);
  if ((await hugsLeftOf(ctx, giver.member, reaction.workspace, day)) === 0) return nothing;
  if (!(await hugsOnAndExposedFor(ctx, giver.member))) return nothing;
  const first = !(await hasHuggedBefore(ctx, giver.member));
  await recordHug(ctx, { ...ref, ...hugFor, giver: giver.member, emoji: reaction.emoji, at: reaction.at, day }, { first, reaction: emoji });
  return { kind: "hug" };
}

async function hypeOn(ctx: MutationContext, { reaction, ref, giver, author, emoji }: Reacted): Promise<ReactionDecision> {
  const hype = await hypeEmojiFor(ctx, reaction.workspace, giver.member, emoji);
  if (hype === null || hype.owner === giver.member || hype.held) return nothing;
  if (!(await hugsOnAndExposedFor(ctx, giver.member))) return nothing;
  const hyped: HypeReactedEvent = { type: "hypeReacted", workspace: reaction.workspace, giver: giver.member, owner: hype.owner, author, emoji, message: ref, at: reaction.at };
  await ctx.publish(hyped);
  return { kind: "hype", owner: hype.owner };
}

async function givesHugs(ctx: QueryContext, workspace: string, giver: MemberId, emoji: string) {
  return (await isKudosEmojiOf(ctx, workspace, emoji)) || (await holdsEarnedEmojiNamed(ctx, workspace, giver, emoji));
}

async function isKudosEmojiOf(ctx: QueryContext, workspace: string, emoji: string) {
  return emoji === (await settingsOf(ctx, workspace)).kudosEmoji;
}

function isWithinADayOfTheMessage({ message, at }: HugReaction) {
  const sinceMessage = at - Number(message) * 1000;
  return sinceMessage >= 0 && sinceMessage < dayMs;
}

function unknownOf(reaction: HugReaction, known: { giver: MemberFacts | undefined; author: MemberFacts | undefined }) {
  return [...new Set([...(known.giver === undefined ? [reaction.giver] : []), ...(known.author === undefined ? [reaction.author] : [])])];
}

async function hugForOf(ctx: QueryContext, ref: MessageRef, giver: MemberId, author: MemberId): Promise<HugFor | null> {
  if (author === giver) return null;
  if ((await authorOfGiven(ctx, ref)) === null) return { onKudos: false, author };
  return (await receivedOn(ctx, ref, giver)) ? { onKudos: false, author } : { onKudos: true };
}

export async function hugsLeftOf(ctx: QueryContext, giver: MemberId, workspace: string, day: string): Promise<number> {
  const budget = await hugBudgetOf(ctx, workspace);
  return budget - (await hugsGivenOn(ctx, giver, day, budget));
}

async function recordHug(ctx: MutationContext, hug: NewHug, { first, reaction }: { first: boolean; reaction: string }) {
  const { workspace, conversation, message, giver, onKudos, at, day } = hug;
  await insertHug(ctx, hug);
  await countHugGiven(ctx, hug);
  const rewards = await hugRewardsOnAndExposedFor(ctx, giver);
  const given: HugGivenEvent = { type: "hugGiven", workspace, giver, message: { workspace, conversation, message }, onKudos, ...(!hug.onKudos && { author: hug.author }), at, day, first, reaction, rewards };
  await ctx.publish(given);
}
