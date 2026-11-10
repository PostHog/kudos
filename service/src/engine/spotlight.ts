// The module map's skeleton of convex/engine/spotlight.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import { messageRefValidator, type MessageRef, type WordSegment } from "./messageEvent.ts";
import { type DrawPoint, type DrawWalk, type Drawn } from "./spotlightDraws.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type DrawableKudos = { at: number; giver: MemberId; recipients: MemberId[]; segments: WordSegment[]; edited: boolean };

export type Draw = { kind: "kudos"; drawn: Drawn; kudos: DrawableKudos; mentionLookups: number } | { kind: "skipped"; at: DrawPoint } | { kind: "empty" };

const sideValidator = z.union([z.literal("given"), z.literal("received")]);

const beforeValidator = z.union([z.strictObject({ at: zv.number(), created: zv.number() }), z.null()]);

export async function drawFrom(ctx: QueryContext, workspace: string, walk: DrawWalk): Promise<Draw> {
  throw notPorted("engine.spotlight.drawFrom");
}

export async function publicKudosOf(ctx: QueryContext, ref: MessageRef): Promise<DrawableKudos | null> {
  throw notPorted("engine.spotlight.publicKudosOf");
}

export async function keepSpotlightUpToDate(ctx: MutationContext, ref: MessageRef): Promise<void> {
  throw notPorted("engine.spotlight.keepSpotlightUpToDate");
}

export const recomputeSpotlightOfMessageArgs = z.strictObject({ ref: messageRefValidator });
export async function recomputeSpotlightOfMessage(ctx: MutationContext, args: z.infer<typeof recomputeSpotlightOfMessageArgs>): Promise<void> {
  throw notPorted("engine.spotlight.recomputeSpotlightOfMessage");
}
export const recomputeSpotlightOfMessageJob = mutationJob("engine.spotlight.recomputeSpotlightOfMessage", recomputeSpotlightOfMessageArgs, recomputeSpotlightOfMessage);

export const recomputeSpotlightOfArgs = z.strictObject({ member: zv.id("members"), side: sideValidator, before: beforeValidator });
export async function recomputeSpotlightOf(ctx: MutationContext, args: z.infer<typeof recomputeSpotlightOfArgs>): Promise<void> {
  throw notPorted("engine.spotlight.recomputeSpotlightOf");
}
export const recomputeSpotlightOfJob = mutationJob("engine.spotlight.recomputeSpotlightOf", recomputeSpotlightOfArgs, recomputeSpotlightOf);
