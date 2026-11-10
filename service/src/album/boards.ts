// The module map's skeleton of convex/album/boards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
// The thoughtful boards: who gave the most kudos awards in a period, people and company teams, ranked with ties, and
// the reader's own row and teams pinned. S9 ported the counting and the reads, today's convex/album/boards.ts over the
// service's transaction, the app's clock in place of Date.now().
import type { CompanyFace } from "../companyProfiles/faces.ts";
import { storedCompanyMatchOf } from "../companyProfiles/storedFaces.ts";
import { companyTeamsOf, type CompanyTeam, type TeamCrestArt } from "../companyProfiles/teams.ts";
import { allowanceDay, weekOf, type DayKey } from "../engine/allowance.ts";
import { ranking } from "../leaderboard/board.ts";
import { isOnTheBoards } from "../leaderboard/visibility.ts";
import { currentNameAndPictureOf, timeZoneOf, type MemberId } from "../workspace/directory.ts";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { indexOrder } from "../db/indexOrder.ts";
import { thoughtfulBoardTallies, type Doc } from "../db/schema/index.ts";
import { allTimeKey, keyOf, periods, wholeWeekBefore, type Period, type PeriodKey } from "../leaderboard/periods.ts";
import { allIn, insertInto, uniqueIn } from "./rows.ts";
import { countThoughtfulGiver } from "./thoughtfulGivers.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const boardPeriodValidator = z.union([z.literal("week"), z.literal("last-week"), z.literal("month"), z.literal("all")]);

export type BoardPeriod = z.infer<typeof boardPeriodValidator>;

export type Standing = { rank: number; tied: boolean } | { rank: null; tied: false };

export type BoardPerson = { member: MemberId; name: string | undefined; picture: string | null; face: CompanyFace | null; teams: string[]; thoughtful: number; viewer: boolean };

export type BoardTeam = { team: string; name: string; art: TeamCrestArt; thoughtful: number; mine: boolean };

export type ThoughtfulBoards = {
  people: Array<BoardPerson & Standing>;
  teams: Array<BoardTeam & Standing>;
  pinned: { me: (BoardPerson & Standing) | null; teams: Array<BoardTeam & Standing> };
  onTheBoards: boolean;
};

export type BoardViewer = { workspace: string; member: MemberId };

export type BoardPlace = { rank: number; tied: boolean; thoughtful: number };

type BoardReader = { workspace: string; member: MemberId | null };

export type AllTimeBoards = Pick<ThoughtfulBoards, "people" | "teams">;

export type BoardsAsked = { whoGave: string | null; period: BoardPeriod };

export type ThoughtfulAward = { workspace: string; giver: MemberId; day: DayKey };

type Profile = number | null;

type Giver = { person: BoardPerson; profile: Profile };

const unranked = { rank: null, tied: false } as const;

export async function countOnTheBoards(ctx: MutationContext, { workspace, giver, day }: ThoughtfulAward): Promise<void> {
  for (const period of periods) {
    const key = keyOf(period, day);
    const tally = await tallyOf(ctx, workspace, key, giver);
    if (tally === null) await firstTallyOf(ctx, { workspace, period, key, giver });
    else await ctx.tx.update(thoughtfulBoardTallies).set({ awards: tally.awards + 1 }).where(eq(thoughtfulBoardTallies._id, tally._id));
  }
}

async function firstTallyOf(ctx: MutationContext, { workspace, period, key, giver }: { workspace: string; period: Period; key: PeriodKey; giver: MemberId }) {
  await insertInto(ctx, thoughtfulBoardTallies, { workspace, period: key, giver, awards: 1 });
  if (period === "week") await countThoughtfulGiver(ctx, workspace, key);
}

export async function hasGivenAThoughtfulAward(ctx: QueryContext, workspace: string, giver: MemberId): Promise<boolean> {
  return (await tallyOf(ctx, workspace, allTimeKey, giver)) !== null;
}

const byWorkspacePeriodGiver = indexOrder(thoughtfulBoardTallies, ["workspace", "period", "giver"]);

function tallyOf(ctx: QueryContext, workspace: string, period: PeriodKey, giver: MemberId) {
  const where = and(eq(thoughtfulBoardTallies.workspace, workspace), eq(thoughtfulBoardTallies.period, period), eq(thoughtfulBoardTallies.giver, giver));
  return uniqueIn<Doc<"thoughtfulBoardTallies">>(ctx, thoughtfulBoardTallies, byWorkspacePeriodGiver, where);
}

export async function thoughtfulBoardsOf(ctx: QueryContext, viewer: BoardViewer, { whoGave, period }: BoardsAsked): Promise<ThoughtfulBoards> {
  const companyTeams = await companyTeamsOf(ctx);
  const givers = await giversOf(ctx, viewer, period, companyTeams);
  const people = placed(givers.map(({ person }) => person));
  const totals = teamTotalsOf(companyTeams, givers, await profileOf(ctx, viewer));
  const teams = placed(totals);
  const onTheBoards = await isOnTheBoards(ctx, viewer.member);
  return {
    people: whoGave === null ? people : people.filter(({ teams: theirs }) => theirs.includes(whoGave)),
    teams,
    pinned: { me: onTheBoards ? (people.find(({ viewer: isViewer }) => isViewer) ?? (await unrankedViewerOf(ctx, viewer, companyTeams))) : null, teams: myTeamsAmong(totals, teams) },
    onTheBoards,
  };
}

