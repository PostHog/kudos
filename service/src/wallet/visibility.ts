// The module map's skeleton of convex/wallet/visibility.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function coinsVisibleTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("wallet.visibility.coinsVisibleTo");
}

export async function coinsVisibleAndExposedTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("wallet.visibility.coinsVisibleAndExposedTo");
}

export async function coinsShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("wallet.visibility.coinsShownTo");
}

export async function coinsApplyTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("wallet.visibility.coinsApplyTo");
}

export async function isCoinsOpenFor(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("wallet.visibility.isCoinsOpenFor");
}
