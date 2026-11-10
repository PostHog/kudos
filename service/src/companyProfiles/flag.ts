// The team pages flag, as today's convex/companyProfiles/flag.ts.
import { exposed, memberDecision, type Flag } from "../analytics/flags.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";

export const teamPagesFlag = { key: "team-pages", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function teamPagesShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecision(ctx, teamPagesFlag, member);
}

export async function teamPagesApplyTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const applies = await memberDecision(ctx, teamPagesFlag, member);
  await exposed(ctx, teamPagesFlag, member, applies);
  return applies;
}
