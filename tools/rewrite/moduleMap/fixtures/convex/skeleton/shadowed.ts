// A type parameter that takes the name the skeleton writes for the service's context.
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export function generic<QueryContext>(ctx: QueryCtx, value: QueryContext) {
  return value;
}

export async function inferred<Doc>(ctx: QueryCtx, member: Id<"members">) {
  return ctx.db.get(member);
}
