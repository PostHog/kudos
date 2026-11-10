// The module map's skeleton of convex/website/linkCardStats.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { emojiArtPictureOf } from "../album/emojiCatalogue.ts";
import { rarestFindsIn, type AlbumHoggie, type AlbumHoggies } from "../album/albumHoggies.ts";
import { type StoredHolder } from "../companyProfiles/storedFaces.ts";
import type { TeamCrestArt } from "../companyProfiles/teams.ts";
import type { PersonTeam } from "../album/personPage.ts";
import type { Rarity } from "../album/hoggies/catalogue.ts";
import { hoggieSharePictureOf } from "../album/items/shareArt.ts";
import { type BoardPlace, type Boards, type Standing } from "../leaderboard/boards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

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
};

const mostPictures = 9;

export function cardReadsOf(ctx: QueryContext, workspace: string, origin: string): CardReads {
  throw notPorted("website.linkCardStats.cardReadsOf");
}

export async function personStatsOf(ctx: QueryContext, { workspace, origin, boards, hoggiesOf }: CardReads, person: MemberId, level: number | null, teams: PersonTeam[]): Promise<PersonStats> {
  throw notPorted("website.linkCardStats.personStatsOf");
}

export async function teamStatsOf(reads: CardReads, team: CompanyTeamRow): Promise<TeamStats> {
  const { origin, boards } = reads;
  const { people, teams } = await boards();
  return {
    place: kudosGivenPlaceOf(teams.kudosGiven.find((row) => row.team === team.team)),
    saidThanks: people.kudosGiven.filter((giver) => giver.teams.includes(team.team)).length,
    rarest: cardHoggiesOf(await foundByTheTeam(reads, team), origin),
    asOf: Date.now(),
  };
}

export function crestPictureOf(origin: string, art: TeamCrestArt): string | null {
  if (art === null) return null;
  return art.kind === "crest" ? `${origin}${emojiArtPictureOf("team", art.slug)}` : art.url;
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
