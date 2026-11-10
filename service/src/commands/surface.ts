import { z } from "zod";

export const surfaceValidator = z.union([z.literal("slack"), z.literal("website")]);

export type Surface = z.infer<typeof surfaceValidator>;
