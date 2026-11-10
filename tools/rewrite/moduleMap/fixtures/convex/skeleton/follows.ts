// A module that names another module's type in a signature, as analytics/person names workspace/directory's MemberId.
import type { QueryCtx } from "../_generated/server";
import type { MemberRef } from "./printed";

export async function follow(ctx: QueryCtx, member: MemberRef): Promise<void> {
  await ctx.db.get(member);
}
