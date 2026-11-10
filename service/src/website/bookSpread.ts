// Whether a member sees the book as a spread. Today's convex/website/bookSpread.ts over the service's transaction.
import { memberDecision, type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export const bookSpreadFlag = { key: "book-spread", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type BookSpreadShown = { bookSpread?: true };

export async function bookSpreadShownTo(ctx: QueryContext, member: MemberId): Promise<BookSpreadShown> {
  return (await memberDecision(ctx, bookSpreadFlag, member)) ? { bookSpread: true } : {};
}
