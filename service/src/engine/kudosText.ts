// A kudos message's words: kept as the message is given and edited, a tombstone once it is deleted, no longer kudos or
// removed, and forgotten for an author or a workspace on request. Today's convex/engine/kudosText.ts over the
// service's transaction; its forgetting is jobs, as it was scheduled functions.
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { withholdingWords } from "../analytics/exceptions.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { paginate } from "../db/page.ts";
import { kudosTexts, wordDeletionRequests, type Doc } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import { chatUserOf, lookup } from "../workspace/directory.ts";
import { dropFromSpotlight } from "./spotlightDraws.ts";
import { memberLeftEventValidator, type MemberLeftEvent } from "../bus/events.ts";
import { gateDecisionOf, gateDecisionValidator } from "../progression/gate.ts";
import { messageRefValidator, visibilityValidator, wordSegmentValidator, type Annotations, type FetchedMessage, type MessageEvent, type MessageRef } from "./messageEvent.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export const forgetPageSize = 10;

const key = messageRefValidator.shape;

export const kudosTextValidator = z.union([
  z.strictObject({
    ...key,
    kind: z.literal("words"),
    revision: z.int64(),
    author: z.string(),
    edited: z.boolean(),
    segments: z.array(wordSegmentValidator),
    visibility: z.union([visibilityValidator, z.literal("unknown")]),
    gate: z.union([gateDecisionValidator, z.null()]),
  }),
  z.strictObject({ ...key, kind: z.literal("tombstone"), why: z.union([z.literal("deleted"), z.literal("no-longer-kudos"), z.literal("removed")]) }),]
);
type KudosTextRow = Doc<"kudosTexts">;
type StoredText = z.infer<typeof kudosTextValidator>;
type StoredWords = Extract<z.infer<typeof kudosTextValidator>, { kind: "words" }>;

export type KudosText =
  | ({ kind: "text" } & Pick<StoredWords, "segments" | "edited" | "visibility" | "author" | "gate">)
  | { kind: "unavailable"; reason: "deleted" | "removed" | "not-captured" };

export async function keepWords(ctx: MutationContext, event: MessageEvent, annotations: Annotations): Promise<void> {
  const row = await kudosTextRow(ctx, event.ref);
  if (row !== null && !mayStoreWordsOver(row, event.revision)) return;
  await write(ctx, row, {
    ...event.ref,
    kind: "words",
    revision: event.revision,
    author: event.author,
    edited: event.kind === "edited",
    segments: event.words.segments,
    visibility: event.words.visibility,
    gate: gateDecisionOf(annotations),
  });
}

export async function keepFetchedWords(ctx: MutationContext, fetched: FetchedMessage, annotations: Annotations): Promise<void> {
  await insertText(ctx, {
    ...fetched.ref,
    kind: "words",
    revision: fetched.revision,
    author: fetched.author,
    edited: fetched.edited,
    segments: fetched.segments,
    visibility: "unknown",
    gate: gateDecisionOf(annotations),
  });
}

export async function forgetWords(ctx: MutationContext, ref: MessageRef): Promise<void> {
  const row = await kudosTextRow(ctx, ref);
  if (row?.kind === "words") await write(ctx, row, { ...ref, kind: "tombstone", why: "no-longer-kudos" });
}

export async function forgetWordsOfGiven(ctx: MutationContext, ref: MessageRef): Promise<void> {
  const row = await kudosTextRow(ctx, ref);
  if (row === null || row.kind === "words") await write(ctx, row, { ...ref, kind: "tombstone", why: "no-longer-kudos" });
}

export async function removeWords(ctx: MutationContext, ref: MessageRef): Promise<void> {
  const row = await kudosTextRow(ctx, ref);
  if (row !== null) await remove(ctx, row);
}

export async function forgetDeleted(ctx: MutationContext, ref: MessageRef): Promise<void> {
  const row = await kudosTextRow(ctx, ref);
  await write(ctx, row, { ...ref, kind: "tombstone", why: "deleted" });
}

export async function hasKudosText(ctx: QueryContext, ref: MessageRef): Promise<boolean> {
  return (await kudosTextRow(ctx, ref)) !== null;
}

export async function takenBackInSlack(ctx: QueryContext, ref: MessageRef): Promise<boolean> {
  const row = await kudosTextRow(ctx, ref);
  return row?.kind === "tombstone" && row.why !== "removed";
}

export async function wordsOf(ctx: QueryContext, ref: MessageRef): Promise<KudosText> {
  const row = await kudosTextRow(ctx, ref);
  if (row === null) return { kind: "unavailable", reason: "not-captured" };
  if (row.kind === "tombstone") return { kind: "unavailable", reason: row.why === "removed" ? "removed" : "deleted" };
  if (await hasLeft(ctx, row.workspace, row.author)) return { kind: "unavailable", reason: "removed" };
  const { segments, edited, visibility, author, gate } = row;
  return { kind: "text", segments, edited, visibility, author, gate };
}

export const forgetWordsOfLeaverArgs = z.strictObject({ event: memberLeftEventValidator });
export const forgetWordsOfLeaver = withholdingWords(async (ctx: MutationContext, { event: { workspace, member } }: { event: MemberLeftEvent }): Promise<void> => {
  const { user } = await chatUserOf(ctx, member);
  await recordDeletionRequest(ctx, { workspace, author: user });
  await forgetWordsAuthoredBy(ctx, { workspace, author: user });
});
export const forgetWordsOfLeaverJob = mutationJob("engine.kudosText.forgetWordsOfLeaver", forgetWordsOfLeaverArgs, forgetWordsOfLeaver);

type DeletionRequest = { workspace: string; author: string | null };

