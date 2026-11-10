// The module map's skeleton of convex/engine/kudosText.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { memberLeftEventValidator } from "../bus/events.ts";
import { gateDecisionValidator } from "../progression/gate.ts";
import { messageRefValidator, visibilityValidator, wordSegmentValidator, type Annotations, type FetchedMessage, type MessageEvent, type MessageRef } from "./messageEvent.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
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
type StoredWords = Extract<z.infer<typeof kudosTextValidator>, { kind: "words" }>;

export type KudosText =
  | ({ kind: "text" } & Pick<StoredWords, "segments" | "edited" | "visibility" | "author" | "gate">)
  | { kind: "unavailable"; reason: "deleted" | "removed" | "not-captured" };

export async function keepWords(ctx: MutationContext, event: MessageEvent, annotations: Annotations): Promise<void> {
  throw notPorted("engine.kudosText.keepWords");
}

export async function keepFetchedWords(ctx: MutationContext, fetched: FetchedMessage, annotations: Annotations): Promise<void> {
  throw notPorted("engine.kudosText.keepFetchedWords");
}

export async function forgetWords(ctx: MutationContext, ref: MessageRef): Promise<void> {
  throw notPorted("engine.kudosText.forgetWords");
}

export async function forgetWordsOfGiven(ctx: MutationContext, ref: MessageRef): Promise<void> {
  throw notPorted("engine.kudosText.forgetWordsOfGiven");
}

export async function removeWords(ctx: MutationContext, ref: MessageRef): Promise<void> {
  throw notPorted("engine.kudosText.removeWords");
}

export async function forgetDeleted(ctx: MutationContext, ref: MessageRef): Promise<void> {
  throw notPorted("engine.kudosText.forgetDeleted");
}

export async function hasKudosText(ctx: QueryContext, ref: MessageRef): Promise<boolean> {
  throw notPorted("engine.kudosText.hasKudosText");
}

export async function takenBackInSlack(ctx: QueryContext, ref: MessageRef): Promise<boolean> {
  throw notPorted("engine.kudosText.takenBackInSlack");
}

export async function wordsOf(ctx: QueryContext, ref: MessageRef): Promise<KudosText> {
  throw notPorted("engine.kudosText.wordsOf");
}

export const forgetWordsOfLeaverArgs = z.strictObject({ event: memberLeftEventValidator });
export async function forgetWordsOfLeaver(ctx: MutationContext, args: z.infer<typeof forgetWordsOfLeaverArgs>): Promise<void> {
  throw notPorted("engine.kudosText.forgetWordsOfLeaver");
}
export const forgetWordsOfLeaverJob = mutationJob("engine.kudosText.forgetWordsOfLeaver", forgetWordsOfLeaverArgs, forgetWordsOfLeaver);

type DeletionRequest = { workspace: string; author: string | null };

export async function recordDeletionRequest(ctx: MutationContext, request: DeletionRequest): Promise<void> {
  throw notPorted("engine.kudosText.recordDeletionRequest");
}

export async function deletionRequested(ctx: QueryContext, { workspace, author }: { workspace: string; author: string }): Promise<boolean> {
  throw notPorted("engine.kudosText.deletionRequested");
}

const authoredArgs = { workspace: z.string(), author: z.string() };

export const forgetAuthoredWordsArgs = z.strictObject(authoredArgs);
export async function forgetAuthoredWords(ctx: MutationContext, args: z.infer<typeof forgetAuthoredWordsArgs>): Promise<void> {
  throw notPorted("engine.kudosText.forgetAuthoredWords");
}
export const forgetAuthoredWordsJob = mutationJob("engine.kudosText.forgetAuthoredWords", forgetAuthoredWordsArgs, forgetAuthoredWords);

export async function forgetWordsAuthoredBy(ctx: MutationContext, { workspace, author }: z.infer<z.ZodObject<typeof authoredArgs>>): Promise<void> {
  throw notPorted("engine.kudosText.forgetWordsAuthoredBy");
}

const workspaceArgs = { workspace: z.string(), cursor: z.union([z.string(), z.null()]) };

export const forgetWorkspaceWordsArgs = z.strictObject(workspaceArgs);
export async function forgetWorkspaceWords(ctx: MutationContext, args: z.infer<typeof forgetWorkspaceWordsArgs>): Promise<void> {
  throw notPorted("engine.kudosText.forgetWorkspaceWords");
}
export const forgetWorkspaceWordsJob = mutationJob("engine.kudosText.forgetWorkspaceWords", forgetWorkspaceWordsArgs, forgetWorkspaceWords);

export async function forgetWordsInWorkspace(ctx: MutationContext, { workspace, cursor }: z.infer<z.ZodObject<typeof workspaceArgs>>): Promise<void> {
  throw notPorted("engine.kudosText.forgetWordsInWorkspace");
}
