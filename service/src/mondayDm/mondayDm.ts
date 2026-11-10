// The Monday DM, as today's convex/mondayDm/mondayDm.ts: an hourly sweep books each member on the Monday path a DM
// for the coming Monday at 9:00 in their own time zone, and each try reads its sections, keeps what it will send and
// hands it to the Slack side (slack/mondayDm.ts), which reports back whether to try again or how it ended.
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { shownWaitingHoggiesOf } from "../album/items/ledger.ts";
import { reportMondayDmSent } from "../analytics/isolatedUsage.ts";
import type { Id } from "../db/columns.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { paginate } from "../db/page.ts";
import type { Doc } from "../db/schema/index.ts";
import { mondayDms } from "../db/schema/mondayDm.ts";
import { questStarts } from "../db/schema/quests.ts";
import { allowanceDay, wallClockAt, weekOf, type DayKey } from "../engine/allowance.ts";
import { dmLinksFor, type DmLinks } from "../feedback/dmLinks.ts";
import { settingsFooterFor } from "../feedback/settingsFooter.ts";
import { hugsSectionFor, hugsSentInTheMondayDm, mondayAfter, type HugsSection } from "../hugs/recap.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { onTheMondayPath } from "../quests/flag.ts";
import { questsSectionFor, type QuestsSection } from "../quests/mondaySection.ts";
import { sendMondayDmJob } from "../slack/mondayDm.ts";
import { convexActionTimeLimitMs } from "../slack/strandedJobs.ts";
import { zv } from "../values.ts";
import { welcomeOf } from "../welcome/welcome.ts";
import { chatUserOf, isMember, timeZoneOf, type MemberId } from "../workspace/directory.ts";
import { ensureMondayDmsOfHugWeeksJob } from "./hugWeeks.ts";
import { hypeNudgeFor, hypeNudgeOf, keepHypeNudge } from "./hypeNudge.ts";
import { questsCopyOf, type QuestsCopy } from "./questsCopy.ts";
import type { MondayDmContent, MondayDmSection, SentMondayDmSection } from "./records.ts";
import { insertMondayDm, mondayDmOf, mondayDmRow, patchMondayDm, type MondayDmRow } from "./rows.ts";

export type MondayQuests = QuestsCopy & { waiting: boolean; links: DmLinks | null };

export type MondayDm = { dm: Id<"mondayDms">; workspace: string; user: string; nudge: string | null } & MondayDmContent;

type Sections = { hugs: HugsSection | null; quests: QuestsSection | null };

const noSections: Sections = { hugs: null, quests: null };
const startsPerSweep = 100;
const strandedPerSweep = 100;
const dueHour = 9;
// Convex's `.query("questStarts").paginate(...)`: the table in creation order.
const questStartsInCreationOrder = indexOrder(questStarts, []);

export const ensureMondayDmsArgs = z.strictObject({ cursor: z.optional(z.string()) });
export async function ensureMondayDms(ctx: MutationContext, { cursor }: z.infer<typeof ensureMondayDmsArgs>): Promise<void> {
  if (cursor === undefined) await startTheSweep(ctx);
  const starts = await paginate<Doc<"questStarts">>(ctx.tx, { table: questStarts, order: questStartsInCreationOrder }, { numItems: startsPerSweep, cursor: cursor ?? null });
  for (const { member } of starts.page) if (await isTheMondayDmFor(ctx, member)) await ensureMondayDm(ctx, member, ctx.now);
  if (!starts.isDone) await ctx.jobs.enqueue(ensureMondayDmsJob, { cursor: starts.continueCursor }, { after: 0 });
}
export const ensureMondayDmsJob = mutationJob("mondayDm.mondayDm.ensureMondayDms", ensureMondayDmsArgs, ensureMondayDms);

const tryArgs = { dm: zv.id("mondayDms"), attempt: zv.number() };

