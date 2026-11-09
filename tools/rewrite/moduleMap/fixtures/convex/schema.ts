// The fixtures' schema, so their generated types are Convex's own.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  members: defineTable({ name: v.string(), xp: v.number() }),
});
