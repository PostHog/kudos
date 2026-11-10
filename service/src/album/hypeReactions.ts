// The module map's skeleton of convex/album/hypeReactions.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { hypeReactedEventValidator } from "../bus/events.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type Nudge = { person: MemberId; emoji: string; reactions: number };

export const mostHypeReactionsRead = 500;

export const mostOwnersChecked = 20;

export const keepHypeReactionArgs = z.strictObject({ event: hypeReactedEventValidator });
export async function keepHypeReaction(ctx: MutationContext, args: z.infer<typeof keepHypeReactionArgs>): Promise<void> {
  throw notPorted("album.hypeReactions.keepHypeReaction");
}
export const keepHypeReactionJob = mutationJob("album.hypeReactions.keepHypeReaction", keepHypeReactionArgs, keepHypeReaction);

export async function nudgesFor(ctx: QueryContext, member: MemberId, most: number): Promise<Nudge[]> {
  throw notPorted("album.hypeReactions.nudgesFor");
}
