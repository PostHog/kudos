// What ReviewHog's third round found: a registration a local wrapper makes, an interface merged from parts, and
// readonly types a stub's signature must keep.
import { v, type ObjectType, type PropertyValidators } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";

function wrap<Args extends PropertyValidators>(definition: { args: Args; handler: (ctx: MutationCtx, args: ObjectType<Args>) => Promise<void> }) {
  return internalMutation(definition);
}

export const save = wrap({ args: { note: v.string() }, handler: async () => {} });

interface Row {
  a: string;
}
interface Row {
  b: number;
}

export async function row(ctx: QueryCtx): Promise<Row> {
  return { a: (await ctx.db.query("members").first())?.name ?? "", b: 0 };
}

export function frozen(ctx: QueryCtx) {
  return { value: Math.random(), list: [1] as readonly number[] } as const;
}

// A type named like a value over a context carries no context.
export const Entry = (ctx: QueryCtx): string => "x";
export type Entry = { value: string };
export const entry: Entry = { value: "ok" };

type Frozen = { readonly x: number };
export function thawed(ctx: QueryCtx) {
  return {} as { -readonly [K in keyof Frozen]: Frozen[K] };
}

export const mixed = internalQuery({ args: {}, handler: (): Promise<string> | number => 1 });
