import { windowOf } from "./board.ts";
import type { Period } from "./periods.ts";

export type Tally = { kudos: number; givers: number };

export type GroupFacts<G extends string> = { group: G; name: string; members: number; now: Tally; before: Tally };

export type GroupsBoardFacts<G extends string> = { period: Period; groups: Array<GroupFacts<G>>; viewerGroup: G | null; best: number | null };

export type GroupsBoardRow<G extends string> = {
  position: number;
  rank: number;
  tied: boolean;
  group: G;
  name: string;
  perMember: number;
  participation: number;
  kudos: number;
  members: number;
  mine: boolean;
  climbed: number | null;
};

export type GroupsStanding = { kind: "ranked"; position: number; rank: number } | { kind: "not-listed" } | { kind: "no-group" };

export type GroupImprovement = { gain: number; places?: number } | { best: number };

export type MostImproved<G extends string> = { group: G; name: string; gain: number };

export type GroupsBoard<G extends string> = {
  rows: Array<GroupsBoardRow<G>>;
  window: number[];
  standing: GroupsStanding;
  improvement: GroupImprovement | null;
  mostImproved: MostImproved<G> | null;
};

type Scored<G extends string> = { group: G; name: string; members: number; perMember: number; participation: number; kudos: number };

type Placed<G extends string> = Scored<G> & { position: number; rank: number; tied: boolean };

export const fewestMembersListed = 3;

export function groupsBoard<G extends string>({ period, groups, viewerGroup, best }: GroupsBoardFacts<G>): GroupsBoard<G> {
  const listed = groups.filter(({ members }) => members >= fewestMembersListed);
  const rows = placed(listed.map((facts) => scored(facts, facts.now)));
  const compared = period !== "all";
  const climbed = compared ? placesClimbed(rows, placed(listed.map((facts) => scored(facts, facts.before)))) : new Map<G, number>();
  const mine = rows.find(({ group }) => group === viewerGroup);
  const viewerFacts = listed.find(({ group }) => group === viewerGroup);
  return {
    rows: rows.map((row) => ({ ...row, mine: row.group === viewerGroup, climbed: climbed.get(row.group) ?? null })),
    window: windowOf(rows.length, mine?.position ?? 0),
    standing: mine === undefined ? (viewerGroup === null ? { kind: "no-group" } : { kind: "not-listed" }) : { kind: "ranked", position: mine.position, rank: mine.rank },
    improvement: compared && viewerFacts !== undefined ? improvementOf(viewerFacts, climbed.get(viewerFacts.group), best) : null,
    mostImproved: compared ? mostImprovedOf(listed) : null,
  };
}

function scored<G extends string>({ group, name, members }: GroupFacts<G>, { kudos, givers }: Tally): Scored<G> {
  return { group, name, members, perMember: perPerson(kudos, members), participation: Math.floor((givers * 100) / members), kudos };
}

function placed<G extends string>(groups: Array<Scored<G>>): Array<Placed<G>> {
  const ordered = groups.toSorted(byStandingThenName);
  return ordered.map((group, index) => ({
    ...group,
    position: index + 1,
    rank: ordered.findIndex((other) => sameStanding(other, group)) + 1,
    tied: ordered.some((other) => other !== group && sameStanding(other, group)),
  }));
}

function placesClimbed<G extends string>(now: Array<Placed<G>>, before: Array<Placed<G>>): Map<G, number> {
  const positionBefore = new Map(before.map(({ group, position }) => [group, position]));
  return new Map(now.flatMap(({ group, position }) => climbOf(group, positionBefore.get(group), position)));
}

function climbOf<G extends string>(group: G, before: number | undefined, now: number): Array<[G, number]> {
  return before !== undefined && before > now ? [[group, before - now]] : [];
}

function improvementOf<G extends string>(facts: GroupFacts<G>, places: number | undefined, best: number | null): GroupImprovement | null {
  const gain = gainOf(facts);
  if (gain > 0) return places === undefined ? { gain } : { gain, places };
  return best === null || best === 0 ? null : { best: perPerson(best, facts.members) };
}

function mostImprovedOf<G extends string>(listed: Array<GroupFacts<G>>): MostImproved<G> | null {
  const gains = listed.map((facts) => ({ group: facts.group, name: facts.name, gain: gainOf(facts) })).filter(({ gain }) => gain > 0);
  return gains.toSorted((a, b) => b.gain - a.gain || byName(a, b))[0] ?? null;
}

function gainOf({ members, now, before }: GroupFacts<string>) {
  return perPerson(now.kudos - before.kudos, members);
}

function perPerson(kudos: number, members: number) {
  return Math.round((kudos * 10) / members) / 10;
}

function sameStanding(a: Scored<string>, b: Scored<string>) {
  return a.perMember === b.perMember && a.participation === b.participation && a.kudos === b.kudos;
}

function byStandingThenName(a: Scored<string>, b: Scored<string>) {
  return b.perMember - a.perMember || b.participation - a.participation || b.kudos - a.kudos || byName(a, b);
}

function byName(a: { name: string; group: string }, b: { name: string; group: string }) {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.group.localeCompare(b.group);
}
