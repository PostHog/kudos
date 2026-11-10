// The album's history: once per workspace, every award and hug given before it began is tallied, a page per job, and
// each award given before the history's row was created puts its recipient in the giver's album. An award created
// after the row collects through its pack instead. Then the workspace's milestones are recorded.
// Today's convex/album/history.ts over the service's transaction.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { awardsInWorkspace, type WorkspaceAward } from "../engine/awards.ts";
import { hugsInWorkspace, hugWithId, type Hug } from "../hugs/records.ts";
import type { MemberId } from "../workspace/directory.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { albumHistory as albumHistories, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";
import { recordMilestonesInWorkspaceJob } from "./milestones.ts";
import { insertInto, replaceIn, uniqueIn } from "./rows.ts";
import { recordHistorySticker } from "./stickers.ts";
import { storedKudosWeightOf, tallyAward, tallyHugPeople, type KudosWeight } from "./tallies.ts";

export const awardsPerHistoryPage = 50;
export const hugPeoplePerHistoryPage = 50;

type AlbumHistory = Doc<"albumHistory">;

export const startAlbumHistoryArgs = z.strictObject({ workspace: z.string() });
export async function startAlbumHistory(ctx: MutationContext, { workspace }: z.infer<typeof startAlbumHistoryArgs>): Promise<null> {
  if ((await historyOf(ctx, workspace)) !== null) return null;
  await insertInto(ctx, albumHistories, { workspace, startedAt: ctx.now, phase: "kudos", cursor: null, done: false });
  await ctx.jobs.enqueue(recordAlbumHistoryJob, { workspace });
  return null;
}
export const startAlbumHistoryJob = mutationJob("album.history.startAlbumHistory", startAlbumHistoryArgs, startAlbumHistory);

export const recordAlbumHistoryArgs = z.strictObject({ workspace: z.string() });
export async function recordAlbumHistory(ctx: MutationContext, { workspace }: z.infer<typeof recordAlbumHistoryArgs>): Promise<null> {
  const history = await historyOf(ctx, workspace);
  if (history === null || history.done) return null;
  const moved = history.phase === "kudos" ? await recordAwardsPage(ctx, history) : await tallyHugsPage(ctx, history);
  await replaceIn(ctx, albumHistories, history, patched(history, moved));
  if (moved.done) await ctx.jobs.enqueue(recordMilestonesInWorkspaceJob, { workspace, cursor: null });
  else await ctx.jobs.enqueue(recordAlbumHistoryJob, { workspace });
  return null;
}
export const recordAlbumHistoryJob = mutationJob("album.history.recordAlbumHistory", recordAlbumHistoryArgs, recordAlbumHistory);

export type AlbumHistoryState = { startedAt: number; done: boolean };

export async function albumHistoryOf(ctx: QueryContext, workspace: string): Promise<AlbumHistoryState | null> {
  const history = await historyOf(ctx, workspace);
  return history === null ? null : { startedAt: history.startedAt, done: history.done };
}

type Moved = Pick<AlbumHistory, "phase" | "cursor" | "hug" | "hugPeopleAfter" | "done">;

// Convex's patch: a field set to undefined is removed, as `hug` and `hugPeopleAfter` are once their hug is tallied.
function patched(history: AlbumHistory, moved: Moved): Record<string, unknown> {
  const document: Record<string, unknown> = { ...history, ...moved };
  for (const field of Object.keys(document)) if (document[field] === undefined) delete document[field];
  return document;
}

async function recordAwardsPage(ctx: MutationContext, history: AlbumHistory): Promise<Moved> {
  const { page, continueCursor, isDone } = await awardsInWorkspace(ctx, history.workspace, { cursor: history.cursor, numItems: awardsPerHistoryPage });
  const wordsOf = wordsOfEachMessage(ctx);
  for (const award of page) {
    if (award.created < history._creationTime) await recordHistorySticker(ctx, award.giver, award.recipient, award.at);
    await tallyAward(ctx, award, await wordsOf(award));
  }
  return isDone ? { phase: "hugs", cursor: null, done: false } : { phase: "kudos", cursor: continueCursor, done: false };
}

async function tallyHugsPage(ctx: MutationContext, history: AlbumHistory): Promise<Moved> {
  const unfinished = history.hug === undefined ? null : await hugWithId(ctx, history.hug);
  if (unfinished !== null) return { ...(await tallyHugOnTheHistoryPage(ctx, unfinished, history.hugPeopleAfter ?? null)), cursor: history.cursor };
  const { page, continueCursor, isDone } = await hugsInWorkspace(ctx, history.workspace, { cursor: history.cursor, numItems: 1 });
  const [hug] = page;
  if (hug === undefined) return { phase: "hugs", cursor: continueCursor, done: isDone };
  const tallied = await tallyHugOnTheHistoryPage(ctx, hug, null);
  return { ...tallied, cursor: continueCursor, done: isDone && tallied.hug === undefined };
}

async function tallyHugOnTheHistoryPage(ctx: MutationContext, hug: Hug, after: MemberId | null): Promise<Omit<Moved, "cursor">> {
  const { last } = await tallyHugPeople(ctx, hug, after, hugPeoplePerHistoryPage);
  return last === null ? { phase: "hugs", hug: undefined, hugPeopleAfter: undefined, done: false } : { phase: "hugs", hug: hug._id, hugPeopleAfter: last, done: false };
}

function wordsOfEachMessage(ctx: QueryContext) {
  const known = new Map<string, KudosWeight>();
  return async ({ message }: WorkspaceAward) => {
    const key = `${message.conversation}/${message.message}`;
    if (!known.has(key)) known.set(key, await storedKudosWeightOf(ctx, message));
    return known.get(key)!;
  };
}

const byWorkspace = indexOrder(albumHistories, ["workspace"]);

function historyOf(ctx: QueryContext, workspace: string): Promise<AlbumHistory | null> {
  return uniqueIn<AlbumHistory>(ctx, albumHistories, byWorkspace, eq(albumHistories.workspace, workspace));
}
