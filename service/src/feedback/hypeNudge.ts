// The module map's skeleton of convex/feedback/hypeNudge.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Nudge } from "../album/hypeReactions.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function hypeNudgeLineOf(ctx: QueryContext, { person, emoji }: Nudge): Promise<string> {
  throw notPorted("feedback.hypeNudge.hypeNudgeLineOf");
}
