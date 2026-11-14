// The player card's picture, drawn: satori lays the card out and Resvg renders it as a PNG. This module is the card
// renderer thread's whole load (cardRenderer.worker.ts), so it imports only the drawing libraries and the fonts; the
// card's words come in already written (cardDrawing.ts writes them), since the modules that write them reach most of
// the service, which the thread would otherwise load a second time.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { roundHogBoldUrl, roundHogRegularUrl, roundHogSemiBoldUrl } from "@posthog/brand/fonts";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import "wawoff2/decompress.js";
import type { Rarity } from "../album/hoggies/catalogue.ts";
import type { MilestoneTier } from "../album/records.ts";
import type { DrawnCard, DrawnFace } from "./playerCard.ts";

/** The card's words, written beside the card: the quiet card's line, the board place, and the rarest find's rarity and day. */
export type CardWords = { quiet: boolean; quietLine: string; place: string; rarity: string | null; foundDay: string | null };

const cardSize = { width: 1200, height: 630 };

export type CardArt = { face: string | null; crest: string | null; rarest: string | null; people: (string | null)[]; emojis: (string | null)[] };

type Node = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown } };

type Child = Node | string | false | null;

const ink = { page: "#1e1f23", card: "#25262b", border: "#3e424f", text: "#f3f4f6", quiet: "#aeb3c4", accent: "#ff7a45", accentInk: "#ff9a6e", track: "#3a3c44", gold: "#f5b301" };

const rarityInk: Record<Rarity, string> = { common: "#aeb3c4", uncommon: "#4ade80", rare: "#60a5fa", epic: "#c084fc", legendary: "#fb923c" };

const medalInk: Record<MilestoneTier, string> = { bronze: "#d39a68", silver: "#bfc2c8", gold: "#e2b53a", diamond: "#7dd3fc" };

const fontFaces = [
  { url: roundHogRegularUrl, weight: 400 },
  { url: roundHogSemiBoldUrl, weight: 600 },
  { url: roundHogBoldUrl, weight: 700 },
] as const;

type Woff2Decompress = (woff2: Uint8Array) => Promise<Uint8Array>;

const decompress = createRequire(import.meta.url)("wawoff2/decompress.js") as Woff2Decompress;

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" };

let fonts: Promise<Font[]> | undefined;

function fontsOf() {
  fonts ??= decodedFonts().catch((error: unknown) => {
    fonts = undefined;
    throw error;
  });
  return fonts;
}

async function decodedFonts(): Promise<Font[]> {
  const decoded: Font[] = [];
  for (const { url, weight } of fontFaces) {
    const woff2 = await readFile(new URL(url));
    decoded.push({ name: "RoundHog", data: Buffer.from(await decompress(woff2)), weight, style: "normal" });
  }
  return decoded;
}

function h(type: string, style: Record<string, unknown>, ...children: Child[]): Node {
  const shown = children.filter((child): child is Node | string => child !== false && child !== null);
  return { type, props: { style: { display: "flex", boxSizing: "border-box", ...style }, children: shown.length === 1 ? shown[0] : shown } };
}

function picture(src: string, size: number, style: Record<string, unknown> = {}): Node {
  return { type: "img", props: { src, width: size, height: size, style: { width: size, height: size, ...style } } };
}

function cardTreeOf(card: DrawnCard, art: CardArt, words: CardWords): Node {
  return h(
    "div",
    { width: cardSize.width, height: cardSize.height, padding: 40, gap: 32, background: ink.page, color: ink.text, fontFamily: "RoundHog" },
    playerSideOf(card, art, words),
    card.hoggies === null ? null : rarestSideOf(card.hoggies.rarest, art, words),
  );
}

function playerSideOf(card: DrawnCard, art: CardArt, words: CardWords): Node {
  return h(
    "div",
    { flexDirection: "column", flexGrow: card.hoggies === null ? 1 : 0, width: card.hoggies === null ? undefined : 720, padding: 36, gap: 24, justifyContent: "space-between", borderRadius: 32, border: `2px solid ${ink.border}`, backgroundColor: ink.card, backgroundImage: "radial-gradient(circle at 0% 0%, rgba(255,122,69,0.16), rgba(255,122,69,0) 60%)" },
    h("div", { alignItems: "center", gap: 32 }, ringOf(card, art), whoOf(card, art)),
    rankStripOf(card, words),
    words.quiet ? quietLineIn(words) : statsOf(card, art),
  );
}

