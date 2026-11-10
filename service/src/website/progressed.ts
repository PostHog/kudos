// The module map's skeleton of convex/website/progressed.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Moved } from "../quests/progress.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Progressed = Moved & { kind: "quest" | "milestone" };

export async function progressedSince(ctx: QueryContext, member: MemberId, since: number, until: number): Promise<Progressed[]> {
  throw notPorted("website.progressed.progressedSince");
}
