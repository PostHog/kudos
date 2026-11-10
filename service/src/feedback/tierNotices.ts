// The notices of tiers a member earned: beside the kudos that earned them, as a summary once the book opens or a
// replayed batch completes, and in public for the ladders told publicly. Ported from convex/feedback/tierNotices.ts.
import { and, asc, eq } from "drizzle-orm";
import { achievementsApplyIn } from "../achievements/flag.ts";
import { isToldPublicly, ladders, tierNameOf, tierRefValidator, type TierRef } from "../achievements/ladders.ts";
import type { BatchId } from "../achievements/replay.ts";
import { laddersShownTo } from "../achievements/shown.ts";
import { everyTierEarnedBy } from "../achievements/tiers.ts";
import { unlockOpenedEventValidator } from "../bus/events.ts";
import { toDocument, fromDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { paginate } from "../db/page.ts";
import { bookBatches } from "../db/schema/achievements.ts";
import { tierNotices, tierSummaries } from "../db/schema/feedback.ts";
import type { Doc } from "../db/schema/index.ts";
import { unlockLaunches } from "../db/schema/unlocks.ts";
import { members } from "../db/schema/workspace.ts";
import { unique } from "../db/unique.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { publishHomeJob } from "../slack/appHome.ts";
import { openedAtOf } from "../unlocks/unlocks.ts";
import { zv } from "../values.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import { notify, type CompletedTeam } from "./notify.ts";
import { announce, setPublicSection, type PublicSection } from "./publicReplies.ts";
import { isOpened } from "./unlockFilter.ts";
import { z } from "zod";

export const tierNoticeValidator = z.strictObject({
  member: zv.id("members"),
  workspace: z.string(),
  conversation: z.string(),
  message: z.string(),
  tiers: z.array(tierRefValidator),
});

export const tierSummaryValidator = z.strictObject({
  member: zv.id("members"),
  workspace: z.string(),
  tiers: z.array(tierRefValidator),
  batch: z.optional(zv.id("bookBatches")),
});

type BatchTelling = { batch: BatchId; announced: boolean };

export type TiersEarned = { member: MemberId; message: MessageRef; at: number; earned: TierRef[]; completed?: CompletedTeam[] };

const membersPerPage = 100;
const membersByUser = indexOrder(members, ["workspace", "user"]);

export async function tellTiersEarned(ctx: MutationContext, { member, message, at, earned, completed = [] }: TiersEarned): Promise<void> {
  const { untold, tiers } = await tiersToTellUnder(ctx, { member, message, at, earned });
  if (untold.length === 0 && completed.length === 0) return;
  await notify(ctx, member, { kind: "tiers-earned", tiers: untold, ...(completed.length > 0 && { teams: completed }) }, message);
  if (!untold.some(isToldPublicly)) return;
  const { user } = await chatUserOf(ctx, member);
  await setPublicSection(ctx, message, tierSection(member, user, tiers.filter(isToldPublicly)));
}

async function tiersToTellUnder(ctx: MutationContext, { member, message, at, earned }: TiersEarned): Promise<{ untold: TierRef[]; tiers: TierRef[] }> {
  const nothing = { untold: [], tiers: [] };
  if (earned.length === 0) return nothing;
  if (!(await wasOpenedBy(ctx, member, at))) {
    await tellUntoldTiers(ctx, member);
    return nothing;
  }
  const notice = await tierNoticeRow(ctx, member, message);
  const told = notice?.tiers ?? [];
  const untold = earned.filter((tier) => !told.some((each) => isSameTier(each, tier)));
  if (untold.length === 0) return nothing;
  const tiers = [...told, ...untold];
  if (notice === null) await ctx.tx.insert(tierNotices).values(fromDocument(tierNotices, { ...ctx.newRow(), member, ...message, tiers }) as typeof tierNotices.$inferInsert);
  else await ctx.tx.update(tierNotices).set(fromDocument(tierNotices, { tiers })).where(eq(tierNotices._id, notice._id));
  return { untold, tiers };
}

export const tellOpeningSummaryArgs = z.strictObject({ event: unlockOpenedEventValidator });
/** Tells the tiers earned before the book opened, once the member opens it themselves. */
export async function tellOpeningSummary(ctx: MutationContext, { event }: z.infer<typeof tellOpeningSummaryArgs>): Promise<void> {
  await tellUntoldTiers(ctx, event.member);
}
export const tellOpeningSummaryJob = mutationJob("feedback.tierNotices.tellOpeningSummary", tellOpeningSummaryArgs, tellOpeningSummary);

export const tellBatchSummariesArgs = z.strictObject({ batch: zv.id("bookBatches"), cursor: z.union([z.string(), z.null()]) });
/**
 * Tells each member of a completed replay batch the tiers it earned them, a page of members at a time. A restart from
 * the first page tells nobody twice: a summary records the tiers it told, and told tiers are left out of every notice
 * and summary after it.
 */
export async function tellBatchSummaries(ctx: MutationContext, { batch, cursor }: z.infer<typeof tellBatchSummariesArgs>): Promise<void> {
  const row = await batchOf(ctx, batch);
  if (row?.completedAt === undefined) return;
  const page = await paginate<Doc<"members">>(ctx.tx, { table: members, order: membersByUser, where: eq(members.workspace, row.workspace) }, { cursor, numItems: membersPerPage });
  for (const { _id: member } of page.page) {
    if (await wasOpenedBy(ctx, member, row.completedAt)) await tellBatchTo(ctx, member, { batch, announced: await wasOpenedBefore(ctx, member, row.at) });
  }
  if (!page.isDone) await ctx.jobs.enqueue(tellBatchSummariesJob, { batch, cursor: page.continueCursor });
}
export const tellBatchSummariesJob = mutationJob("feedback.tierNotices.tellBatchSummaries", tellBatchSummariesArgs, tellBatchSummaries);

async function tellBatchTo(ctx: MutationContext, member: MemberId, telling: BatchTelling) {
  await tellUntoldTiers(ctx, member, telling);
  await ctx.jobs.enqueue(publishHomeJob, await chatUserOf(ctx, member));
}

async function tellUntoldTiers(ctx: MutationContext, member: MemberId, { batch, announced }: Partial<BatchTelling> = {}) {
  const { workspace, user } = await chatUserOf(ctx, member);
  if (!(await achievementsApplyIn(ctx, workspace)) || !(await isOpened(ctx, member, "book"))) return;
  const tiers = await untoldTiersOf(ctx, member, batch);
  if (tiers.length === 0) return;
  const summary = ctx.newRow();
  await ctx.tx.insert(tierSummaries).values(fromDocument(tierSummaries, { ...summary, member, workspace, tiers, ...(batch !== undefined && { batch }) }) as typeof tierSummaries.$inferInsert);
  await notify(ctx, member, { kind: "tiers-earned", tiers });
  const toldPublicly = tiers.filter(isToldPublicly);
  if (announced === true && toldPublicly.length > 0) await announce(ctx, workspace, { summary: summary._id }, tierSection(member, user, toldPublicly));
}

async function untoldTiersOf(ctx: QueryContext, member: MemberId, batch: BatchId | undefined): Promise<TierRef[]> {
  const told = await toldTiersOf(ctx, member);
  const earned = await tellableTiersOf(ctx, member, batch);
  const shown = await laddersShownTo(ctx, member);
  return ladders.ladders.filter(({ ladder }) => shown.includes(ladder)).flatMap(({ ladder, tiers }) =>
    tiers.map(({ tier }) => ({ ladder, tier })).filter((ref) => earned.some((row) => isSameTier(row, ref)) && !told.some((each) => isSameTier(each, ref))),
  );
}

async function tellableTiersOf(ctx: QueryContext, member: MemberId, batch: BatchId | undefined) {
  const shown = (await everyTierEarnedBy(ctx, member)).filter((row) => row.hidden !== true);
  if (batch !== undefined) return shown.filter((row) => row.batch === batch);
  const unfinished = await unfinishedBatchesAmong(ctx, shown.map((row) => row.batch));
  return shown.filter((row) => row.batch === undefined || !unfinished.has(row.batch));
}

async function unfinishedBatchesAmong(ctx: QueryContext, batches: Array<BatchId | undefined>) {
  const unfinished = new Set<BatchId>();
  for (const batch of new Set(batches)) {
    if (batch !== undefined && (await batchOf(ctx, batch))?.completedAt === undefined) unfinished.add(batch);
  }
  return unfinished;
}

// Today's read: the member's notices, then their summaries, each in its index's order.
async function toldTiersOf(ctx: QueryContext, member: MemberId): Promise<TierRef[]> {
  const notices = await ctx.tx
    .select()
    .from(tierNotices)
    .where(eq(tierNotices.member, member))
    .orderBy(asc(tierNotices.member), asc(tierNotices.workspace), asc(tierNotices.conversation), asc(tierNotices.message), asc(tierNotices._creationTime), asc(tierNotices._id));
  const summaries = await ctx.tx.select().from(tierSummaries).where(eq(tierSummaries.member, member)).orderBy(asc(tierSummaries._creationTime), asc(tierSummaries._id));
  return [...notices.map((row) => toDocument<Doc<"tierNotices">>(tierNotices, row)), ...summaries.map((row) => toDocument<Doc<"tierSummaries">>(tierSummaries, row))].flatMap(({ tiers }) => tiers);
}

function tierSection(member: MemberId, user: string, tiers: TierRef[]): PublicSection {
  const names = listOf(tiers.map(tierNameOf));
  return { key: `achievement:${user}`, member, about: "achievement", line: [{ text: "🏅 " }, { mention: { kind: "person", user } }, { text: ` earned ${names}.` }] };
}

function listOf(names: string[]) {
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

async function wasOpenedBy(ctx: QueryContext, member: MemberId, at: number) {
  const openedAt = await openedAtOf(ctx, member, "book");
  return openedAt !== null && openedAt <= at && (await isOpened(ctx, member, "book"));
}

async function wasOpenedBefore(ctx: QueryContext, member: MemberId, at: number) {
  const openedAt = await openedAtOf(ctx, member, "book");
  return openedAt !== null && openedAt < at && !(await wasOpenedByLaunch(ctx, member, openedAt));
}

async function wasOpenedByLaunch(ctx: QueryContext, member: MemberId, openedAt: number) {
  const { workspace } = await chatUserOf(ctx, member);
  const rows = await ctx.tx.select().from(unlockLaunches).where(eq(unlockLaunches.workspace, workspace)).limit(2);
  const launch = unique("unlockLaunches", rows.map((row) => toDocument<Doc<"unlockLaunches">>(unlockLaunches, row)));
  return launch !== null && launch.at === openedAt && launch.shipped.includes("book");
}

function isSameTier(one: TierRef, other: TierRef) {
  return one.ladder === other.ladder && one.tier === other.tier;
}

async function batchOf(ctx: QueryContext, batch: BatchId): Promise<Doc<"bookBatches"> | null> {
  const [row] = await ctx.tx.select().from(bookBatches).where(eq(bookBatches._id, batch));
  return row === undefined ? null : toDocument<Doc<"bookBatches">>(bookBatches, row);
}

async function tierNoticeRow(ctx: QueryContext, member: MemberId, { workspace, conversation, message }: MessageRef): Promise<Doc<"tierNotices"> | null> {
  const rows = await ctx.tx
    .select()
    .from(tierNotices)
    .where(and(eq(tierNotices.member, member), eq(tierNotices.workspace, workspace), eq(tierNotices.conversation, conversation), eq(tierNotices.message, message)))
    .limit(2);
  return unique("tierNotices", rows.map((row) => toDocument<Doc<"tierNotices">>(tierNotices, row)));
}
