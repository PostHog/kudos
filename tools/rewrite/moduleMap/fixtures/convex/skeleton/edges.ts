// What the round-2 review found landing wrong: aliases, a context behind a union, an arrow without parentheses, an
// object that only looks like a document, an export list, a top-level statement and args given as a validator.
import { v } from "convex/values";
import type { PaginationResult, WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation as mutate, type MutationCtx, type QueryCtx as Reader } from "../_generated/server";

type AnyCtx = Reader | MutationCtx;

export async function countAny(ctx: AnyCtx): Promise<number> {
  return (await ctx.db.query("members").collect()).length;
}

export const firstName: (ctx: Reader) => Promise<string> = async ctx => (await ctx.db.query("members").first())?.name ?? "";

export async function stamped(ctx: Reader, member: Id<"members">) {
  const row = await ctx.db.get(member);
  return { _id: member, _creationTime: row?._creationTime ?? 0, extra: "x" };
}

export type Drafts = PaginationResult<WithoutSystemFields<Doc<"members">>>;

const names = new Map<string, number>();
names.set("first", 1);

const half = (n: number) => n / 2;
export { half, names };

export const byValidator = mutate({
  args: v.object({ note: v.string() }),
  handler: async (_ctx, { note }) => (note ? null : null),
});
