import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const touch = internalMutation({ args: { id: v.id("members") }, handler: async (ctx, { id }) => ctx.db.get(id) });
