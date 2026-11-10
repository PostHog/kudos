// An app's own builder over Convex's, as the website's member check is.
import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";

export function memberRead<Result>(handler: (ctx: QueryCtx) => Promise<Result>) {
  return internalQuery({ args: {}, handler });
}
