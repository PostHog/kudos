import { z } from "zod";

export const mondayPostOutcomeValidator = z.union([z.literal("claimed"), z.literal("nobody-gave"), z.literal("posted"), z.literal("cant-post"), z.literal("failed")]);

export type MondayPostOutcome = z.infer<typeof mondayPostOutcomeValidator>;

export const channelRefusalValidator = z.union([z.literal("private"), z.literal("shared"), z.literal("customer"), z.literal("not-found"), z.literal("archived"), z.literal("failed")]);

export const channelCheckValidator = z.union([z.literal("checking"), z.literal("picked"), channelRefusalValidator]);

export type ChannelCheck = z.infer<typeof channelCheckValidator>;
