// The module map's skeleton of convex/website/bookSpread.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const bookSpreadFlag = { key: "book-spread", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type BookSpreadShown = { bookSpread?: true };

export async function bookSpreadShownTo(ctx: QueryContext, member: MemberId): Promise<BookSpreadShown> {
  throw notPorted("website.bookSpread.bookSpreadShownTo");
}