function ringOf({ face, level }: DrawnCard, art: CardArt): Node {
  const size = 176;
  const radius = 80;
  const around = 2 * Math.PI * radius;
  const ring = {
    type: "svg",
    props: {
      width: size,
      height: size,
      viewBox: `0 0 ${size} ${size}`,
      style: { position: "absolute", top: 0, left: 0 },
      children: [
        { type: "circle", props: { cx: size / 2, cy: size / 2, r: radius, fill: "none", stroke: ink.track, strokeWidth: 12 } },
        level !== null && { type: "circle", props: { cx: size / 2, cy: size / 2, r: radius, fill: "none", stroke: ink.accent, strokeWidth: 12, strokeLinecap: "round", strokeDasharray: `${around * Math.max(0.03, level.share)} ${around}`, transform: `rotate(-90 ${size / 2} ${size / 2})` } },
      ].filter(Boolean),
    },
  };
  return h(
    "div",
    { position: "relative", width: size, height: size, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    ring as Node,
    faceOf(face, art.face, 132),
    level === null ? null : h("div", { position: "absolute", bottom: -4, alignItems: "baseline", gap: 4, padding: "4px 16px", borderRadius: 999, backgroundColor: ink.accent, color: "#141414", border: `4px solid ${ink.card}` }, h("span", { fontSize: 20, fontWeight: 700 }, "LV"), h("span", { fontSize: 32, fontWeight: 700 }, String(level.level))),
  );
}

function faceOf(face: DrawnFace, drawn: string | null, size: number, style: Record<string, unknown> = {}): Node {
  if (drawn !== null) return picture(drawn, size, { borderRadius: size / 2, objectFit: "cover", ...style });
  return h("div", { width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: "#33353d", color: ink.quiet, fontSize: Math.round(size * 0.36), fontWeight: 700, ...style }, face.initials);
}

function whoOf({ name, team, level }: DrawnCard, art: CardArt): Node {
  return h(
    "div",
    { flexDirection: "column", gap: 10, flexGrow: 1, minWidth: 0 },
    h("div", { fontSize: 54, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.05, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, name),
    team === null ? h("div", { fontSize: 26, color: ink.quiet }, "No team yet") : h("div", { alignItems: "center", gap: 12, fontSize: 30, fontWeight: 600 }, art.crest === null ? null : picture(art.crest, 40), team.name),
    level === null ? null : h("div", { alignItems: "baseline", gap: 10, fontSize: 28 }, h("span", { fontWeight: 700 }, `${level.xp.toLocaleString("en-GB")} XP`), h("span", { color: ink.quiet }, `· level ${level.level}`)),
  );
}

function rankStripOf({ place }: DrawnCard, words: CardWords): Node {
  const ranked = place !== null;
  return h(
    "div",
    { alignItems: "center", gap: 16, padding: "16px 22px", borderRadius: 18, fontSize: 28, border: `2px solid ${ranked ? "rgba(245,179,1,0.5)" : "rgba(255,122,69,0.3)"}`, backgroundColor: ranked ? "rgba(245,179,1,0.12)" : "rgba(255,122,69,0.1)" },
    iconOf(ranked ? crown : heart, ranked ? ink.gold : ink.accentInk),
    h("span", { fontWeight: 700 }, words.place),
    ranked ? h("span", { color: ink.quiet }, `· ${place.kudosGiven} kudos`) : null,
  );
}

const crown = "M3 18h18l-1.5-10-5 4L12 5l-2.5 7-5-4z";

const heart = "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z";

function iconOf(path: string, colour: string): Node {
  return {
    type: "svg",
    props: { width: 34, height: 34, viewBox: "0 0 24 24", children: { type: "path", props: { d: path, fill: "none", stroke: colour, strokeWidth: 2, strokeLinejoin: "round" } } },
  };
}

function statsOf({ hoggies, people, emojis, medals }: DrawnCard, art: CardArt): Node {
  const cells: Child[][] = [
    ...(hoggies === null ? [] : [[h("div", { flexDirection: "column", gap: 10, flexGrow: 1 }, figureOf(hoggies.found, hoggies.total, "hoggies found"), barOf(hoggies.total === 0 ? 0 : hoggies.found / hoggies.total))]]),
    [stackOf(people.newest.map((face, index) => faceOf(face, art.people[index] ?? null, 38, stacked(index)))), figureOf(people.held, null, people.held === 1 ? "person" : "people")],
    [stackOf(art.emojis.map((drawn, index) => (drawn === null ? discOf("#4a4d57", index) : picture(drawn, 38, stacked(index))))), figureOf(emojis.count, null, emojis.count === 1 ? "emoji" : "emojis")],
    [stackOf(medals.best.map((tier, index) => discOf(medalInk[tier], index))), figureOf(medals.count, null, medals.count === 1 ? "medal" : "medals")],
  ];
  const line = `1px solid ${ink.border}`;
  const rows = [cells.slice(0, 2), cells.slice(2)];
  return h("div", { flexDirection: "column" }, ...rows.map((row, rowIndex) => h("div", { borderBottom: rowIndex === 0 ? line : undefined }, ...row.map((cell, index) => statCellOf(row.length === 1 ? { width: "100%" } : index === 0 ? { borderRight: line } : {}, ...cell)))));
}

function stacked(index: number): Record<string, unknown> {
  return { border: `3px solid ${ink.card}`, marginLeft: index === 0 ? 0 : -8 };
}

function discOf(colour: string, index: number): Node {
  return h("div", { width: 38, height: 38, borderRadius: 19, backgroundColor: colour, ...stacked(index) });
}

function statCellOf(edge: Record<string, unknown>, ...children: Child[]): Node {
  return h("div", { width: "50%", alignItems: "center", gap: 14, padding: "16px 20px", ...edge }, ...children);
}

function figureOf(figure: number, of: number | null, label: string): Node {
  return h(
    "div",
    { alignItems: "baseline", gap: 10 },
    h("span", { fontSize: 44, fontWeight: 700, letterSpacing: -1 }, String(figure)),
    of === null ? null : h("span", { fontSize: 22, fontWeight: 600, color: ink.quiet, marginLeft: -8 }, `/${of}`),
    h("span", { fontSize: 24, color: ink.quiet }, label),
  );
}

function barOf(share: number): Node {
  return h("div", { height: 12, borderRadius: 6, backgroundColor: ink.track, width: "100%" }, h("div", { height: 12, borderRadius: 6, backgroundColor: ink.accent, width: `${Math.max(3, Math.round(Math.min(1, share) * 100))}%` }));
}

function stackOf(shown: Node[]): Node {
  if (shown.length === 0) return h("div", { width: 30, height: 30, borderRadius: 15, border: `3px dashed ${ink.border}` });
  return h("div", {}, ...shown);
}

function quietLineIn(words: CardWords): Node {
  return h("div", { padding: "22px 4px", fontSize: 28, lineHeight: 1.3, color: ink.quiet, borderTop: `1px solid ${ink.border}` }, words.quietLine);
}

function rarestSideOf(rarest: NonNullable<DrawnCard["hoggies"]>["rarest"], art: CardArt, words: CardWords): Node {
  const colour = rarest === null ? ink.border : rarityInk[rarest.rarity];
  return h(
    "div",
    { flexDirection: "column", flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32, borderRadius: 32, border: `2px solid ${colour}`, backgroundColor: ink.card, backgroundImage: `radial-gradient(circle at 50% 30%, ${colour}33, ${colour}00 65%)` },
    h(
      "div",
      { width: 236, height: 236, borderRadius: 118, alignItems: "center", justifyContent: "center", border: `6px solid ${colour}`, backgroundColor: "#1a1b1f", color: ink.quiet, fontSize: 96, fontWeight: 700 },
      rarest === null || art.rarest === null ? "?" : picture(art.rarest, 196),
    ),
    h("div", { fontSize: 22, fontWeight: 700, letterSpacing: 2.5, color: ink.accentInk }, "RAREST FIND"),
    rarest === null ? h("div", { fontSize: 28, color: ink.quiet, textAlign: "center" }, "No hoggie found yet.") : h("div", { fontSize: 46, fontWeight: 700, letterSpacing: -1, textAlign: "center" }, rarest.name),
    rarest === null ? null : h("div", { fontSize: 24, fontWeight: 700, letterSpacing: 2, color: colour }, (words.rarity ?? "").toUpperCase()),
    rarest === null ? null : h("div", { fontSize: 22, color: ink.quiet }, `Found ${words.foundDay}`),
  );
}


/** The card's PNG, 1200×630. */
export async function drawnPicture(card: DrawnCard, art: CardArt, words: CardWords): Promise<Uint8Array> {
  const svg = await satori(cardTreeOf(card, art, words) as never, { ...cardSize, fonts: await fontsOf() });
  return new Resvg(svg, { fitTo: { mode: "width", value: cardSize.width } }).render().asPng();
}
