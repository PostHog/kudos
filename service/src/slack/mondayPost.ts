// The weekly post's Slack side, as today's convex/slack/mondayPost.ts: the channel an admin picks is checked by
// joining it, and the post itself is booked, claimed once per week, sent, and tried again when Slack asks. The
// claim and every record are the leaderboard's mutations (leaderboard/mondayPost.ts), each its own transaction.
import { z } from "zod";
import { renderMondayPost, renderTopKudosPost, type NewGiverRow, type TeamRow, type TopKudosEntry, type TopKudosMessage, type Words } from "../feedback/mondayPost.ts";
import { actionJob } from "../jobs/define.ts";
import { bookNextPost, claimWeek, postAgainLater, recordChannelCheck, recordOutcome, type ClaimedWeek, type foundChannelValidator } from "../leaderboard/mondayPost.ts";
import type { MondayPostOutcome } from "../leaderboard/mondayPostOutcome.ts";
import type { TopKudosPost } from "../leaderboard/topKudos.ts";
import type { ActionContext } from "../operations.ts";
import { zv } from "../values.ts";
import { personCardOf } from "../website/linkPreviews.ts";
import { escaped, mrkdwn } from "./blocks.ts";
import { attemptCall, isRefusedForItsBlocks, slackTextOf, type Attempt } from "./delivery.ts";
import { cardBlocksOf, emojisUnlockedOn } from "./linkPreviews.ts";
import { isOffLimits, joinRefusalOf, joinUnlessOffLimits, type ChannelTraits, type OffLimits } from "./offLimitsChannels.ts";
import type { SlackAnswer } from "./webApi.ts";

const attemptsAtMost = 3;
const teamRowsShown = 10;
const otherTeamsCharactersAtMost = 2_900;
const refusedInChannel = new Set(["no_permission", "restricted_action", "restricted_action_read_only_channel", "restricted_action_thread_only_channel", "ekm_access_denied"]);

type FoundChannel = z.infer<typeof foundChannelValidator>;

type CardedMessage = TopKudosMessage & { card: ReturnType<typeof cardBlocksOf> | null };

type JoinedChannel = { channel?: ChannelTraits & { is_private?: boolean } };

const privateChannel: FoundChannel = { kind: "refused", reason: "private" };

const joinRefusals: Record<string, FoundChannel> = {
  method_not_supported_for_channel_type: privateChannel,
  channel_not_found: { kind: "refused", reason: "not-found" },
  is_archived: { kind: "refused", reason: "archived" },
};

const uncheckable: FoundChannel = { kind: "refused", reason: "failed" };

export const checkPickedChannelArgs = z.strictObject({ workspace: z.string(), channel: z.string(), pick: zv.number() });
/** Joins the channel an admin picked and records what Slack said of it, if the pick is still the one being checked. */
export async function checkPickedChannel(ctx: ActionContext, { workspace, channel, pick }: z.infer<typeof checkPickedChannelArgs>): Promise<void> {
  const found = await joined(channel);
  await ctx.run.mutation("leaderboard.mondayPost.recordChannelCheck", (m) => recordChannelCheck(m, { workspace, channel, pick, found }));
}
export const checkPickedChannelJob = actionJob("slack.mondayPost.checkPickedChannel", checkPickedChannelArgs, checkPickedChannel);

async function joined(channel: string): Promise<FoundChannel> {
  try {
    return foundChannelOf(await joinUnlessOffLimits<JoinedChannel>(channel));
  } catch (error) {
    console.warn(`conversations.join has no known result: ${String(error)}`);
    return uncheckable;
  }
}

function foundChannelOf(answer: SlackAnswer<JoinedChannel> | OffLimits): FoundChannel {
  if (isOffLimits(answer)) return { kind: "refused", reason: answer.offLimits };
  if (!answer.ok) return joinRefusals[answer.error] ?? uncheckable;
  if (answer.channel?.is_private === true) return privateChannel;
  const offLimits = joinRefusalOf(answer.channel ?? {});
  if (offLimits !== null) return { kind: "refused", reason: offLimits };
  const name = answer.channel?.name;
  return name === undefined ? uncheckable : { kind: "public", name };
}

