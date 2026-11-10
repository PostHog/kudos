import { v, type Infer } from "convex/values";

export const messageRefValidator = v.object({ channel: v.string(), ts: v.string(), revision: v.optional(v.int64()) });
export type MessageRef = Infer<typeof messageRefValidator>;

export const toneValidator = v.union(v.literal("warm"), v.literal("loud"));
