// The player card as a PNG, as today's convex/slack/cardDrawing.ts draws it: the card's art fetched, the picture drawn on
// the renderer thread (cardRenderer.ts), and kept under the card's key only when every piece of art settled.
import { rarityWord } from "../album/hoggies/catalogue.ts";
import { drawnCardValidator, foundDayOf, isAQuietCard, placeWordsOf, quietLineOf, type DrawnCard } from "./playerCard.ts";
import { drawnPicture, type CardArt, type CardWords } from "./cardPicture.ts";
import { z } from "zod";
import { fileUrlOf, storedFile } from "../db/files.ts";
import type { ActionContext } from "../operations.ts";
import { kept } from "./cardPictures.ts";
import { renderedCard } from "./cardRenderer.ts";

export type { CardArt } from "./cardPicture.ts";

"use node";

const artTimeoutMs = 2000;

const pictureTypes = new Set(["image/png", "image/jpeg", "image/gif"]);

const laterStatuses = new Set([408, 429]);

export const drawnArgs = z.strictObject({ card: drawnCardValidator, key: z.string() });
export async function drawn(ctx: ActionContext, { card, key }: z.infer<typeof drawnArgs>): Promise<null | string> {
  const { art, lasting } = await artOf(card);
  const png = await renderedCard(card, art, cardWordsOf(card));
  const picture = await ctx.run.mutation("slack.cardDrawing.drawn.store", (stored) => storedFile(stored, png, "image/png"));
  return lasting ? ctx.run.mutation("slack.cardPictures.kept", (keeping) => kept(keeping, { key, picture })) : ctx.run.query("slack.cardDrawing.drawn.url", (read) => fileUrlOf(read, picture));
}

export async function cardPictureOf(card: DrawnCard, art: CardArt): Promise<Uint8Array> {
  return drawnPicture(card, art, cardWordsOf(card));
}

/** What the picture says, written here so the renderer thread never loads the modules that write it. */
export function cardWordsOf(card: DrawnCard): CardWords {
  const rarest = card.hoggies?.rarest ?? null;
  return { quiet: isAQuietCard(card), quietLine: quietLineOf(card.name), place: placeWordsOf(card.place), rarity: rarest === null ? null : rarityWord(rarest.rarity), foundDay: rarest === null ? null : foundDayOf(rarest.foundAt) };
}

export async function artOf(card: DrawnCard): Promise<{ art: CardArt; lasting: boolean }> {
  const [face, crest, rarest, people, emojis] = await Promise.all([
    fetchedPicture(card.face.picture),
    fetchedPicture(card.team?.crest ?? null),
    fetchedPicture(card.hoggies?.rarest?.picture ?? null),
    Promise.all(card.people.newest.map((person) => fetchedPicture(person.picture))),
    Promise.all(card.emojis.pictures.map(fetchedPicture)),
  ]);
  const fetched = [face, crest, rarest, ...people, ...emojis];
  return {
    art: { face: face.picture, crest: crest.picture, rarest: rarest.picture, people: people.map(({ picture }) => picture), emojis: emojis.map(({ picture }) => picture) },
    lasting: fetched.every(({ settled }) => settled),
  };
}

type Fetched = { picture: string | null; settled: boolean };

async function fetchedPicture(url: string | null): Promise<Fetched> {
  if (url === null) return { picture: null, settled: true };
  try {
    const answer = await fetch(url, { signal: AbortSignal.timeout(artTimeoutMs) });
    const type = answer.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (answer.ok && pictureTypes.has(type)) return { picture: `data:${type};base64,${Buffer.from(await answer.arrayBuffer()).toString("base64")}`, settled: true };
    return { picture: null, settled: answer.status < 500 && !laterStatuses.has(answer.status) };
  } catch {
    return { picture: null, settled: false };
  }
}
