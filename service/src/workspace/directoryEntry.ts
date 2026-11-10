import { z } from "zod";
import { memberProfileFields } from "./memberProfile.ts";

const memberEntryValidator = z.strictObject({ kind: z.literal("member"), name: z.optional(z.string()), timeZone: z.optional(z.string()), admin: z.optional(z.boolean()), ...memberProfileFields });

export const directoryEntryValidator = z.union([memberEntryValidator, z.strictObject({ kind: z.literal("bot") }), z.strictObject({ kind: z.literal("not-a-member") })]);

export type DirectoryEntry = z.infer<typeof directoryEntryValidator>;
