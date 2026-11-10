// The sticker book's team pages, as today's convex/stickers/teamPages.ts: each company team listed with the people the
// directory matches and the stickers held of them, the unlisted teams a crest or completion names, and each page's crest.
import { companyProfilesIn, publicNameOf, type CompanyProfile } from "../companyProfiles/matcher.ts";
import { companyTeamsOf, crestArtOf, type CompanyTeam, type TeamCrestArt } from "../companyProfiles/teams.ts";
import { crestNamed } from "../album/hoggies/catalogue.ts";
import type { CollectedCrest } from "../album/hoggies/collection.ts";
import type { MemberId, MemberRows } from "../workspace/directory.ts";
import type { AlbumOwner } from "./albums.ts";
import type { HeldSticker } from "./records.ts";
import type { QueryContext } from "../operations.ts";

export type { CollectedCrest };

export type RecordedCompletion = { team: string; name: string; crestImage?: string; at: number };

export type PageCrest = { collectedAt: number; by: "roster" | "page" };

export type PersonOnPage = { person: MemberId; profile: CompanyProfile; lead: boolean; held: boolean; heldAt: number | null };

export type UnmatchedPerson = { name: string; role: string | null };

export type TeamPageOf = {
  team: string;
  name: string;
  art: TeamCrestArt;
  mine: boolean;
  listed: boolean;
  leads: string[];
  held: number;
  total: number;
  unmatched: number;
  complete: boolean;
  people: PersonOnPage[];
  unmatchedPeople: UnmatchedPerson[];
  crest: PageCrest | null;
  completion?: { at: number } | null;
};

export type TeamPagesFrom = { members: MemberRows; stickers: HeldSticker[]; crests: CollectedCrest[]; completions?: RecordedCompletion[] };

type Held = { stickers: Map<MemberId, number>; crests: Map<string, number>; completions: Map<string, RecordedCompletion> | null };

type Company = { profiles: Map<number, CompanyProfile>; holders: Map<number, MemberId> };

export async function teamPagesOf(ctx: QueryContext, owner: AlbumOwner, { members, stickers, crests, completions }: TeamPagesFrom): Promise<TeamPageOf[]> {
  const { profiles, holders } = await companyProfilesIn(ctx, owner.workspace, members);
  const company = { profiles: new Map(profiles.map((profile) => [profile.profile, profile])), holders };
  const teams = await companyTeamsOf(ctx);
  const held: Held = {
    stickers: new Map(stickers.map(({ person, firstAt }) => [person, firstAt])),
    crests: new Map(crests.map(({ crest, collectedAt }) => [crest, collectedAt])),
    completions: completions === undefined ? null : new Map(completions.map((completion) => [completion.team, completion])),
  };
  const onPostHogCom = new Set(teams.map(({ team }) => team));
  const listed = teams.map((team) => listedPageOf(owner.member, team, company, held));
  const unlisted = [...new Set([...held.crests.keys(), ...(held.completions?.keys() ?? [])])].filter((team) => !onPostHogCom.has(team)).flatMap((team) => unlistedPageOf(team, held));
  return [...listed, ...unlisted].toSorted(mineFirstThenByName);
}

export function isFull({ held, total }: Pick<TeamPageOf, "held" | "total">) {
  return total > 0 && held === total;
}

function listedPageOf(owner: MemberId, { team, name, crest, leads, people }: CompanyTeam, { profiles, holders }: Company, held: Held): TeamPageOf {
  const onTeam = people.flatMap((id) => profiles.get(id) ?? []);
  const matched = onTeam.flatMap((profile) => {
    const person = holders.get(profile.profile);
    return person === undefined || person === owner ? [] : [personOf(person, profile, leads, held)];
  });
  const unmatched = onTeam.filter(({ profile }) => !holders.has(profile));
  const heldCount = matched.filter((person) => person.held).length;
  const { complete, ...earned } = completionOf(team, held, isFull({ held: heldCount, total: matched.length }));
  return {
    team,
    name,
    art: crest,
    mine: onTeam.some(({ profile }) => holders.get(profile) === owner),
    listed: true,
    leads: leads.flatMap((id) => profiles.get(id) ?? []).map(publicNameOf),
    held: heldCount,
    total: matched.length,
    unmatched: unmatched.length,
    complete,
    people: matched,
    unmatchedPeople: unmatched.map((profile) => ({ name: publicNameOf(profile), role: profile.role ?? null })),
    ...earned,
  };
}

function completionOf(team: string, { crests, completions }: Held, full: boolean): Pick<TeamPageOf, "complete" | "crest" | "completion"> {
  const roster = crests.get(team);
  const recorded = completions?.get(team);
  const crest = earlierCrestOf(roster === undefined ? null : { collectedAt: roster, by: "roster" }, recorded === undefined ? null : { collectedAt: recorded.at, by: "page" });
  if (completions === null) return { complete: full, crest };
  return { complete: recorded !== undefined || full, crest, completion: recorded === undefined ? null : { at: recorded.at } };
}

function earlierCrestOf(roster: PageCrest | null, page: PageCrest | null): PageCrest | null {
  if (roster === null || page === null) return roster ?? page;
  return page.collectedAt < roster.collectedAt ? page : roster;
}

function personOf(person: MemberId, profile: CompanyProfile, leads: number[], { stickers }: Held): PersonOnPage {
  const heldAt = stickers.get(person) ?? null;
  return { person, profile, lead: leads.includes(profile.profile), held: heldAt !== null, heldAt };
}

function unlistedPageOf(team: string, held: Held): TeamPageOf[] {
  const named = unlistedNameOf(team, held);
  if (named === null) return [];
  const { complete, ...earned } = completionOf(team, held, false);
  return [{ team, ...named, mine: false, listed: false, leads: [], held: 0, total: 0, unmatched: 0, complete, people: [], unmatchedPeople: [], ...earned }];
}

function unlistedNameOf(team: string, { completions }: Held): Pick<TeamPageOf, "name" | "art"> | null {
  const recorded = completions?.get(team);
  if (recorded !== undefined) return { name: recorded.name, art: crestArtOf(team, recorded.crestImage) };
  const entry = crestNamed(team);
  return entry === undefined ? null : { name: entry.name, art: { kind: "crest", slug: team } };
}

function mineFirstThenByName(first: TeamPageOf, second: TeamPageOf) {
  return Number(second.mine) - Number(first.mine) || first.name.localeCompare(second.name);
}
