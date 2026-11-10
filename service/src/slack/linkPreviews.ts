// The module map's skeleton of convex/slack/linkPreviews.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { medalText } from "../feedback/profileCard.ts";
import { productName } from "../feedback/naming.ts";
import { rarityWord } from "../album/hoggies/catalogue.ts";
import type { BoardPlace } from "../leaderboard/boards.ts";
import type { CardHoggie, CardTeam, LevelWay, PersonStats, TeamStats } from "../website/linkCardStats.ts";
import type { LinkPreview, PersonPreview, TeamPreview } from "../website/linkPreviews.ts";
import { escaped, mrkdwn, slackDayOf } from "./blocks.ts";
import { textOf } from "./directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

type LinkShared = { type: "link_shared"; channel?: unknown; user?: unknown; message_ts?: unknown; source?: unknown; links?: unknown };

type LinkSharedCallback = { team_id?: unknown; event_id?: unknown; is_ext_shared_channel?: unknown; event: LinkShared };

export const linkSharingValidator = { workspace: z.string(), sharer: z.string(), links: z.array(z.string()), channel: z.string(), ts: z.string(), sharedOutside: z.union([z.literal("no"), z.literal("unsaid")]) };

const unfoldArgs = { ...linkSharingValidator, attempt: z.optional(zv.number()) };

export const unfoldLinksArgs = z.strictObject(unfoldArgs);
export async function unfoldLinks(ctx: ActionContext, args: z.infer<typeof unfoldLinksArgs>): Promise<void> {
  throw notPorted("slack.linkPreviews.unfoldLinks");
}
export const unfoldLinksJob = actionJob("slack.linkPreviews.unfoldLinks", unfoldLinksArgs, unfoldLinks);

export function isLinkShared(event: { type: string }): event is LinkShared {
  return event.type === "link_shared";
}

export function linkSharingOf({ team_id, event_id, is_ext_shared_channel, event }: LinkSharedCallback) {
  if (event.source === "composer" || is_ext_shared_channel === true) return null;
  const sharedOutside = is_ext_shared_channel === false ? "no" : "unsaid";
  const [workspace, eventId, sharer, channel, ts] = [textOf(team_id), textOf(event_id), textOf(event.user), textOf(event.channel), textOf(event.message_ts)];
  const links = linksOf(event.links);
  if (workspace === undefined || eventId === undefined || sharer === undefined || channel === undefined || ts === undefined || links.length === 0) return null;
  return { workspace, eventId, sharer, links, channel, ts, sharedOutside } as const;
}

function linksOf(links: unknown): string[] {
  if (!Array.isArray(links)) return [];
  return links.flatMap((link) => {
    const url = textOf((link as { url?: unknown } | null)?.url);
    return url === undefined ? [] : [url];
  });
}

const barSegments = 10;

export async function emojisUnlockedOn(ctx: ActionContext, workspace: string, preview: LinkPreview): Promise<number> {
  throw notPorted("slack.linkPreviews.emojisUnlockedOn");
}

export function cardBlocksOf(preview: LinkPreview, emojis: number) {
  if (preview.stats !== undefined) return preview.kind === "person" ? richPersonCardOf(preview, preview.stats, emojis) : richTeamCardOf(preview, preview.stats);
  const lines = [nameLineOf(preview), ...(preview.kind === "person" ? personLinesOf(preview) : [peopleCountOf(preview.people)])];
  return [headOf(preview, lines), { type: "context", elements: [mrkdwn(`${productName} album · ${preview.kind} page`)] }];
}

function richPersonCardOf(preview: PersonPreview, stats: PersonStats, emojis: number) {
  const fields = [
    ...placeFieldsOf(stats.place, "leaderboard"),
    ...(stats.hoggies === null || stats.hoggies.found === 0 ? [] : [`🦔 *${stats.hoggies.found}* of ${stats.hoggies.total} hoggies found`]),
    ...(stats.people === 0 ? [] : [`📒 *${stats.people}* ${stats.people === 1 ? "person" : "people"} in their album`]),
    ...(emojis === 0 ? [] : [`🔓 *${emojis}* ${emojis === 1 ? "emoji" : "emojis"} unlocked`]),
  ];
  const quiet = fields.length === 0 && stats.rarest.length === 0;
  const lines = [nameLineOf(preview), ...teamLinesOf(stats.teams), ...(stats.way === null ? [] : levelLinesOf(stats.way)), ...medalLinesOf(preview), ...(quiet ? ["🌱 Just getting started. Their first thanks and finds show up here."] : [])];
  return [headOf(preview, lines), ...statBlocksOf(fields, stats.rarest), datedFootOf(preview, stats.asOf)];
}

