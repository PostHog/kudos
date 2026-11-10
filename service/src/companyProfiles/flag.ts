// The module map's skeleton of convex/companyProfiles/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const teamPagesFlag = { key: "team-pages", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function teamPagesShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("companyProfiles.flag.teamPagesShownTo");
}

export async function teamPagesApplyTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("companyProfiles.flag.teamPagesApplyTo");
}
