import { z } from "zod";

export const groupModeValidator = z.union([z.literal("all"), z.literal("allowlist")]);

export type GroupModeKind = z.infer<typeof groupModeValidator>;
