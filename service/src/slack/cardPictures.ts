// The module map's skeleton of convex/slack/cardPictures.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const cardImageFlag = { key: "card-image", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const cardImageShownInArgs = z.strictObject({ workspace: z.string() });
export async function cardImageShownIn(ctx: QueryContext, args: z.infer<typeof cardImageShownInArgs>): Promise<boolean> {
  throw notPorted("slack.cardPictures.cardImageShownIn");
}

export const drawnCardOfArgs = z.strictObject({ workspace: z.string(), person: zv.id("members") });
export async function drawnCardOf(ctx: QueryContext, args: z.infer<typeof drawnCardOfArgs>): Promise<null | { name: string; team: null | { name: string; crest: null | string }; people: { held: number; newest: { picture: null | string; initials: string }[] }; face: { picture: null | string; initials: string }; level: null | { xp: number; level: number; share: number }; hoggies: null | { total: number; found: number; rarest: null | { name: string; picture: string; rarity: "common" | "uncommon" | "rare" | "epic" | "legendary"; foundAt: number } }; place: null | { kudosGiven: number; rank: number; tied: boolean }; medals: { count: number; best: ("bronze" | "silver" | "gold" | "diamond")[] } }> {
  throw notPorted("slack.cardPictures.drawnCardOf");
}

export const drawnEmojisOfArgs = z.strictObject({ workspace: z.string(), person: zv.id("members") });
export async function drawnEmojisOf(ctx: QueryContext, args: z.infer<typeof drawnEmojisOfArgs>): Promise<null | { pictures: string[]; count: number }> {
  throw notPorted("slack.cardPictures.drawnEmojisOf");
}

export const pictureAtArgs = z.strictObject({ key: z.string() });
export async function pictureAt(ctx: QueryContext, args: z.infer<typeof pictureAtArgs>): Promise<null | string> {
  throw notPorted("slack.cardPictures.pictureAt");
}

export const keptArgs = z.strictObject({ key: z.string(), picture: zv.id("_storage") });
export async function kept(ctx: MutationContext, args: z.infer<typeof keptArgs>): Promise<null | string> {
  throw notPorted("slack.cardPictures.kept");
}
