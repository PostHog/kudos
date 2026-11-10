// What ReviewHog found landing wrong: app types named like Convex's, a type declared in a body, overloads, tuples,
// a registration without args, and a module value changed by a built-in.
import type { QueryCtx as Reader } from "../_generated/server";
import { internalMutation } from "../_generated/server";

type Id<T> = { value: T };
type QueryCtx = { value: string };

export function plainRead(ctx: QueryCtx): string {
  return ctx.value;
}

export async function wrapped(ctx: Reader) {
  const id: Id<"members"> = { value: "members" };
  return id;
}

export async function local(ctx: Reader) {
  type Result = { n: number };
  const result: Result = { n: (await ctx.db.query("members").collect()).length };
  return result;
}

export function tupled(ctx: Reader) {
  return [] as unknown as readonly [string, boolean?, ...number[]];
}

export function pick(ctx: Reader, key: string): Promise<string>;
export function pick(ctx: Reader, key: number): Promise<number>;
export async function pick(ctx: Reader, key: string | number): Promise<string | number> {
  return key;
}

export const settings: Record<string, boolean> = {};
const ready = Object.assign(settings, { ready: true });

export const noArgs = internalMutation(async (_ctx, args: { note: string }) => args.note);
