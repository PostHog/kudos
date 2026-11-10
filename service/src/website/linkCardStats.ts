// The stats a rich link card shows: a person's teams, way to the next level, place, hoggies and people; a team's place,
// thanks and rarest finds. Reads shared across one message's cards are made once. Today's
// convex/website/linkCardStats.ts, with the operation's instant where it read the wall clock.
import { emojiArtPictureOf } from "../album/emojiCatalogue.ts";
import { teamEmojiOf } from "../album/earnedEmojis.ts";
import { albumHoggiesOf, rarestFindsIn, type AlbumHoggie, type AlbumHoggies } from "../album/albumHoggies.ts";
import { peopleHeldBy } from "../album/stickers.ts";
import { storedHoldersIn, type StoredHolder } from "../companyProfiles/storedFaces.ts";
import type { TeamCrestArt } from "../companyProfiles/teams.ts";
import type { PersonTeam } from "../album/personPage.ts";
import type { Rarity } from "../album/hoggies/catalogue.ts";
import { hoggiesShownTo } from "../album/hoggies/flag.ts";
import { hoggieSharePictureOf } from "../album/items/shareArt.ts";
import { boardsOf, type BoardPlace, type Boards, type Standing } from "../leaderboard/boards.ts";
import { standingOf } from "../progression/progression.ts";
import { xpToReach } from "../progression/levels.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export type CardHoggie = { hoggie: string; name: string; rarity: Rarity; picture: string };

export type LevelWay = { level: number; share: number };

export type CardTeam = { name: string; emoji: string | null };

export type PersonStats = { person: MemberId; teams: CardTeam[]; way: LevelWay | null; place: BoardPlace | null; hoggies: { found: number; total: number } | null; rarest: CardHoggie[]; people: number; asOf: number };

export type TeamStats = { place: BoardPlace | null; saidThanks: number; rarest: CardHoggie[]; asOf: number };

type Found = Pick<AlbumHoggie, "hoggie" | "name" | "rarity" | "found" | "firstAt">;

type CompanyTeamRow = { team: string; people: number[] };

export type CardReads = {
  workspace: string;
  origin: string;
  boards: () => Promise<Boards>;
  holders: () => Promise<Map<number, StoredHolder>>;
  hoggiesOf: (member: MemberId) => Promise<AlbumHoggies | null>;
  /** The reading operation's instant, which the stats are as of. */
  now: number;
};

const mostPictures = 9;

const mostCollectionsReadPerMessage = 20;

export function cardReadsOf(ctx: QueryContext, workspace: string, origin: string): CardReads {
  let boards: Promise<Boards> | undefined;
  let holders: Promise<Map<number, StoredHolder>> | undefined;
  const collections = new Map<MemberId, Promise<AlbumHoggies | null>>();
  const hoggiesOf = (member: MemberId) => {
    const read = collections.get(member);
    if (read !== undefined) return read;
    if (collections.size >= mostCollectionsReadPerMessage) return Promise.resolve(null);
    return collections.set(member, shownHoggiesOf(ctx, member)).get(member)!;
  };
  return { workspace, origin, boards: () => (boards ??= allTimeBoardsOf(ctx, workspace)), holders: () => (holders ??= storedHoldersIn(ctx, workspace)), hoggiesOf, now: ctx.now };
}

function allTimeBoardsOf(ctx: QueryContext, workspace: string): Promise<Boards> {
  return boardsOf(ctx, { workspace, member: null }, { period: "all", team: null });
}

async function shownHoggiesOf(ctx: QueryContext, member: MemberId): Promise<AlbumHoggies | null> {
  return (await hoggiesShownTo(ctx, member)) ? albumHoggiesOf(ctx, member) : null;
}

export async function personStatsOf(ctx: QueryContext, { workspace, origin, boards, hoggiesOf, now }: CardReads, person: MemberId, level: number | null, teams: PersonTeam[]): Promise<PersonStats> {
  const hoggies = await hoggiesOf(person);
  return {
    person,
    teams: await cardTeamsOf(ctx, workspace, teams),
    way: level === null ? null : await levelWayOf(ctx, person, level),
    place: kudosGivenPlaceOf((await boards()).people.kudosGiven.find(({ member }) => member === person)),
    hoggies: hoggies === null ? null : { found: hoggies.found, total: hoggies.total },
    rarest: cardHoggiesOf(hoggies?.hoggies ?? [], origin),
    people: (await peopleHeldBy(ctx, person)).size,
    asOf: now,
  };
}

export async function teamStatsOf(reads: CardReads, team: CompanyTeamRow): Promise<TeamStats> {
  const { origin, boards, now } = reads;
  const { people, teams } = await boards();
  return {
    place: kudosGivenPlaceOf(teams.kudosGiven.find((row) => row.team === team.team)),
    saidThanks: people.kudosGiven.filter((giver) => giver.teams.includes(team.team)).length,
    rarest: cardHoggiesOf(await foundByTheTeam(reads, team), origin),
    asOf: now,
  };
}

async function cardTeamsOf(ctx: QueryContext, workspace: string, teams: PersonTeam[]): Promise<CardTeam[]> {
  const shown: CardTeam[] = [];
  for (const { team, name, art } of teams) {
    const emoji = await teamEmojiOf(ctx, workspace, { team, art });
    shown.push({ name, emoji: emoji?.inSlack ? emoji.name : null });
  }
  return shown;
}

export function crestPictureOf(origin: string, art: TeamCrestArt): string | null {
  if (art === null) return null;
  return art.kind === "crest" ? `${origin}${emojiArtPictureOf("team", art.slug)}` : art.url;
}

async function levelWayOf(ctx: QueryContext, person: MemberId, level: number): Promise<LevelWay> {
  const { xp } = await standingOf(ctx, person);
  const [startsAt, nextAt] = [xpToReach(level), xpToReach(level + 1)];
  return { level, share: Math.min(1, Math.max(0, (xp - startsAt) / (nextAt - startsAt))) };
}

function kudosGivenPlaceOf(row: (Standing & { counts: { kudosGiven: number } }) | undefined): BoardPlace | null {
  return row === undefined ? null : { rank: row.rank, tied: row.tied, kudosGiven: row.counts.kudosGiven };
}

async function foundByTheTeam({ holders, hoggiesOf }: CardReads, team: CompanyTeamRow): Promise<Found[]> {
  const matched = await holders();
  const members = team.people.flatMap((profile) => matched.get(profile)?.member ?? []);
  const found = await Promise.all(members.map(async (member) => ((await hoggiesOf(member))?.hoggies ?? []).filter((hoggie) => hoggie.found)));
  return [...new Map(found.flat().map((hoggie) => [hoggie.hoggie, hoggie])).values()];
}

function cardHoggiesOf(hoggies: Found[], origin: string): CardHoggie[] {
  return rarestFindsIn(hoggies, mostPictures).map(({ hoggie, name, rarity }) => ({ hoggie, name, rarity, picture: `${origin}${hoggieSharePictureOf(hoggie)}` }));
}
