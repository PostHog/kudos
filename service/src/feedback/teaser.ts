// The module map's skeleton of convex/feedback/teaser.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function teaserOf(ctx: QueryContext, member: MemberId): Promise<string | null> {
  throw notPorted("feedback.teaser.teaserOf");
}
