// The module map's skeleton of convex/engine/engine.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Given, Invalid, OverAllowance } from "../feedback/replies.ts";
import type { Award } from "./awards.ts";
import type { ChatUserId, FetchedMessage, MessageDeleted, MessageEvent, MessageRef } from "./messageEvent.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Outcome =
  | ({ kind: "given"; awards: Award[]; kudosEmoji: string } & Given)
  | ({ kind: "over-allowance" } & OverAllowance)
  | ({ kind: "invalid" } & Invalid);

export type Observation =
  | { kind: "ignored"; why: "not-a-member" | "ordinary-chat" | "stale-revision" | "unchanged" }
  | { kind: "awaiting-directory"; users: ChatUserId[]; retryInMs: number; attempt: bigint }
  | { kind: "abandoned" }
  | { kind: "withdrawn" }
  | { kind: "deleted" }
  | { kind: "already-given"; toldGiver: boolean }
  | { kind: "evaluated"; outcome: Outcome };

export type Hydration = { kind: "hydrated" } | { kind: "refused"; why: "not-given" | "stale-revision" | "not-a-member" | "ordinary-chat" | "already-known" | "deletion-requested" };

export async function observe(ctx: MutationContext, event: MessageEvent | MessageDeleted): Promise<Observation> {
  throw notPorted("engine.engine.observe");
}

export async function hydrate(ctx: MutationContext, fetched: FetchedMessage): Promise<Hydration> {
  throw notPorted("engine.engine.hydrate");
}

export async function threadRootOf(ctx: QueryContext, ref: MessageRef): Promise<string | null> {
  throw notPorted("engine.engine.threadRootOf");
}

export async function givenWithoutWords(ctx: QueryContext, cursor: string | null, numItems: number): Promise<{ refs: { workspace: string; conversation: string; message: string }[]; cursor: string; isDone: boolean }> {
  throw notPorted("engine.engine.givenWithoutWords");
}

export async function threadOfGivenWithoutWords(ctx: QueryContext, ref: MessageRef): Promise<{ threadRoot?: string } | null> {
  throw notPorted("engine.engine.threadOfGivenWithoutWords");
}

export async function awaitedUsers(ctx: QueryContext, ref: MessageRef, attempt: bigint): Promise<ChatUserId[] | null> {
  throw notPorted("engine.engine.awaitedUsers");
}

export async function recheck(ctx: MutationContext, ref: MessageRef, attempt: bigint): Promise<Observation> {
  throw notPorted("engine.engine.recheck");
}

export async function takeStrandedChecks(ctx: MutationContext, dueBefore: number, limit: number): Promise<{ checkAgain: { ref: MessageRef; attempt: bigint }[]; pageWasFull: boolean }> {
  throw notPorted("engine.engine.takeStrandedChecks");
}