export async function weekPlaceOf(ctx: QueryContext, member: BoardViewer): Promise<BoardPlace | null> {
  if (!(await isOnTheBoards(ctx, member.member)) || (await currentNameAndPictureOf(ctx, member.member)) === null) return null;
  const tallies = await talliesIn(ctx, member.workspace, await weekKeyOf(ctx, member));
  const thoughtful = tallies.find(({ giver }) => giver === member.member)?.awards ?? 0;
  if (thoughtful === 0) return null;
  const others = tallies.filter(({ giver, awards }) => giver !== member.member && awards >= thoughtful);
  let [ahead, tied] = [0, false];
  for (const { giver, awards } of others) {
    if (!(await isRanked(ctx, giver))) continue;
    if (awards > thoughtful) ahead += 1;
    else tied = true;
  }
  return { rank: ahead + 1, tied, thoughtful };
}

export async function allTimeBoardsIn(ctx: QueryContext, workspace: string): Promise<AllTimeBoards> {
  const companyTeams = await companyTeamsOf(ctx);
  const givers = await giversIn(ctx, { workspace, member: null }, allTimeKey, companyTeams);
  return { people: placed(givers.map(({ person }) => person)), teams: placed(teamTotalsOf(companyTeams, givers, null)) };
}

async function giversOf(ctx: QueryContext, viewer: BoardViewer, period: BoardPeriod, companyTeams: CompanyTeam[]): Promise<Giver[]> {
  return giversIn(ctx, viewer, periodKeyOf(period, await todayOf(ctx, viewer)), companyTeams);
}

async function weekKeyOf(ctx: QueryContext, member: BoardViewer): Promise<PeriodKey> {
  return periodKeyOf("week", await todayOf(ctx, member));
}

async function todayOf(ctx: QueryContext, { member }: BoardViewer): Promise<DayKey> {
  return allowanceDay(ctx.now, (await timeZoneOf(ctx, member)) ?? undefined);
}

async function isRanked(ctx: QueryContext, giver: MemberId): Promise<boolean> {
  return (await isOnTheBoards(ctx, giver)) && (await currentNameAndPictureOf(ctx, giver)) !== null;
}

function talliesIn(ctx: QueryContext, workspace: string, period: PeriodKey) {
  return allIn<Doc<"thoughtfulBoardTallies">>(ctx, thoughtfulBoardTallies, byWorkspacePeriodGiver, and(eq(thoughtfulBoardTallies.workspace, workspace), eq(thoughtfulBoardTallies.period, period)));
}

// Convex read each giver under Promise.all; one transaction's reads run one at a time, so these run in turn, in the
// tallies' index order, which the board's ranking keeps for ties.
async function giversIn(ctx: QueryContext, reader: BoardReader, period: PeriodKey, companyTeams: CompanyTeam[]): Promise<Giver[]> {
  const givers: Giver[] = [];
  for (const { giver, awards } of await talliesIn(ctx, reader.workspace, period)) {
    const found = (await isOnTheBoards(ctx, giver)) ? await giverOf(ctx, reader, giver, awards, companyTeams) : null;
    if (found !== null) givers.push(found);
  }
  return givers;
}

function periodKeyOf(period: BoardPeriod, today: DayKey): PeriodKey {
  return period === "last-week" ? wholeWeekBefore(weekOf(today).monday).now : keyOf(period, today);
}

async function giverOf(ctx: QueryContext, reader: BoardReader, member: MemberId, thoughtful: number, companyTeams: CompanyTeam[]): Promise<Giver | null> {
  const nameAndPicture = await currentNameAndPictureOf(ctx, member);
  if (nameAndPicture === null) return null;
  const match = await storedCompanyMatchOf(ctx, reader.workspace, member);
  const profile = match?.profile ?? null;
  return { person: { member, ...nameAndPicture, face: match?.face ?? null, teams: teamsOf(companyTeams, profile), thoughtful, viewer: member === reader.member }, profile };
}

async function unrankedViewerOf(ctx: QueryContext, viewer: BoardViewer, companyTeams: CompanyTeam[]): Promise<(BoardPerson & Standing) | null> {
  const me = await giverOf(ctx, viewer, viewer.member, 0, companyTeams);
  return me === null ? null : { ...me.person, ...unranked };
}

function teamTotalsOf(companyTeams: CompanyTeam[], givers: Giver[], myProfile: Profile): BoardTeam[] {
  return companyTeams.map(({ team, name, crest, people }) => ({
    team,
    name,
    art: crest,
    thoughtful: givers.filter(({ profile }) => profile !== null && people.includes(profile)).reduce((sum, { person }) => sum + person.thoughtful, 0),
    mine: myProfile !== null && people.includes(myProfile),
  }));
}

function myTeamsAmong(totals: BoardTeam[], teams: Array<BoardTeam & Standing>): Array<BoardTeam & Standing> {
  return totals.filter(({ mine }) => mine).map((total) => teams.find(({ team }) => team === total.team) ?? { ...total, ...unranked });
}

function placed<Row extends { name: string | undefined; thoughtful: number }>(rows: Row[]): Array<Row & Standing> {
  const entries = rows.map((row, index) => ({ row, id: String(index), name: row.name ?? "", value: row.thoughtful }));
  return ranking(entries, null).rows.map(({ row, rank, tied }) => ({ ...row, rank, tied }));
}

function teamsOf(companyTeams: CompanyTeam[], profile: Profile): string[] {
  return profile === null ? [] : companyTeams.filter(({ people }) => people.includes(profile)).map(({ team }) => team);
}

async function profileOf(ctx: QueryContext, { workspace, member }: BoardViewer): Promise<Profile> {
  return (await storedCompanyMatchOf(ctx, workspace, member))?.profile ?? null;
}