export const startMondayDmArgs = z.strictObject(tryArgs);
export async function startMondayDm(ctx: MutationContext, { dm, attempt }: z.infer<typeof startMondayDmArgs>): Promise<MondayDm | null> {
  const row = await awaitingTry(ctx, dm, attempt - 1);
  if (row === null) return null;
  const dueAt = await dueAtOf(ctx, row.member, row.monday);
  if (dueAt > ctx.now) return scheduleTry(ctx, dm, dueAt, attempt);
  const sections = (await isMember(ctx, row.member)) ? await sectionsOf(ctx, row) : noSections;
  const sent = sectionNamesOf(sections);
  if (sent.length === 0) {
    await patchMondayDm(ctx.tx, dm, { state: "skipped" });
    return null;
  }
  const { workspace, user } = await chatUserOf(ctx, row.member);
  const content = await contentOf(ctx, workspace, row.member, sections);
  const nudge = sections.quests === null ? null : await hypeNudgeFor(ctx, row.member);
  await keepHypeNudge(ctx, dm, nudge);
  await patchMondayDm(ctx.tx, dm, { tries: attempt, dueAt: ctx.now, sections: sent, content });
  return { dm, workspace, user, nudge, ...content };
}

export const mondayDmLaterArgs = z.strictObject({ ...tryArgs, retry: z.strictObject({ at: zv.number(), attempt: zv.number() }) });
export async function mondayDmLater(ctx: MutationContext, { dm, attempt, retry }: z.infer<typeof mondayDmLaterArgs>): Promise<void> {
  if ((await awaitingTry(ctx, dm, attempt)) === null) return;
  await patchMondayDm(ctx.tx, dm, { tries: retry.attempt - 1 });
  await scheduleTry(ctx, dm, retry.at, retry.attempt);
}

export const mondayDmEndedArgs = z.strictObject({ ...tryArgs, outcome: z.union([z.literal("delivered"), z.literal("gone"), z.literal("failed")]) });
export async function mondayDmEnded(ctx: MutationContext, { dm, attempt, outcome }: z.infer<typeof mondayDmEndedArgs>): Promise<void> {
  const row = await awaitingTry(ctx, dm, attempt);
  if (row === null) return;
  const delivered = outcome === "delivered";
  await patchMondayDm(ctx.tx, dm, { state: delivered ? "sent" : "failed" });
  if (delivered) await reportDelivered(ctx, row);
}

async function reportDelivered(ctx: MutationContext, { _id, member, monday, sections = [] }: MondayDmRow) {
  const { workspace } = await chatUserOf(ctx, member);
  await reportMondayDmSent(ctx, { workspace, member, sections: [...sections, ...(await nudgeSectionOf(ctx, _id))], at: ctx.now });
  if (sections.includes("hugs")) await hugsSentInTheMondayDm(ctx, member, monday);
}

async function nudgeSectionOf(ctx: QueryContext, dm: Id<"mondayDms">): Promise<SentMondayDmSection[]> {
  return (await hypeNudgeOf(ctx, dm)) === null ? [] : ["nudge"];
}

async function isTheMondayDmFor(ctx: MutationContext, member: MemberId) {
  return (await isMember(ctx, member)) && (await onTheMondayPath(ctx, member));
}

async function ensureMondayDm(ctx: MutationContext, member: MemberId, at: number) {
  const timeZone = (await timeZoneOf(ctx, member)) ?? undefined;
  await ensureMondayDmOn(ctx, member, await comingMondayOf(ctx, member, allowanceDay(at, timeZone), timeZone));
}

export async function ensureMondayDmOn(ctx: MutationContext, member: MemberId, monday: DayKey): Promise<void> {
  if ((await mondayDmOf(ctx, member, monday)) !== null) return;
  const dueAt = await dueAtOf(ctx, member, monday);
  const dm = await insertMondayDm(ctx, { member, monday, state: "scheduled", dueAt, tries: 0 });
  await ctx.jobs.enqueue(sendMondayDmJob, { dm, attempt: 1 }, { at: dueAt });
}

