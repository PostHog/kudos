import { z } from "zod";

export const welcomedAsValidator = z.union([
  z.strictObject({ as: z.literal("recipient"), giver: z.string() }),
  z.strictObject({ as: z.literal("giver"), recipients: z.array(z.string()) }),]
);

export type WelcomedAs = z.infer<typeof welcomedAsValidator>;

const pathOfTheRetiredCatchUp = z.literal("catch-up");

export const welcomePathValidator = z.union([z.literal("hug"), z.literal("thoughtful-given"), z.literal("thoughtful-received"), pathOfTheRetiredCatchUp]);

export type WelcomePath = z.infer<typeof welcomePathValidator>;
