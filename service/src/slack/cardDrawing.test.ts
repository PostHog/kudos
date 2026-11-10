import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { files } from "../db/schema/service.ts";
import { cardPictures } from "../db/schema/slack.ts";
import { cardPictureOf, cardWordsOf, drawn } from "./cardDrawing.ts";
import { pictureAt } from "./cardPictures.ts";
import { renderedCard } from "./cardRenderer.ts";
import { cardKeyOf, type DrawnCard } from "./playerCard.ts";

const site = "https://hedgehug.example";

const richMember: DrawnCard = {
  name: "Wren Alder",
  face: { picture: "https://res.cloudinary.com/posthog/wren.png", initials: "WA" },
  level: { level: 8, xp: 2310, share: 0.62 },
  team: { name: "Kettle Works", crest: "https://res.cloudinary.com/posthog/kettle-works.png" },
  place: { rank: 1, tied: false, kudosGiven: 7 },
  hoggies: { found: 64, total: 151, rarest: { name: "Wizard", rarity: "legendary", picture: `${site}/share/wizard.png`, foundAt: Date.UTC(2026, 9, 3) } },
  people: { held: 24, newest: [{ picture: null, initials: "IF" }, { picture: null, initials: "BO" }, { picture: null, initials: "JP" }] },
  emojis: { count: 7, pictures: [`${site}/emoji/team-kettle-works.png`] },
  medals: { count: 4, best: ["gold", "silver", "bronze"] },
};

const quietMember: DrawnCard = {
  name: "Ivo Fenn",
  face: { picture: null, initials: "IF" },
  level: { level: 1, xp: 0, share: 0 },
  team: null,
  place: null,
  hoggies: { found: 0, total: 151, rarest: null },
  people: { held: 0, newest: [] },
  emojis: { count: 0, pictures: [] },
  medals: { count: 0, best: [] },
};

const noArt = { face: null, crest: null, rarest: null, people: [], emojis: [] };

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const backend = useTestBackend();

const rendered = (card: DrawnCard) => renderedCard(card, noArt, cardWordsOf(card));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function drawnBy(t: ReturnType<typeof backend>, card: DrawnCard, key: string) {
  return t.operations.action("slack.cardDrawing.drawn", (ctx) => drawn(ctx, { card, key }));
}

async function storedIn(t: ReturnType<typeof backend>) {
  return t.query(async ({ tx }) => ({ rows: await tx.select().from(cardPictures), files: await tx.select({ _id: files._id }).from(files) }));
}

describe("LP99: the player card is drawn as a PNG", { timeout: 60_000 }, () => {
  test.each([
    ["a rich member", richMember],
    ["a quiet member", quietMember],
    ["a member whose hoggies are hidden", { ...richMember, hoggies: null }],
  ])("%s's card is a 1200×630 PNG small enough for Slack to fetch", async (_, card) => {
    const png = await cardPictureOf(card, noArt);

    expect([...png.subarray(0, 8)]).toEqual(pngSignature);
    expect(dimensionsOf(png)).toEqual({ width: 1200, height: 630 });
    expect(png.byteLength).toBeGreaterThan(10_000);
    expect(png.byteLength).toBeLessThan(1_000_000);
  });

  test("a drawn card is stored under its key, and the same key keeps the first picture", async () => {
    vi.stubEnv("SITE_URL", site);
    const t = backend();
    vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));
    const key = await cardKeyOf(richMember);

    const first = await drawnBy(t, richMember, key);
    const again = await drawnBy(t, richMember, key);

    const stored = await storedIn(t);
    expect(stored.rows.map((row) => row.key)).toEqual([key]);
    expect(stored.files).toHaveLength(1);
    expect(first).toBe(`${site}/cards/${stored.files[0]!._id}`);
    expect(again).toBe(first);
    expect(await t.query((ctx) => pictureAt(ctx, { key }))).toBe(first);
  });

  test.each([503, 429, 408])("a picture drawn while its art answered %i is shown but not kept, so the next share draws it again", async (status) => {
    vi.stubEnv("SITE_URL", site);
    const t = backend();
    vi.stubGlobal("fetch", async () => new Response("try later", { status }));
    const key = await cardKeyOf(richMember);

    const shown = await drawnBy(t, richMember, key);
    await drawnBy(t, richMember, key);

    const stored = await storedIn(t);
    expect(shown).toMatch(/^https:/);
    expect(stored.rows).toEqual([]);
    expect(stored.files).toHaveLength(2);
    expect(await t.query((ctx) => pictureAt(ctx, { key }))).toBeNull();
  });
});

describe("cards render one at a time in a worker thread", { timeout: 60_000 }, () => {
  test("the event loop stays free while cards draw", async () => {
    await rendered(quietMember);
    const before = performance.eventLoopUtilization();

    await Promise.all([rendered(richMember), rendered(quietMember), rendered({ ...richMember, hoggies: null })]);

    expect(performance.eventLoopUtilization(before).utilization).toBeLessThan(0.5);
  });

  test("cards sent at once each come back as their own picture", async () => {
    const cards = [richMember, quietMember, { ...richMember, hoggies: null }];
    const alone: Uint8Array[] = [];
    for (const card of cards) alone.push(await rendered(card));

    const together = await Promise.all(cards.map(rendered));

    expect(together.map((png) => Buffer.from(png))).toEqual(alone.map((png) => Buffer.from(png)));
    expect(new Set(together.map((png) => png.byteLength)).size).toBe(3);
  });
});

describe("LP101: a card's key is a hash of its facts", () => {
  test("the same facts give the same key", async () => {
    expect(await cardKeyOf({ ...richMember })).toBe(await cardKeyOf(richMember));
    expect(await cardKeyOf(richMember)).toMatch(/^[0-9a-f]{64}$/);
  });

  test.each<[string, Partial<DrawnCard>]>([
    ["name", { name: "Wren A." }],
    ["face", { face: { picture: null, initials: "WA" } }],
    ["level", { level: { level: 8, xp: 2311, share: 0.62 } }],
    ["team", { team: null }],
    ["place", { place: { rank: 2, tied: false, kudosGiven: 7 } }],
    ["hoggies", { hoggies: { ...richMember.hoggies!, found: 65 } }],
    ["rarest", { hoggies: { ...richMember.hoggies!, rarest: null } }],
    ["people", { people: { ...richMember.people, held: 25 } }],
    ["newest faces", { people: { ...richMember.people, newest: richMember.people.newest.slice(1) } }],
    ["emojis", { emojis: { ...richMember.emojis, count: 8 } }],
    ["medals", { medals: { count: 5, best: ["gold", "silver", "bronze"] } }],
    ["best medals", { medals: { count: 4, best: ["diamond", "silver", "bronze"] } }],
  ])("a changed %s gives a new key", async (_, change) => {
    expect(await cardKeyOf({ ...richMember, ...change })).not.toBe(await cardKeyOf(richMember));
  });
});

function dimensionsOf(png: Uint8Array) {
  const header = new DataView(png.buffer, png.byteOffset + 16, 8);
  return { width: header.getUint32(0), height: header.getUint32(4) };
}
