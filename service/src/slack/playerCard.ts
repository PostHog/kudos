import { z } from "zod";
import { zv } from "../values.ts";
import { milestoneTierValidator } from "../album/records.ts";
import { productName } from "../feedback/naming.ts";
import { rarityValidator, rarityWord } from "../album/hoggies/catalogue.ts";
import type { PersonPreview } from "../website/linkPreviews.ts";
import { escaped, mrkdwn, slackDayOf } from "./blocks.ts";

const drawingVersion = 3;

const faceValidator = z.strictObject({ picture: z.union([z.string(), z.null()]), initials: z.string() });

const rarestValidator = z.strictObject({ name: z.string(), rarity: rarityValidator, picture: z.string(), foundAt: zv.number() });

export const drawnCardValidator = z.strictObject({
  name: z.string(),
  face: faceValidator,
  level: z.union([z.strictObject({ level: zv.number(), xp: zv.number(), share: zv.number() }), z.null()]),
  team: z.union([z.strictObject({ name: z.string(), crest: z.union([z.string(), z.null()]) }), z.null()]),
  place: z.union([z.strictObject({ rank: zv.number(), tied: z.boolean(), kudosGiven: zv.number() }), z.null()]),
  hoggies: z.union([z.strictObject({ found: zv.number(), total: zv.number(), rarest: z.union([rarestValidator, z.null()]) }), z.null()]),
  people: z.strictObject({ held: zv.number(), newest: z.array(faceValidator) }),
  emojis: z.strictObject({ count: zv.number(), pictures: z.array(z.string()) }),
  medals: z.strictObject({ count: zv.number(), best: z.array(milestoneTierValidator) }),
});

export type DrawnCard = z.infer<typeof drawnCardValidator>;

export type DrawnFace = DrawnCard["face"];

const foundOn = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function isAQuietCard({ hoggies, people, emojis, medals }: DrawnCard) {
  return (hoggies?.found ?? 0) + people.held + emojis.count + medals.count === 0;
}

export function quietLineOf(name: string) {
  return `${firstNameOf(name)}'s album is just getting started.`;
}

export function placeWordsOf(place: DrawnCard["place"]) {
  return place === null ? "Not on this week's board yet" : `No. ${place.rank}${place.tied ? " tied" : ""} this week`;
}

export function foundDayOf(at: number) {
  return foundOn.format(at);
}

export function counted(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export async function cardKeyOf(card: DrawnCard): Promise<string> {
  const facts = new TextEncoder().encode(JSON.stringify({ drawingVersion, card }));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", facts));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function pictureBlocksOf(preview: PersonPreview, card: DrawnCard, picture: string, asOf: number) {
  return [
    { type: "image", image_url: picture, alt_text: altTextOf(card) },
    { type: "context", elements: [mrkdwn(`*<${preview.page}|${escaped(preview.name)}>* · ${productName} album · as of ${slackDayOf(asOf)}`)] },
  ];
}

export function altTextOf(card: DrawnCard): string {
  const facts = [`${card.name}'s player card`, ...levelFactsOf(card), card.team?.name ?? "No team yet", placeFactOf(card), ...(isAQuietCard(card) ? [quietLineOf(card.name)] : statFactsOf(card)), ...rarestFactsOf(card)];
  return facts.map((fact) => (fact.endsWith(".") ? fact : `${fact}.`)).join(" ");
}

function levelFactsOf({ level }: DrawnCard) {
  return level === null ? [] : [`Level ${level.level}, ${level.xp.toLocaleString("en-GB")} XP`];
}

function placeFactOf({ place }: DrawnCard) {
  return place === null ? placeWordsOf(place) : `${placeWordsOf(place)}, ${place.kudosGiven} kudos`;
}

function statFactsOf({ hoggies, people, emojis, medals }: DrawnCard) {
  return [
    ...(hoggies === null ? [] : [`${hoggies.found} of ${hoggies.total} hoggies found`]),
    `${counted(people.held, "person", "people")} in their album`,
    `${counted(emojis.count, "emoji", "emojis")} unlocked`,
    counted(medals.count, "medal", "medals"),
  ];
}

function rarestFactsOf({ hoggies }: DrawnCard) {
  if (hoggies === null) return [];
  const { rarest } = hoggies;
  return rarest === null ? ["No hoggie found yet"] : [`Rarest find: ${rarest.name}, ${rarityWord(rarest.rarity)}, found ${foundDayOf(rarest.foundAt)}`];
}

function firstNameOf(name: string) {
  return name.split(/\s+/, 1)[0] ?? name;
}
