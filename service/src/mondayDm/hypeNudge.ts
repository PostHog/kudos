// The module map's skeleton of convex/mondayDm/hypeNudge.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Id } from "../db/columns.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const hypeNudgeFlag = { key: "hype-nudge", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function hypeNudgeFor(ctx: MutationContext, member: MemberId): Promise<string | null> {
  throw notPorted("mondayDm.hypeNudge.hypeNudgeFor");
}

export async function keepHypeNudge(ctx: MutationContext, dm: Id<"mondayDms">, line: string | null): Promise<void> {
  throw notPorted("mondayDm.hypeNudge.keepHypeNudge");
}

export async function hypeNudgeOf(ctx: QueryContext, dm: Id<"mondayDms">): Promise<string | null> {
  throw notPorted("mondayDm.hypeNudge.hypeNudgeOf");
}