function richTeamCardOf(preview: TeamPreview, stats: TeamStats) {
  const fields = placeFieldsOf(stats.place, "team leaderboard");
  const saidThanks = stats.saidThanks === 0 || preview.people === 0 ? [] : [`${barOf(stats.saidThanks / preview.people)}  *${stats.saidThanks} of ${preview.people}* have said thanks`];
  const quiet = saidThanks.length === 0 && stats.rarest.length === 0;
  const lines = [nameLineOf(preview), peopleCountOf(preview.people), ...saidThanks, ...(quiet ? [`🌱 No kudos yet. The first one puts ${escaped(preview.name)} on the board.`] : [])];
  return [headOf(preview, lines), ...statBlocksOf(fields, stats.rarest), datedFootOf(preview, stats.asOf)];
}

function headOf(preview: LinkPreview, lines: string[]) {
  const picture = preview.picture === null ? {} : { accessory: { type: "image", image_url: preview.picture, alt_text: preview.name } };
  return { type: "section", text: { ...mrkdwn(lines.join("\n")), verbatim: true }, ...picture };
}

function nameLineOf(preview: LinkPreview) {
  return `*<${preview.page}|${escaped(preview.name)}>*`;
}

function teamLinesOf(teams: CardTeam[]) {
  return teams.length === 0 ? [] : [teams.map(({ name, emoji }) => (emoji === null ? escaped(name) : `:${emoji}: ${escaped(name)}`)).join(" · ")];
}

function levelLinesOf({ level, share }: LevelWay) {
  return [`*Level ${level} → ${level + 1}*`, barOf(share)];
}

function barOf(share: number) {
  const filled = Math.min(barSegments, Math.floor(share * barSegments));
  return "▰".repeat(filled) + "▱".repeat(barSegments - filled);
}

function placeFieldsOf(place: BoardPlace | null, board: string) {
  if (place === null) return [];
  return [`🏆 *No. ${place.rank}${place.tied ? ", tied" : ""}* on the all-time ${board}`, `💛 *${place.kudosGiven}* kudos given`];
}

function statBlocksOf(fields: string[], rarest: CardHoggie[]) {
  return [...(fields.length === 0 ? [] : [{ type: "section", fields: fields.map(mrkdwn) }]), ...(rarest.length === 0 ? [] : [rarestHoggiesOf(rarest)])];
}

function rarestHoggiesOf(rarest: CardHoggie[]) {
  const [first] = rarest;
  const pictures = rarest.map(({ picture, name }) => ({ type: "image", image_url: picture, alt_text: name }));
  return { type: "context", elements: [...pictures, mrkdwn(`Rarest find: *${escaped(first!.name)}* · ${rarityWord(first!.rarity)}`)] };
}

function datedFootOf(preview: LinkPreview, asOf: number) {
  return { type: "context", elements: [mrkdwn(`${productName} album · ${preview.kind} page · as of ${slackDayOf(asOf)}`)] };
}

function personLinesOf(preview: PersonPreview) {
  const { level, teams } = preview;
  const standing = [...(level === null ? [] : [`Level ${level}`]), ...(teams.length === 0 ? [] : [teams.map(escaped).join(", ")])];
  return [...(standing.length === 0 ? [] : [standing.join(" · ")]), ...medalLinesOf(preview)];
}

function medalLinesOf({ medals }: PersonPreview) {
  return medals.length === 0 ? [] : [medals.map(medalText).join(" · ")];
}

function peopleCountOf(people: number) {
  return people === 1 ? "1 person" : `${people} people`;
}
