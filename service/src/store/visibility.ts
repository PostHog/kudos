// The module map's skeleton of convex/store/visibility.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function storeVisibleTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("store.visibility.storeVisibleTo");
}

export async function storeShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("store.visibility.storeShownTo");
}

export async function storeShownAndExposedTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("store.visibility.storeShownAndExposedTo");
}
