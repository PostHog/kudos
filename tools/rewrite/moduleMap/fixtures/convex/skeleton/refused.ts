// What a skeleton can't stub without changing what other modules see, so the generator refuses it.
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RegisteredMutation } from "convex/server";
import { internalMutation } from "../_generated/server";
import { v, type ObjectType, type PropertyValidators } from "convex/values";

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

// A registration beside another name, behind a renamed type, or through a wrapper that adds args.
export const saveTwo = internalMutation({ args: {}, handler: async () => null }), extra = 1;

type Hidden = RegisteredMutation<"internal", {}, null>;
const hide: (definition: { args: {}; handler: () => null }) => Hidden = internalMutation;
export const hidden = hide({ args: {}, handler: () => null });

function addToken<Args extends PropertyValidators>(definition: { args: Args; handler: (ctx: MutationCtx, args: ObjectType<Args>) => Promise<null> }) {
  return internalMutation({ args: { ...definition.args, token: v.string() }, handler: definition.handler as never });
}
export const tokened = addToken({ args: { note: v.string() }, handler: async () => null });

function retype(definition: { args: PropertyValidators; handler: () => Promise<null> }) {
  return internalMutation({ args: { note: v.number() }, handler: definition.handler });
}
export const retyped = retype({ args: { note: v.string() }, handler: async () => null });
