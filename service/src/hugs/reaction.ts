import { z } from "zod";
import { zv } from "../values.ts";

export const hugReactionValidator = z.strictObject({
  workspace: z.string(),
  giver: z.string(),
  author: z.string(),
  conversation: z.string(),
  message: z.string(),
  emoji: z.string(),
  at: zv.number(),
});

export type HugReaction = z.infer<typeof hugReactionValidator>;
