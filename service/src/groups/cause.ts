import { z } from "zod";

export const primaryGroupCauseValidator = z.union([z.literal("default"), z.literal("picked"), z.literal("fallback")]);

export type PrimaryGroupCause = z.infer<typeof primaryGroupCauseValidator>;
