// The player card's facts and its kept pictures, as today's convex/slack/cardPictures.ts reads and keeps them: the card
// drawn for the site's workspace only, and one picture kept per card key, the first.
import { emojiStackOf } from "../album/earnedEmojis.ts";
import { hoggieSharePictureOf } from "../album/items/shareArt.ts";
import { workspaceDecisionWithoutWriting, type Flag } from "../analytics/flags.ts";
import { deleteFile, fileUrlOf } from "../db/files.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { cardPictures } from "../db/schema/slack.ts";
import type { Face } from "../website/faces.ts";
import { siteOriginFor } from "../website/link.ts";
import { crestPictureOf } from "../website/linkCardStats.ts";
import { emojisOnTheCard, playerCardOf, type PlayerCard } from "../website/playerCard.ts";
import type { DrawnCard, DrawnFace } from "./playerCard.ts";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const cardImageFlag = { key: "card-image", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

const byKey = indexOrder(cardPictures, ["key"]);

export const cardImageShownInArgs = z.strictObject({ workspace: z.string() });
export async function cardImageShownIn(ctx: QueryContext, { workspace }: z.infer<typeof cardImageShownInArgs>): Promise<boolean> {
  return workspaceDecisionWithoutWriting(ctx, cardImageFlag, workspace);
}

export const drawnCardOfArgs = z.strictObject({ workspace: z.string(), person: zv.id("members") });
export async function drawnCardOf(ctx: QueryContext, { workspace, person }: z.infer<typeof drawnCardOfArgs>): Promise<null | { name: string; team: null | { name: string; crest: null | string }; people: { held: number; newest: { picture: null | string; initials: string }[] }; face: { picture: null | string; initials: string }; level: null | { xp: number; level: number; share: number }; hoggies: null | { total: number; found: number; rarest: null | { name: string; picture: string; rarity: "common" | "uncommon" | "rare" | "epic" | "legendary"; foundAt: number } }; place: null | { kudosGiven: number; rank: number; tied: boolean }; medals: { count: number; best: ("bronze" | "silver" | "gold" | "diamond")[] } }> {
  const origin = siteOriginFor(workspace);
  return origin === null ? null : drawnCardFrom(origin, await playerCardOf(ctx, workspace, person));
}

export const drawnEmojisOfArgs = z.strictObject({ workspace: z.string(), person: zv.id("members") });
export async function drawnEmojisOf(ctx: QueryContext, { workspace, person }: z.infer<typeof drawnEmojisOfArgs>): Promise<null | { pictures: string[]; count: number }> {
  const origin = siteOriginFor(workspace);
  if (origin === null) return null;
  const { count, shown } = await emojiStackOf(ctx, workspace, person, emojisOnTheCard);
  return { count, pictures: shown.map(({ picture }) => absoluteOn(origin, picture)) };
}

export const pictureAtArgs = z.strictObject({ key: z.string() });
export async function pictureAt(ctx: QueryContext, { key }: z.infer<typeof pictureAtArgs>): Promise<null | string> {
  const kept = await keptAt(ctx, key);
  return kept === null ? null : fileUrlOf(ctx, kept.picture);
}

export const keptArgs = z.strictObject({ key: z.string(), picture: zv.id("_storage") });
export async function kept(ctx: MutationContext, { key, picture }: z.infer<typeof keptArgs>): Promise<null | string> {
  const earlier = await keptAt(ctx, key);
  if (earlier !== null) {
    await deleteFile(ctx, picture);
    return fileUrlOf(ctx, earlier.picture);
  }
  await ctx.tx.insert(cardPictures).values({ ...ctx.newRow(), key, picture });
  return fileUrlOf(ctx, picture);
}

async function keptAt(ctx: QueryContext, key: string) {
  const [first] = await ctx.tx
    .select()
    .from(cardPictures)
    .where(eq(cardPictures.key, key))
    .orderBy(...byKey.orderBy())
    .limit(1);
  return first ?? null;
}

function drawnCardFrom(origin: string, card: PlayerCard): Omit<DrawnCard, "emojis"> {
  const { name, face, level, team, place, hoggies, people, medals } = card;
  return {
    name,
    face: drawnFaceOf(origin, face),
    level: level === null ? null : { level: level.level, xp: level.xp, share: levelShareOf(level) },
    team: team === null ? null : { name: team.name, crest: crestPictureOf(origin, team.art) },
    place,
    hoggies: hoggies === null ? null : { found: hoggies.found, total: hoggies.total, rarest: hoggies.rarest === null ? null : { name: hoggies.rarest.name, rarity: hoggies.rarest.rarity, picture: `${origin}${hoggieSharePictureOf(hoggies.rarest.hoggie)}`, foundAt: hoggies.rarest.firstAt } },
    people: { held: people.held, newest: people.newest.map((person) => drawnFaceOf(origin, person.face)) },
    medals: { count: medals.count, best: medals.best.map(({ tier }) => tier) },
  };
}

function drawnFaceOf(origin: string, face: Face): DrawnFace {
  return { picture: face.kind === "initials" ? null : absoluteOn(origin, face.image), initials: face.initials };
}

function levelShareOf({ xp, startsAt, nextAt }: PlayerCard["level"] & {}) {
  return nextAt <= startsAt ? 1 : Math.min(1, Math.max(0, (xp - startsAt) / (nextAt - startsAt)));
}

function absoluteOn(origin: string, picture: string) {
  return picture.startsWith("/") ? `${origin}${picture}` : picture;
}