export async function recordDeletionRequest(ctx: MutationContext, request: DeletionRequest): Promise<void> {
  if (!(await isRequested(ctx, request))) await ctx.tx.insert(wordDeletionRequests).values(fromDocument(wordDeletionRequests, { ...ctx.newRow(), ...request }) as typeof wordDeletionRequests.$inferInsert);
}

export async function deletionRequested(ctx: QueryContext, { workspace, author }: { workspace: string; author: string }): Promise<boolean> {
  return (await isRequested(ctx, { workspace, author })) || (await isRequested(ctx, { workspace, author: null }));
}

async function isRequested({ tx }: QueryContext, { workspace, author }: DeletionRequest): Promise<boolean> {
  const [request] = await tx
    .select({ _id: wordDeletionRequests._id })
    .from(wordDeletionRequests)
    .where(and(eq(wordDeletionRequests.workspace, workspace), author === null ? isNull(wordDeletionRequests.author) : eq(wordDeletionRequests.author, author)))
    .orderBy(...deletionRequestsByAuthor.orderBy())
    .limit(1);
  return request !== undefined;
}

const authoredArgs = { workspace: z.string(), author: z.string() };

export const forgetAuthoredWordsArgs = z.strictObject(authoredArgs);
export const forgetAuthoredWords = withholdingWords((ctx: MutationContext, args: z.infer<typeof forgetAuthoredWordsArgs>) => forgetWordsAuthoredBy(ctx, args));
export const forgetAuthoredWordsJob = mutationJob("engine.kudosText.forgetAuthoredWords", forgetAuthoredWordsArgs, forgetAuthoredWords);

export async function forgetWordsAuthoredBy(ctx: MutationContext, { workspace, author }: z.infer<z.ZodObject<typeof authoredArgs>>): Promise<void> {
  const rows = await ctx.tx
    .select()
    .from(kudosTexts)
    .where(and(eq(kudosTexts.workspace, workspace), eq(kudosTexts.author, author)))
    .orderBy(...textsByAuthor.orderBy())
    .limit(forgetPageSize);
  for (const row of rows) await remove(ctx, toDocument<KudosTextRow>(kudosTexts, row));
  if (rows.length === forgetPageSize) await ctx.jobs.enqueue(forgetAuthoredWordsJob, { workspace, author });
}

const workspaceArgs = { workspace: z.string(), cursor: z.union([z.string(), z.null()]) };

export const forgetWorkspaceWordsArgs = z.strictObject(workspaceArgs);
export const forgetWorkspaceWords = withholdingWords((ctx: MutationContext, args: z.infer<typeof forgetWorkspaceWordsArgs>) => forgetWordsInWorkspace(ctx, args));
export const forgetWorkspaceWordsJob = mutationJob("engine.kudosText.forgetWorkspaceWords", forgetWorkspaceWordsArgs, forgetWorkspaceWords);

export async function forgetWordsInWorkspace(ctx: MutationContext, { workspace, cursor }: z.infer<z.ZodObject<typeof workspaceArgs>>): Promise<void> {
  const rows = await paginate<KudosTextRow>(ctx.tx, { table: kudosTexts, order: textsByMessage, where: eq(kudosTexts.workspace, workspace) }, { numItems: forgetPageSize, cursor });
  for (const row of rows.page) await remove(ctx, row);
  if (!rows.isDone) await ctx.jobs.enqueue(forgetWorkspaceWordsJob, { workspace, cursor: rows.continueCursor });
}

async function remove(ctx: MutationContext, row: KudosTextRow) {
  if (row.kind === "words") await write(ctx, row, { ...refOf(row), kind: "tombstone", why: "removed" });
}

async function hasLeft(ctx: QueryContext, workspace: string, author: string) {
  const facts = await lookup(ctx, workspace, author);
  return facts !== undefined && facts.kind !== "member";
}

function refOf({ workspace, conversation, message }: MessageRef): MessageRef {
  return { workspace, conversation, message };
}

function mayStoreWordsOver(row: KudosTextRow, revision: bigint) {
  if (row.kind === "tombstone") return row.why === "no-longer-kudos";
  return revision > row.revision;
}

const textsByMessage = indexOrder(kudosTexts, ["workspace", "conversation", "message"]);
const textsByAuthor = indexOrder(kudosTexts, ["workspace", "author"]);
const deletionRequestsByAuthor = indexOrder(wordDeletionRequests, ["workspace", "author"]);

/** Inserts the text, or replaces the row's whole document with it, as Convex's `insert` and `replace` did. */
async function write(ctx: MutationContext, row: KudosTextRow | null, value: StoredText) {
  if (row === null) await insertText(ctx, value);
  else await ctx.tx.update(kudosTexts).set(fromDocument(kudosTexts, { _id: row._id, _creationTime: row._creationTime, ...value })).where(eq(kudosTexts._id, row._id));
  if (value.kind === "tombstone") await dropFromSpotlight(ctx, refOf(value));
}

async function insertText(ctx: MutationContext, value: StoredText) {
  await ctx.tx.insert(kudosTexts).values(fromDocument(kudosTexts, { ...ctx.newRow(), ...value }) as typeof kudosTexts.$inferInsert);
}

async function kudosTextRow({ tx }: QueryContext, ref: MessageRef): Promise<KudosTextRow | null> {
  const rows = await tx.select().from(kudosTexts).where(ofTheMessage(ref)).orderBy(...textsByMessage.orderBy()).limit(2);
  return unique("kudosTexts", rows.map((row) => toDocument<KudosTextRow>(kudosTexts, row)));
}

function ofTheMessage({ workspace, conversation, message }: MessageRef): SQL {
  return and(eq(kudosTexts.workspace, workspace), eq(kudosTexts.conversation, conversation), eq(kudosTexts.message, message))!;
}
