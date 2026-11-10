// The player card as a PNG, as today's convex/slack/cardDrawing.ts draws it: the card's art fetched, the picture drawn on
// the renderer thread (cardRenderer.ts), and kept under the card's key only when every piece of art settled. Unlike
// Convex, whose actions each ran apart, every card here shares the service's memory, and Resvg decodes each picture whole
// outside the renderer's heap: a picture past a byte cap, or whose header gives sides past a ceiling, isn't drawn.
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

/** A picture's most bytes: a face, crest or emoji is a few hundred KiB at most. */
const artMaxBytes = 2 * 1_048_576;

/** A picture's longest side, in pixels: one decoded at this size takes 16 MiB, and a card draws a handful. */
const artMaxSide = 2048;

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
    if (!answer.ok || !pictureTypes.has(type)) return { picture: null, settled: answer.status < 500 && !laterStatuses.has(answer.status) };
    const bytes = await bytesUpTo(answer, artMaxBytes);
    const sides = bytes === null ? null : sidesOf(bytes, type);
    if (bytes === null || sides === null || sides.width > artMaxSide || sides.height > artMaxSide) return { picture: null, settled: true };
    return { picture: `data:${type};base64,${Buffer.from(bytes).toString("base64")}`, settled: true };
  } catch {
    return { picture: null, settled: false };
  }
}

/** The answer's body, or null once it would pass `max` bytes, read no further than that. */
async function bytesUpTo(answer: Response, max: number): Promise<Uint8Array | null> {
  if (Number(answer.headers.get("content-length") ?? 0) > max) {
    await answer.body?.cancel();
    return null;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of answer.body ?? []) {
    size += chunk.byteLength;
    if (size > max) {
      await answer.body?.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** A PNG's, JPEG's or GIF's sides as its header gives them, or null when the header isn't its type's. */
function sidesOf(bytes: Uint8Array, type: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (type === "image/png") {
    if (bytes.byteLength < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a || text(12, 16) !== "IHDR") return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === "image/gif") {
    if (bytes.byteLength < 10 || !["GIF87a", "GIF89a"].includes(text(0, 6))) return null;
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (bytes.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let at = 2;
  while (at + 9 <= bytes.byteLength) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) };
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    at += 2 + view.getUint16(at + 2);
  }
  return null;
}
