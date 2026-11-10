// A type parameter that takes the name the skeleton writes for the service's context.
import type { QueryCtx } from "../_generated/server";

export function generic<QueryContext>(ctx: QueryCtx, value: QueryContext) {
  return value;
}
