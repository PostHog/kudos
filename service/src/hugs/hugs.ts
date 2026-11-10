// The module map's skeleton of convex/hugs/hugs.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import type { HugReaction } from "./reaction.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type ReactionDecision = { kind: "hug" } | { kind: "hype"; owner: MemberId } | { kind: "nothing" } | { kind: "unknown-people"; users: string[] };

export async function mayReactWith(ctx: QueryContext, workspace: string, user: string, toned: string): Promise<boolean> {
  throw notPorted("hugs.hugs.mayReactWith");
}

export async function decideReaction(ctx: MutationContext, reaction: HugReaction): Promise<ReactionDecision> {
  throw notPorted("hugs.hugs.decideReaction");
}

export async function hugsLeftOf(ctx: QueryContext, giver: MemberId, workspace: string, day: string): Promise<number> {
  throw notPorted("hugs.hugs.hugsLeftOf");
}
