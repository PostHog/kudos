// What the round-2 review found landing wrong: aliases, a context behind a union, an arrow without parentheses, an
// object that only looks like a document, an export list, a top-level statement and args given as a validator.
import { v } from "convex/values";
import type { PaginationResult, WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation as mutate, internalQuery, type MutationCtx, type QueryCtx as Reader } from "../_generated/server";

type AnyCtx = Reader | MutationCtx;

export async function countAny(ctx: AnyCtx): Promise<number> {
  return (await ctx.db.query("members").collect()).length;
}

export const firstName: (ctx: Reader) => Promise<string> = async ctx => (await ctx.db.query("members").first())?.name ?? "";

export async function stamped(ctx: Reader, member: Id<"members">) {
  const row = await ctx.db.get(member);
  return { _id: member, _creationTime: row?._creationTime ?? 0, extra: "x" };
}

export async function projected(ctx: Reader, member: Id<"members">) {
  const projection: Pick<Doc<"members">, "_id" | "_creationTime"> = (await ctx.db.get(member))!;
  return projection;
}

export async function indexed(ctx: Reader, member: Id<"members">) {
  const row: { _id: Id<"members">; _creationTime: number; name: string; xp: number; [key: string]: unknown } = (await ctx.db.get(member))!;
  return row;
}

export type Drafts = PaginationResult<WithoutSystemFields<Doc<"members">>>;

const names = new Map<string, number>();
names.set("first", 1);

const half = (n: number) => n / 2;
export { half, names };
export { internalQuery };

export const cache = new Map<string, number>();
const seeded = cache.set("first", 1);
const called = (() => cache.set("called", 1))();
class Seeder {
  static seeded = cache.set("static", 1);
}
const readerSeed = cache.set("readers", [async (ctx: Reader) => ctx].length);

const query = (fn: () => number) => fn();
export const answer = query(() => 42);

export const byValidator = mutate({
  args: v.object({ note: v.string() }),
  handler: async (_ctx, { note }) => (note ? null : null),
});

const args = v.object({ note: v.string() });
export const byShorthand = mutate({ args, handler: async () => null });

const alias = internalQuery;
export const viaAlias = alias({ args: {}, handler: async () => null });
