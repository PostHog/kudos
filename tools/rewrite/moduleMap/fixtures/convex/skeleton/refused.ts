// What a skeleton can't stub without changing what other modules see, so the generator refuses it.
import type { QueryCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

type QueryContext = { local: true };
export const local: QueryContext = { local: true };

export async function reader(ctx: QueryCtx) {
  return ctx.db.query("members").first();
}

async function viaList(ctx: QueryCtx) {
  return ctx.db.query("members").first();
}
export { viaList };

export const one = async (ctx: QueryCtx) => ctx.db.query("members").first(), two = 2;

const readers: Array<(ctx: QueryCtx) => unknown> = [];
readers.push(async (ctx: QueryCtx) => ctx.db.query("members").first());

// The service compiles with erasableSyntaxOnly, which has no enums.
export enum Mode {
  On,
}

// A stub named like the service's helper would call itself.
export const read = function notPorted(ctx: QueryCtx): number {
  return 1;
};

// A reached registration whose args come through a spread can't be read.
const options = { args: { note: v.string() } };
export const spread = internalMutation({ ...options, handler: async (_ctx, { note }) => note });
