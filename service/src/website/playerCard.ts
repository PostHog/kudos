// A person's player card on the website: their face, team, level, place, people, hoggies and medals, and their week
// for anyone else who reads it. Today's convex/website/playerCard.ts; its two member queries are handlers the website
// platform's route table runs once the member check has passed.
import { z } from "zod";
import { emojiStackOf, type EmojiStack } from "../album/earnedEmojis.ts";
import { albumShownTo, personPageDShownTo } from "../album/flag.ts";
import { albumHoggiesOf, rarestFindsIn, type AlbumHoggie } from "../album/albumHoggies.ts";
import { personTeamsOf, type PersonTeam } from "../album/personPage.ts";
import { newestStickersOf } from "../album/profile.ts";
import type { MilestoneId, MilestoneTier } from "../album/records.ts";
import { peopleHeldBy } from "../album/stickers.ts";
import { anEmptyWeek, weekAt, weekRowOf, weekTallyIn } from "../album/tallies.ts";
import { hoggiesShownTo } from "../album/hoggies/flag.ts";
import { tiersTurnedBy } from "../album/items/milestoneUnlocks.ts";
import { placeOf, type BoardPlace } from "../leaderboard/boards.ts";
import { totalsOf } from "../leaderboard/counts.ts";
import { keyOf } from "../leaderboard/periods.ts";
import { xpLevelsShownIn } from "../progression/xpLevels.ts";
import { isAPersonOf, type MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { levelOf, type AlbumAnswer } from "./album.ts";
import { faceIn, publicKudosOfTheWeekShown, type AlbumIssue, type AlbumPersonFace } from "./albumPages.ts";
import { followTheClock } from "./clock.ts";
import type { VerifiedMember } from "./memberQuery.ts";

export type CardHoggie = Pick<AlbumHoggie, "hoggie" | "name" | "rarity"> & { firstAt: number };

export type CardMedal = { milestone: MilestoneId; tier: MilestoneTier };

export type PlayerCard = AlbumPersonFace & {
  team: PersonTeam | null;
  level: AlbumAnswer["level"] | null;
  place: BoardPlace | null;
  people: { held: number; newest: AlbumPersonFace[] };
  hoggies: { found: number; total: number; rarest: CardHoggie | null } | null;
  medals: { count: number; best: CardMedal[] };
};

export type CardWeek = { days: number[]; thanked: number; thankedBy: number; packsOpened: number; hugs: number; kudosOfWeek: AlbumIssue["kudosOfWeek"] };

export type PlayerCardAnswer = { kind: "card"; card: PlayerCard; week?: CardWeek };

export type PlayerCardRead = PlayerCardAnswer | { kind: "off" } | { kind: "no-person" };

export type CardEmojisRead = ({ kind: "emojis" } & EmojiStack) | { kind: "off" } | { kind: "no-person" };

const newestPeopleOnTheCard = 3;

export const emojisOnTheCard = 4;

const medalsOnTheCard = 3;

const peopleSearchedForTheNewest = 500;

const medalsBestFirst: readonly MilestoneTier[] = ["diamond", "gold", "silver", "bronze"];

export const getPlayerCardArgs = z.strictObject({ person: z.string() });

/** The website's `getPlayerCard`: the card of a person in the reader's workspace, and their week when it isn't theirs. */
export async function getPlayerCard(ctx: QueryContext, me: VerifiedMember, { person }: z.infer<typeof getPlayerCardArgs>): Promise<PlayerCardRead> {
  if (!(await cardsShownTo(ctx, me))) return { kind: "off" };
  const member = await personIn(ctx, me, person);
  if (member === null) return { kind: "no-person" };
  await followTheClock(ctx);
  const card = await playerCardOf(ctx, me.workspace, member);
  return member === me.member ? { kind: "card", card } : { kind: "card", card, week: await cardWeekOf(ctx, me.workspace, member) };
}

export const getPlayerCardEmojisArgs = getPlayerCardArgs;

/** The website's `getPlayerCardEmojis`: the emojis a person has earned, the newest first. */
export async function getPlayerCardEmojis(ctx: QueryContext, me: VerifiedMember, { person }: z.infer<typeof getPlayerCardEmojisArgs>): Promise<CardEmojisRead> {
  if (!(await cardsShownTo(ctx, me))) return { kind: "off" };
  const member = await personIn(ctx, me, person);
  if (member === null) return { kind: "no-person" };
  return { kind: "emojis", ...(await emojiStackOf(ctx, me.workspace, member, emojisOnTheCard)) };
}

export async function playerCardOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<PlayerCard> {
  const [team = null] = await personTeamsOf(ctx, workspace, person);
  return {
    ...(await faceIn(ctx, workspace, person)),
    team,
    level: (await xpLevelsShownIn(ctx, workspace)) ? await levelOf(ctx, person) : null,
    place: await placeOf(ctx, { workspace, member: person }, "week"),
    people: await peopleOf(ctx, workspace, person),
    hoggies: await hoggiesOf(ctx, person),
    medals: await medalsOf(ctx, person),
  };
}

async function cardsShownTo(ctx: QueryContext, me: VerifiedMember) {
  return (await albumShownTo(ctx, me.member)) && (await personPageDShownTo(ctx, me.member));
}

// Convex's `normalizeId` refused a string that was no members ID; here any string is a key, and one no member has is
// no person of the workspace.
async function personIn(ctx: QueryContext, me: VerifiedMember, person: string): Promise<MemberId | null> {
  const member = person as MemberId;
  return person !== "" && (await isAPersonOf(ctx, me.workspace, member)) ? member : null;
}

async function peopleOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<PlayerCard["people"]> {
  const newest = (await newestStickersOf(ctx, person, peopleSearchedForTheNewest)).slice(0, newestPeopleOnTheCard);
  return { held: (await peopleHeldBy(ctx, person)).size, newest: await Promise.all(newest.map(({ person: held }) => faceIn(ctx, workspace, held))) };
}

async function hoggiesOf(ctx: QueryContext, person: MemberId): Promise<PlayerCard["hoggies"]> {
  if (!(await hoggiesShownTo(ctx, person))) return null;
  const { hoggies, found, total } = await albumHoggiesOf(ctx, person);
  const [rarest = null] = rarestFindsIn(hoggies, 1).map(({ hoggie, name, rarity, firstAt }) => ({ hoggie, name, rarity, firstAt }));
  return { found, total, rarest };
}

async function medalsOf(ctx: QueryContext, person: MemberId): Promise<PlayerCard["medals"]> {
  const earned = await tiersTurnedBy(ctx, person);
  const highest = [...new Map(earned.map(({ milestone, tier }) => [milestone, tier])).entries()].map(([milestone, tier]) => ({ milestone, tier }));
  return { count: earned.length, best: highest.toSorted((one, other) => medalsBestFirst.indexOf(one.tier) - medalsBestFirst.indexOf(other.tier)).slice(0, medalsOnTheCard) };
}

async function cardWeekOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<CardWeek> {
  const week = await weekAt(ctx, person, ctx.now);
  const row = await weekRowOf(ctx, person, week);
  const { days, thanked, thankedBy, packsOpened = 0, kudosOfWeek } = row === null ? anEmptyWeek() : weekTallyIn(row);
  const { hugsGiven, hugsReceived } = await totalsOf(ctx, person, keyOf("week", week));
  return {
    days,
    thanked: thanked.people.length + thanked.more,
    thankedBy: thankedBy.people.length + thankedBy.more,
    packsOpened,
    hugs: hugsGiven + hugsReceived,
    kudosOfWeek: kudosOfWeek === null ? null : await publicKudosOfTheWeekShown(ctx, workspace, kudosOfWeek),
  };
}