async function comingMondayOf(ctx: QueryContext, member: MemberId, today: DayKey, timeZone: string | undefined): Promise<DayKey> {
  const { monday } = weekOf(today);
  return monday === today && (await welcomeOn(ctx, member, today, timeZone)) === null ? today : mondayAfter(monday);
}

async function welcomeOn(ctx: QueryContext, member: MemberId, day: DayKey, timeZone: string | undefined): Promise<Doc<"welcomes"> | null> {
  const welcome = await welcomeOf(ctx, member);
  return welcome !== null && allowanceDay(welcome._creationTime, timeZone) === day ? welcome : null;
}

async function sectionsOf(ctx: MutationContext, { member, monday }: MondayDmRow): Promise<Sections> {
  const hugs = await hugsSectionFor(ctx, member, monday);
  if ((await welcomeOn(ctx, member, monday, (await timeZoneOf(ctx, member)) ?? undefined)) !== null) return { ...noSections, hugs };
  return { hugs, quests: await questsSectionFor(ctx, member, ctx.now) };
}

function sectionNamesOf({ hugs, quests }: Sections): MondayDmSection[] {
  return [...(hugs === null ? [] : ["hugs" as const]), ...(quests === null ? [] : ["quests" as const])];
}

async function contentOf(ctx: QueryContext, workspace: string, member: MemberId, { hugs, quests }: Sections): Promise<MondayDmContent> {
  return { hugs, quests: await mondayQuestsOf(ctx, workspace, member, quests), footer: hugs === null ? null : await settingsFooterFor(ctx, member) };
}

async function mondayQuestsOf(ctx: QueryContext, workspace: string, member: MemberId, quests: QuestsSection | null): Promise<MondayQuests | null> {
  if (quests === null) return null;
  const links = await dmLinksFor(ctx, workspace, member, "monday-dm");
  const waiting = await shownWaitingHoggiesOf(ctx, member, links);
  return { ...questsCopyOf(quests, waiting), waiting: waiting !== 0, links };
}

async function scheduleTry(ctx: MutationContext, dm: Id<"mondayDms">, dueAt: number, attempt: number): Promise<null> {
  await patchMondayDm(ctx.tx, dm, { dueAt });
  await ctx.jobs.enqueue(sendMondayDmJob, { dm, attempt }, { at: dueAt });
  return null;
}

async function startTheSweep(ctx: MutationContext) {
  await settleStrandedStarts(ctx);
  await ctx.jobs.enqueue(ensureMondayDmsOfHugWeeksJob, {}, { after: 0 });
}

// Convex's `by_state_due` index: a DM still scheduled whose try was due longer ago than an action may run.
async function settleStrandedStarts(ctx: MutationContext) {
  const stranded = await ctx.tx
    .select()
    .from(mondayDms)
    .where(and(eq(mondayDms.state, "scheduled"), lt(mondayDms.dueAt, ctx.now - convexActionTimeLimitMs)))
    .orderBy(mondayDms.state, mondayDms.dueAt, mondayDms._creationTime, mondayDms._id)
    .limit(strandedPerSweep);
  for (const row of stranded) await settleStrandedStart(ctx, toDocument<MondayDmRow>(mondayDms, row));
}

async function settleStrandedStart(ctx: MutationContext, row: MondayDmRow) {
  if (row.tries > 0) return patchMondayDm(ctx.tx, row._id, { state: "failed" });
  await scheduleTry(ctx, row._id, ctx.now, 1);
}

async function awaitingTry(ctx: QueryContext, dm: Id<"mondayDms">, tries: number): Promise<MondayDmRow | null> {
  const row = await mondayDmRow(ctx.tx, dm);
  return row?.state === "scheduled" && row.tries === tries ? row : null;
}

async function dueAtOf(ctx: QueryContext, member: MemberId, monday: DayKey) {
  return wallClockAt(monday, dueHour, (await timeZoneOf(ctx, member)) ?? undefined);
}
