// Team pages completed by stickers, as today's convex/stickers/completions.ts: after new stickers, each collector's full
// team pages not yet recorded are recorded, 25 a job, with the award that completed each; each award publishes
// `teamPagesCompleted`, the member is told only after their first check finished, and the achievements count them.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { countTeamPagesCompleted, type CompletedUnder } from "../achievements/achievements.ts";
import { crestsCollectedBy } from "../album/hoggies/collection.ts";
import { crestsShownTo } from "../album/hoggies/flag.ts";
import type { KudosGivenEvent, TeamPagesCompletedEvent } from "../bus/events.ts";
import { crestImagesOf } from "../companyProfiles/teams.ts";
import { teamPageChecks, teamPageCompletions } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import { awardIdValidator, latestInAwardOrder, messageOfAward, type AwardId, type LatestInAwardOrder } from "../engine/awards.ts";
import type { CompletedTeam } from "../feedback/notify.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { zv } from "../values.ts";
import { memberRowsIn, type MemberId } from "../workspace/directory.ts";
import { completionRecordsInOrder, teamsCompletedBy } from "./completionRecords.ts";
import { teamSpiritAppliesTo } from "./flag.ts";
import { stickersNewestFirst, type HeldSticker } from "./records.ts";
import { isFull, teamPagesOf, type CollectedCrest, type TeamPageOf } from "./teamPages.ts";

export const completionsPerMutation = 25;

const checkValidator = z.strictObject({ workspace: z.string(), member: zv.id("members"), award: awardIdValidator, at: zv.number() });

type Check = z.infer<typeof checkValidator>;

export type NewSticker = { member: MemberId; award: AwardId };

type DuePage = { page: TeamPageOf; completing: { award: AwardId; at: number } };

export async function checkTeamPagesAfter(ctx: MutationContext, { workspace, at }: KudosGivenEvent, newStickers: NewSticker[]): Promise<void> {
  const awardOf = new Map<MemberId, AwardId>();
  for (const { member, award } of newStickers) if (!awardOf.has(member)) awardOf.set(member, award);
  for (const [member, award] of awardOf) await ctx.jobs.enqueue(checkTeamPagesJob, { check: { workspace, member, award, at } });
}

export const checkTeamPagesArgs = z.strictObject({ check: checkValidator });

export async function checkTeamPages(ctx: MutationContext, { check }: z.infer<typeof checkTeamPagesArgs>): Promise<void> {
  if (!(await teamSpiritAppliesTo(ctx, check.member))) return;
  const roster = await rosterCrestsOf(ctx, check.member);
  const { pages: due, held } = await fullUnrecordedPages(ctx, check, roster);
  const recorded = due.slice(0, completionsPerMutation);
  const finished = recorded.length === due.length;
  const told = await toldAfterTheFirstCheck(ctx, check, finished);
  const completed = await recordCompletions(ctx, check, await withCompletingAwards(ctx, recorded, held), { told, roster });
  await countTeamPagesCompleted(ctx, check, await completionRecordsInOrder(ctx, check.member), told ? completed : new Map());
  if (!finished) await ctx.jobs.enqueue(checkTeamPagesJob, { check });
}

export const checkTeamPagesJob = mutationJob("stickers.completions.checkTeamPages", checkTeamPagesArgs, checkTeamPages);

async function rosterCrestsOf(ctx: QueryContext, member: MemberId): Promise<CollectedCrest[]> {
  return (await crestsShownTo(ctx, member)) ? crestsCollectedBy(ctx, member) : [];
}

async function toldAfterTheFirstCheck(ctx: MutationContext, { member, at }: Check, finished: boolean): Promise<boolean> {
  const rows = await ctx.tx.select({ _id: teamPageChecks._id, finished: teamPageChecks.finished }).from(teamPageChecks).where(eq(teamPageChecks.member, member)).limit(2);
  const first = unique("teamPageChecks", rows);
  if (first === null) await ctx.tx.insert(teamPageChecks).values({ ...ctx.newRow(), member, at, finished });
  else if (!first.finished && finished) await ctx.tx.update(teamPageChecks).set({ finished }).where(eq(teamPageChecks._id, first._id));
  return first?.finished === true;
}

type HeldStickers = Map<MemberId, HeldSticker>;

async function fullUnrecordedPages(ctx: QueryContext, { workspace, member }: Check, crests: CollectedCrest[]): Promise<{ pages: TeamPageOf[]; held: HeldStickers }> {
  const stickers = await stickersNewestFirst(ctx, member);
  const pages = await teamPagesOf(ctx, { member, workspace }, { members: await memberRowsIn(ctx, workspace), stickers, crests });
  const recorded = new Set(await teamsCompletedBy(ctx, member));
  const full = pages.filter((page) => page.listed && isFull(page) && !recorded.has(page.team)).toSorted(byNameThenTeam);
  return { pages: full, held: new Map(stickers.map((sticker) => [sticker.person, sticker])) };
}

async function withCompletingAwards(ctx: QueryContext, pages: TeamPageOf[], held: HeldStickers): Promise<DuePage[]> {
  const latestOf = latestInAwardOrder(ctx);
  const due: DuePage[] = [];
  for (const page of pages) due.push({ page, completing: await completingAwardOf(page, held, latestOf) });
  return due;
}

async function completingAwardOf({ people }: TeamPageOf, held: HeldStickers, latestOf: LatestInAwardOrder) {
  const stickers = people.flatMap(({ person }) => held.get(person) ?? []);
  const at = Math.max(...stickers.map(({ firstAt }) => firstAt));
  const latest = [...new Set(stickers.filter(({ firstAt }) => firstAt === at).map(({ firstAward }) => firstAward))];
  const award = latest.length === 1 ? latest[0]! : ((await latestOf(latest)) ?? latest[0]!);
  return { award, at };
}

function byNameThenTeam(first: TeamPageOf, second: TeamPageOf) {
  return first.name.localeCompare(second.name) || first.team.localeCompare(second.team);
}

type Recording = { told: boolean; roster: CollectedCrest[] };

async function recordCompletions(ctx: MutationContext, { workspace, member }: Check, due: DuePage[], { told, roster }: Recording): Promise<CompletedUnder> {
  if (due.length === 0) return new Map();
  const crestImages = await crestImagesOf(ctx);
  const completed = new Map<AwardId, { at: number; teams: CompletedTeam[]; counted: Array<{ team: string; people: number }> }>();
  for (const { page, completing } of due) {
    const crestImage = crestImages.get(page.team);
    await ctx.tx.insert(teamPageCompletions).values({ ...ctx.newRow(), member, team: page.team, name: page.name, ...(crestImage !== undefined && { crestImage }), ...completing, people: page.total, told });
    const under = completed.get(completing.award) ?? { at: completing.at, teams: [], counted: [] };
    under.teams.push({ team: page.team, name: page.name, crestEarned: !rosterHeldBy(roster, page.team, completing.at) });
    under.counted.push({ team: page.team, people: page.total });
    completed.set(completing.award, under);
  }
  for (const [award, { at, counted }] of completed) {
    const message = await messageOfAward(ctx, award);
    if (message === null) continue;
    const event: TeamPagesCompletedEvent = { type: "teamPagesCompleted", workspace, member, message, award, teams: counted, at, told };
    await ctx.publish(event);
  }
  return new Map([...completed].map(([award, { at, teams }]) => [award, { at, teams }]));
}

function rosterHeldBy(roster: CollectedCrest[], team: string, at: number) {
  return roster.some(({ crest, collectedAt }) => crest === team && collectedAt <= at);
}
