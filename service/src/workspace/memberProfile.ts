import { z } from "zod";

export const memberProfileFields = {
  email: z.optional(z.string()),
  realName: z.optional(z.string()),
  displayName: z.optional(z.string()),
  title: z.optional(z.string()),
  picture: z.optional(z.string()),
};

export type MemberProfile = z.infer<z.ZodObject<typeof memberProfileFields>>;

export const memberProfileFieldNames = Object.keys(memberProfileFields) as (keyof MemberProfile)[];
