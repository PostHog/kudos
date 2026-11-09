import { v } from "convex/values";
import type { Infer } from "convex/values";

export const noteValidator = v.object({ text: v.string() });
export type Note = Infer<typeof noteValidator>;
