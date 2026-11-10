// What ReviewHog's pass over the whole map found in printed signatures: an ID that lost its alias, an array of a union
// of objects, and a type the checker can't resolve.
import type { QueryCtx } from "../_generated/server";

export async function tagged(ctx: QueryCtx) {
  return "" as string & { __tableName: "members" };
}

export async function lines(ctx: QueryCtx) {
  return [] as ({ text: string } | { link: string })[];
}

export async function sorted(ctx: QueryCtx) {
  return [3, 1].toSorted();
}
