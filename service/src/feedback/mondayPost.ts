import type { Segment } from "../activity/entries.ts";
import type { MondayPost, PostedGroup } from "../leaderboard/mondayPost.ts";
import type { ShownEmoji } from "../album/earnedEmojis.ts";
import type { QuotedKudos, QuotedPerson, TopKudosPost } from "../leaderboard/topKudos.ts";
import { publicPictureOf } from "./albumSlack.ts";
import { asWritten } from "./groupCopy.ts";
import { medalOf } from "./leaderboard.ts";
import type { Find } from "../album/items/finds.ts";
import type { Line } from "./segments.ts";
import { personPageOf } from "../website/linkPreviews.ts";
import type { MemberId } from "../workspace/directory.ts";

export function renderMondayPost({ groups, mostImproved, givers }: MondayPost): Line[] {
  const mostImprovedLine: Line[] = mostImproved === null ? [] : [[{ text: `📈 Most improved: ${asWritten({ name: mostImproved })}` }]];
  return [[{ text: "🏆 Last week in kudos" }], ...groups.map(groupLine), ...mostImprovedLine, [{ text: `${peopleCount(givers)} gave kudos last week. Thank you!` }]];
}

function groupLine(group: PostedGroup): Line {
  return [{ text: `${medalOf(group.rank)} ${asWritten(group)} · ${group.perMember.toFixed(1)} per person` }];
}

function peopleCount(givers: number) {
  return givers === 1 ? "1 person" : `${givers} people`;
}

export const quotedCharactersAtMost = 200;

export type Words = { text: string; strong?: true; link?: string };

export type TopKudosEntry = { lead: Words[]; quote: string; permalink: string | null };

export type PublicEmoji = Omit<ShownEmoji, "picture"> & { picture: string | null };

export type TeamRow = { team: string; count: string; emoji: PublicEmoji | null };

export type NewGiverRow = { place: number; member: MemberId; name: string; page: string | null; thoughtful: number };

export type TopKudosMessage = { headline: string; kudos: TopKudosEntry[]; embedsQuotedMessage: boolean; newGivers: { headline: string; rows: NewGiverRow[] } | null; teams: { headline: string; rows: TeamRow[] } | null };

export function renderTopKudosPost({ kudos, teams, origin, newGivers: highlightedGivers }: TopKudosPost): TopKudosMessage {
  const highlighted = highlightedGivers !== undefined;
  const newGivers = highlightedGivers ?? [];
  const pageOf = (person: QuotedPerson) => (origin === null ? undefined : personPageOf(origin, person.member, "monday-post"));
  return {
    headline: "🏆 Last week's top kudos",
    kudos: kudos.map((entry, index) => ({ lead: highlighted ? linkedLeadOf(entry, pageOf) : leadOf(entry, index + 1), quote: quoteOf(entry.words), permalink: entry.permalink })),
    embedsQuotedMessage: highlighted,
    newGivers: newGivers.length === 0 ? null : { headline: "🌱 Top new givers last week", rows: newGivers.map((giver, index) => ({ place: index + 1, ...giver, page: origin === null ? null : personPageOf(origin, giver.member, "monday-post") })) },
    teams: teams.length === 0 ? null : { headline: "Team stickers unlocked last week", rows: teams.map(({ name, count, emoji }) => ({ team: name, count: `×${count}`, emoji: emoji === null ? null : { ...emoji, picture: publicPictureOf(emoji.picture, origin) } })) },
  };
}

function leadOf({ giver, recipients, moreRecipients, find }: QuotedKudos, place: number): Words[] {
  return [{ text: `${place}. ${giver.name}`, strong: true }, { text: " thanked " }, ...listedNames(recipients.map(({ name }) => ({ text: name, strong: true })), moreRecipients), ...foundWordsOf(find)];
}

function linkedLeadOf({ giver, recipients, moreRecipients, find }: QuotedKudos, pageOf: (person: QuotedPerson) => string | undefined): Words[] {
  const linked = (person: QuotedPerson): Words => {
    const page = pageOf(person);
    return page === undefined ? { text: person.name, strong: true } : { text: person.name, strong: true, link: page };
  };
  return [linked(giver), { text: " thanked " }, ...listedNames(recipients.map(linked), moreRecipients), ...foundWordsOf(find)];
}

function foundWordsOf(find: Find | null): Words[] {
  return find === null ? [] : [{ text: ` and found ${findWordsOf(find)}` }];
}

export function findWordsOf({ name, rarity }: Find) {
  return `${rarity === "epic" ? "an" : "a"} ${rarity} ${name}`;
}

function listedNames(names: Words[], more: number): Words[] {
  const listed = [...names];
  const last = more > 0 ? { text: `${more} more` } : listed.pop();
  const joined = listed.flatMap((name, index) => (index === 0 ? [name] : [{ text: ", " }, name]));
  return last === undefined ? joined : [...joined, ...(joined.length > 0 ? [{ text: " and " }] : []), last];
}

export function quoteOf(words: Segment[]): string {
  const characters = Array.from(words.map(plainTextOf).join("").replace(/\s+/g, " ").trim());
  return characters.length <= quotedCharactersAtMost ? characters.join("") : `${characters.slice(0, quotedCharactersAtMost).join("")}…`;
}

function plainTextOf(segment: Segment): string {
  switch (segment.kind) {
    case "text":
      return segment.text;
    case "person":
      return `@${segment.name}`;
    case "group":
      return `@${segment.handle}`;
    case "channel":
      return "#channel";
    case "broadcast":
      return `@${segment.range}`;
    case "emoji":
      return `:${segment.name}:`;
    case "link":
      return segment.label ?? segment.url;
    case "break":
      return " ";
  }
}