export const postMondayPostArgs = z.strictObject({ workspace: z.string(), generation: zv.number(), attempt: z.optional(zv.number()) });
/**
 * Books next week's post, then claims this week's and sends it. The claim is the week's one row, so a second run of
 * this job for the same week, from a second worker or an old booking, finds it and sends nothing.
 */
export async function postMondayPost(ctx: ActionContext, { workspace, generation, attempt = 1 }: z.infer<typeof postMondayPostArgs>): Promise<void> {
  await ctx.run.mutation("leaderboard.mondayPost.bookNextPost", (m) => bookNextPost(m, { workspace, generation }));
  const claimed = await ctx.run.mutation("leaderboard.mondayPost.claimWeek", (m) => claimWeek(m, { workspace, generation }));
  if (claimed === null) return;
  const sent = await postWeek(ctx, workspace, claimed);
  const nextTry = nextTryOf(sent, attempt);
  if (nextTry !== null) {
    await ctx.run.mutation("leaderboard.mondayPost.postAgainLater", (m) => postAgainLater(m, { workspace, generation, claim: claimed.claim, ...nextTry }));
  } else {
    await ctx.run.mutation("leaderboard.mondayPost.recordOutcome", (m) => recordOutcome(m, { claim: claimed.claim, outcome: outcomeOf(sent) }));
  }
}
export const postMondayPostJob = actionJob("slack.mondayPost.postMondayPost", postMondayPostArgs, postMondayPost);

async function postWeek(ctx: ActionContext, workspace: string, { channel, post }: ClaimedWeek): Promise<Attempt> {
  if (post.kind === "groups") return attemptCall(ctx, workspace, "chat.postMessage", { channel, text: slackTextOf(renderMondayPost(post)) });
  const message = { ...renderTopKudosPost(post), card: await firstNewGiversCardOf(ctx, workspace, post) };
  const sent = await attemptCall(ctx, workspace, "chat.postMessage", topKudosMessageOf(channel, message));
  return isRefusedForItsBlocks(sent) && hasPictures(message) ? attemptCall(ctx, workspace, "chat.postMessage", topKudosMessageOf(channel, withoutPictures(message))) : sent;
}

async function firstNewGiversCardOf(ctx: ActionContext, workspace: string, { origin, newGivers = [] }: TopKudosPost): Promise<CardedMessage["card"]> {
  const [first] = newGivers;
  if (origin === null || first === undefined) return null;
  const preview = await ctx.run.query("website.linkPreviews.personCardOf", (q) => personCardOf(q, { workspace, person: first.member, source: "monday-post" }));
  return preview === null ? null : cardBlocksOf(preview, await emojisUnlockedOn(ctx, workspace, preview));
}

function topKudosMessageOf(channel: string, message: CardedMessage) {
  return { channel, text: fallbackTextOf(message), blocks: blocksOf(message), unfurl_links: message.embedsQuotedMessage, unfurl_media: false };
}

function hasPictures({ teams, card }: CardedMessage) {
  return card !== null || (teams?.rows.some(({ emoji }) => emoji?.picture) ?? false);
}

function withoutPictures(message: CardedMessage): CardedMessage {
  const { teams } = message;
  if (teams === null) return { ...message, card: null };
  return { ...message, card: null, teams: { ...teams, rows: teams.rows.map((row) => (row.emoji === null ? row : { ...row, emoji: { ...row.emoji, picture: null } })) } };
}

