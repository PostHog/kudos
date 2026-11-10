// What ReviewHog's pass over the whole map found in printed signatures: an ID that lost its alias, an array of a union
// of objects, and a type the checker can't resolve.
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type MemberRef = Id<"members">;

export const first = 1,
  second = 2;

export async function both(ctx: QueryCtx) {
  return second;
}

// Data that names a property as a registration does is still data.
export async function classification(ctx: QueryCtx) {
  return { isConvexFunction: true as const, label: "function" };
}

export async function tagged(ctx: QueryCtx) {
  return "" as string & { __tableName: "members" };
}

export async function lines(ctx: QueryCtx) {
  return [] as ({ text: string } | { link: string })[];
}

export async function sorted(ctx: QueryCtx) {
  return [3, 1].toSorted();
}

export async function indexed(ctx: QueryCtx) {
  return "" as string & { __tableName: "members"; [key: string]: unknown };
}
