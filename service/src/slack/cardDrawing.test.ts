import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { files } from "../db/schema/service.ts";
import { cardPictures } from "../db/schema/slack.ts";
import { artOf, cardPictureOf, cardWordsOf, drawn } from "./cardDrawing.ts";
import { pictureAt } from "./cardPictures.ts";
import { cardRenderer, renderedCard } from "./cardRenderer.ts";
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

describe("a renderer thread that fails is replaced, and the next card draws", { timeout: 30_000 }, () => {
  const fixture = new URL("../../testing/cardRendererFixture.worker.ts", import.meta.url);
  const named = (name: string) => ({ ...quietMember, name });
  const answerOf = (png: Uint8Array) => new TextDecoder().decode(png);

  test("a card queued behind one whose thread crashed draws on a new thread", async () => {
    const render = cardRenderer(fixture, { deadlineMs: 10_000 });
    const before = answerOf(await render(named("before"), noArt, cardWordsOf(quietMember)));

    const [crashed, after] = await Promise.allSettled([render(named("crash"), noArt, cardWordsOf(quietMember)), render(named("after"), noArt, cardWordsOf(quietMember))]);

    expect(crashed.status).toBe("rejected");
    expect(after.status).toBe("fulfilled");
    const drawnAfter = answerOf((after as PromiseFulfilledResult<Uint8Array>).value);
    expect(drawnAfter).toMatch(/^after on thread \d+$/);
    expect(drawnAfter.split(" ").at(-1)).not.toBe(before.split(" ").at(-1));
  });

  test("a render past its deadline fails, and the card queued behind it draws on a new thread", async () => {
    const render = cardRenderer(fixture, { deadlineMs: 300 });

    const [stalled, after] = await Promise.allSettled([render(named("stall"), noArt, cardWordsOf(quietMember)), render(named("after"), noArt, cardWordsOf(quietMember))]);

    expect(stalled.status).toBe("rejected");
    expect(String((stalled as PromiseRejectedResult).reason)).toMatch(/deadline/);
    expect(after.status).toBe("fulfilled");
    expect(answerOf((after as PromiseFulfilledResult<Uint8Array>).value)).toMatch(/^after on thread \d+$/);
  });

  test("an idle renderer thread doesn't hold the process open", async () => {
    const renderer = new URL("./cardRenderer.ts", import.meta.url).href;
    const words = { quiet: "", quietLine: "", place: "", rarity: null, foundDay: null };
    const script = `const { renderedCard } = await import(${JSON.stringify(renderer)});
const png = await renderedCard(${JSON.stringify(quietMember)}, ${JSON.stringify(noArt)}, ${JSON.stringify(words)});
console.log("drawn", png.byteLength);`;
    const folder = mkdtempSync(join(tmpdir(), "card-renderer-"));
    const file = join(folder, "drawOne.mjs");
    writeFileSync(file, script);
    onTestFinished(() => rmSync(folder, { recursive: true, force: true }));
    const child = spawn(process.execPath, [file], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));

    const exited = await new Promise<number | "still running">((resolve) => {
      const late = setTimeout(() => (child.kill(), resolve("still running")), 25_000);
      child.on("exit", (code) => (clearTimeout(late), resolve(code ?? -1)));
    });

    expect(out).toMatch(/^drawn \d+/);
    expect(exited).toBe(0);
  });
});

describe("art is bounded before it reaches the renderer", () => {
  const face = "https://res.cloudinary.com/posthog/face.png";
  const withFace = { ...quietMember, face: { picture: face, initials: "IF" } };
  const answering = (bytes: Uint8Array, type: string) => vi.stubGlobal("fetch", async () => new Response(Buffer.from(bytes), { headers: { "content-type": type } }));

  test.each([
    ["a PNG", pngOf(64, 64), "image/png"],
    ["a JPEG", jpegOf(64, 64), "image/jpeg"],
    ["a GIF", gifOf(64, 64), "image/gif"],
  ])("%s within the ceiling is drawn", async (_, bytes, type) => {
    answering(bytes, type);

    const { art, lasting } = await artOf(withFace);

    expect(art.face).toBe(`data:${type};base64,${Buffer.from(bytes).toString("base64")}`);
    expect(lasting).toBe(true);
  });

  test.each([
    ["a PNG wider than the ceiling", pngOf(20_000, 64), "image/png"],
    ["a PNG taller than the ceiling", pngOf(64, 20_000), "image/png"],
    ["a JPEG larger than the ceiling", jpegOf(30_000, 30_000), "image/jpeg"],
    ["a GIF larger than the ceiling", gifOf(9_000, 9_000), "image/gif"],
    ["a file whose header isn't its type's", new TextEncoder().encode("not a picture at all"), "image/png"],
    ["a file past the download cap", padded(pngOf(64, 64), 3 * 1_048_576), "image/png"],
  ])("%s isn't drawn, and the card keeps without it", async (_, bytes, type) => {
    answering(bytes, type);

    const { art, lasting } = await artOf(withFace);

    expect(art.face).toBeNull();
    expect(lasting).toBe(true);
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

function pngOf(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set(pngSignature);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

function jpegOf(width: number, height: number) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

function gifOf(width: number, height: number) {
  return new Uint8Array([...new TextEncoder().encode("GIF89a"), width & 0xff, width >> 8, height & 0xff, height >> 8, 0, 0, 0, 0x3b]);
}

function padded(bytes: Uint8Array, size: number) {
  const all = new Uint8Array(size);
  all.set(bytes);
  return all;
}

function dimensionsOf(png: Uint8Array) {
  const header = new DataView(png.buffer, png.byteOffset + 16, 8);
  return { width: header.getUint32(0), height: header.getUint32(4) };
}
