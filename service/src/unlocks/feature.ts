import { z } from "zod";

export const featureValidator = z.union([
  z.literal("quests"),
  z.literal("leaderboard"),
  z.literal("book"),
  z.literal("skillTree"),
  z.literal("coins"),]
);

export type Feature = z.infer<typeof featureValidator>;

export function featureCrateKeyOf(feature: Feature): `unlock:${Feature}` {
  return `unlock:${feature}`;
}

export function featureOfCrateKey(crate: string): Feature | null {
  return featureValidator.options.map(({ value }) => value).find((feature) => featureCrateKeyOf(feature) === crate) ?? null;
}