function fallbackTextOf({ headline, kudos, newGivers, teams }: TopKudosMessage) {
  const giverLine = newGivers === null ? [] : [`${newGivers.headline}: ${newGivers.rows.map(({ place, name, thoughtful }) => `${place}. ${name} · ${thoughtful}`).join(", ")}`];
  const teamLine = teams === null ? [] : [`${teams.headline}: ${teams.rows.map(({ team, count }) => `${team} ${count}`).join(", ")}`];
  return [headline, ...kudos.map(({ lead, quote, permalink }) => `${plainOf(lead)}: ${quote}${permalink === null ? "" : ` ${permalink}`}`), ...giverLine, ...teamLine].map(escaped).join("\n");
}

function blocksOf({ headline, kudos, newGivers, teams, card }: CardedMessage) {
  const giverBlocks = newGivers === null ? [] : [sectionOf(`*${escaped(newGivers.headline)}*`), ...newGivers.rows.flatMap((row) => [sectionOf(newGiverLineOf(row)), ...(row.place === 1 && card !== null ? card : [])])];
  const teamBlocks = teams === null ? [] : [sectionOf(`*${escaped(teams.headline)}*`), ...teams.rows.slice(0, teamRowsShown).map(teamBlockOf), ...otherTeamsOf(teams.rows.slice(teamRowsShown))];
  return [sectionOf(`*${escaped(headline)}*`), ...kudos.map(kudosBlockOf), ...giverBlocks, ...teamBlocks];
}

function newGiverLineOf({ place, name, page, thoughtful }: NewGiverRow) {
  const named = page === null ? escaped(name) : `<${page}|${escaped(name)}>`;
  return `${place}. *${named}* · ${thoughtful} kudos`;
}

function kudosBlockOf({ lead, quote, permalink }: TopKudosEntry) {
  return sectionOf([mrkdwnOf(lead), `>${escaped(quote)}`, ...(permalink === null ? [] : [`<${permalink}|Open in Slack>`])].join("\n"));
}

function teamBlockOf(row: TeamRow) {
  const { emoji } = row;
  const picture = emoji?.picture ? [{ type: "image", image_url: emoji.picture, alt_text: emoji.name }] : [];
  return { type: "context", elements: [...picture, mrkdwn(teamWordsOf(row))] };
}

function otherTeamsOf(rows: TeamRow[]) {
  if (rows.length === 0) return [];
  const named = namedWithinTheLimit(rows.map(teamWordsOf));
  const more = rows.length - named.length;
  const line = named.join(" · ");
  return [{ type: "context", elements: [mrkdwn(more > 0 ? `${line} and ${more} more ${more === 1 ? "team" : "teams"}` : line)] }];
}

function namedWithinTheLimit(names: string[]): string[] {
  const named: string[] = [];
  let length = 0;
  for (const name of names) {
    length += name.length + " · ".length;
    if (length > otherTeamsCharactersAtMost) break;
    named.push(name);
  }
  return named;
}

function teamWordsOf({ team, count, emoji }: TeamRow) {
  return `*${escaped(team)}* ${count}${emoji?.inSlack ? ` :${emoji.name}:` : ""}`;
}

function sectionOf(text: string) {
  return { type: "section", text: mrkdwn(text) };
}

export function mrkdwnOf(words: Words[]) {
  return words.map(({ text, strong, link }) => {
    const shown = link === undefined ? escaped(text) : `<${link}|${escaped(text)}>`;
    return strong ? `*${shown}*` : shown;
  }).join("");
}

export function plainOf(words: Words[]) {
  return words.map(({ text }) => text).join("");
}

function nextTryOf(sent: Attempt, attempt: number): { at: number; attempt: number } | null {
  if (sent.kind === "held") return { at: sent.until, attempt };
  if (sent.kind !== "failed" || sent.retryAt === undefined || attempt >= attemptsAtMost) return null;
  return { at: sent.retryAt, attempt: attempt + 1 };
}

function outcomeOf(sent: Attempt): MondayPostOutcome {
  if (sent.kind === "delivered") return "posted";
  return cantPostIn(sent) ? "cant-post" : "failed";
}

function cantPostIn(sent: Attempt) {
  return sent.kind === "gone" || (sent.kind === "failed" && sent.error !== undefined && refusedInChannel.has(sent.error));
}
