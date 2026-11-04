import type { Album, AlbumEmoji, AlbumMe, AlbumPerson, AlbumTeam } from "./answer";
import { comingSoonToSlackWords, type SlackWay } from "./slackWay";

export type OnThePhoto = { kind: "me"; me: AlbumMe } | { kind: "person"; person: AlbumPerson } | { kind: "unmatched"; name: string };

export function onThePhotoOf(album: Album, team: AlbumTeam): OnThePhoto[] {
  const me: OnThePhoto[] = team.mine ? [{ kind: "me", me: album.me }] : [];
  const people = team.people.map((person): OnThePhoto => ({ kind: "person", person: personIn(album, person) }));
  return [...me, ...people, ...team.unmatched.map((name): OnThePhoto => ({ kind: "unmatched", name }))];
}

export function personIn(album: Album, person: string): AlbumPerson {
  return album.people.find((listed) => listed.person === person) ?? { person, name: "A teammate", face: { kind: "initials", initials: "?" }, teams: [], held: false, packedThisWeek: false };
}

export function nameOnThePhoto(shown: OnThePhoto) {
  if (shown.kind === "me") return shown.me.name;
  return shown.kind === "person" ? shown.person.name : shown.name;
}

export type WaitingSticker = "tray" | "pack" | "board";

export function waitingStickerOf(album: Album, person: string): WaitingSticker | null {
  if (isInTheTray(album, person)) return "tray";
  if (hasAPackWaiting(album, person)) return "pack";
  if (hasAnItemWaiting(album, person)) return "board";
  return null;
}

const waitingWords: Record<WaitingSticker, (first: string) => string> = {
  tray: (first) => `${first}'s card is in your tray. Put it in from the top bar.`,
  pack: (first) => `${first}'s pack is waiting. Open it from your packs to add ${first} to your album.`,
  board: (first) => `${first}'s sticker waits among your unidentified items. Identify them from the top bar.`,
};

export function waitingStickerWords(waiting: WaitingSticker, name: string) {
  return waitingWords[waiting](firstNameOf(name));
}

export const waitingStickerLabels: Record<WaitingSticker, string> = { tray: "In your tray", pack: "Pack waiting", board: "Item waiting" };

export function howToCollectWords(album: Album, person: string, name: string) {
  if (isInTheTray(album, person)) return waitingStickerWords("tray", name);
  if (hasAPackWaiting(album, person)) return waitingStickerWords("pack", name);
  return `Give ${firstNameOf(name)} a kudos in Slack: mention them in a message with your kudos emoji. Their sticker comes in the pack.`;
}

function isInTheTray(album: Album, person: string) {
  return album.tray.some((item) => item.kind === "sticker" && item.person === person);
}

function hasAPackWaiting(album: Album, person: string) {
  return album.packs.some((pack) => pack.person === person);
}

function hasAnItemWaiting(album: Album, person: string) {
  return album.board?.items.some(({ reason }) => reason.kind === "thanks" && reason.person === person) ?? false;
}

export function teamEmojiOf(album: Album, team: string): AlbumEmoji | undefined {
  return album.emojis.find(({ id }) => id === `team:${team}`);
}

export const howToUseIt = "react with it and put it in the kudos you give";

export function teamEmojiUseWords(emoji: AlbumEmoji, way: SlackWay) {
  if (emoji.inSlack) return `Use it in Slack: ${howToUseIt}.`;
  if (way === "coming-soon") return "";
  return way === "find" ? `It isn't in Slack yet: find it in Slack, then ${howToUseIt}.` : `It isn't in Slack yet: add it, then ${howToUseIt}.`;
}

export function newTeamEmojiWords(emoji: AlbumEmoji | undefined, way: SlackWay) {
  if (emoji?.inSlack === true) return `Your new team emoji. Use it in Slack: ${howToUseIt}.`;
  if (way === "coming-soon") return `Your new team emoji. ${comingSoonToSlackWords}.`;
  return way === "find" ? `Your new team emoji. Find it in Slack, then ${howToUseIt}.` : `Your new team emoji. Add it to Slack from this page, then ${howToUseIt}.`;
}

export function teamHoggiePaidWords(rarityCaps: boolean) {
  return rarityCaps ? "A rare hoggie" : "A rare hoggie or rarer";
}

export function teamEmojiNameOf(album: Album, team: string) {
  return teamEmojiOf(album, team)?.name ?? `team-${team}`;
}

export function missingFrom(album: Album, team: AlbumTeam): AlbumPerson[] {
  return team.people.map((person) => personIn(album, person)).filter(({ held }) => !held);
}

export function oneMoreKudosWords(team: AlbumTeam, name: string) {
  const left = team.total - team.held - 1;
  return `Give ${firstNameOf(name)} a kudos: their sticker joins your album, and the team is ${left === 0 ? "complete" : `${left} more from complete`}.`;
}

export function firstNameOf(name: string) {
  return name.split(/\s+/, 1)[0] ?? name;
}

const dayMonthAndYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function dateOf(at: number) {
  return dayMonthAndYear.format(at);
}
