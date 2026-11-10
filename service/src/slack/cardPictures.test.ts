import { afterEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { definitionsStored, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { workspaceDecision } from "../analytics/flags.ts";
import { storedFile } from "../db/files.ts";
import type { MemberId } from "../workspace/directory.ts";
import { drawn } from "./cardDrawing.ts";
import { cardImageFlag, cardImageShownIn, drawnCardOf, drawnEmojisOf, pictureAt } from "./cardPictures.ts";
import { cardKeyOf, type DrawnCard } from "./playerCard.ts";

const site = "https://hedgehug.example";

const card: DrawnCard = {
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

const backend = useTestBackend();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function member(t: ReturnType<typeof backend>) {
  return t.seed.insert("members", { workspace: "T1", user: "U1", kind: "member" }) as Promise<MemberId>;
}

describe("GET /cards/:id serves a stored file to anyone", { timeout: 60_000 }, () => {
  test("a kept card's picture is its PNG, cached for good", async () => {
    vi.stubEnv("SITE_URL", site);
    const t = backend();
    const url = await t.operations.action("slack.cardDrawing.drawn", async (ctx) => drawn(ctx, { card, key: await cardKeyOf(card) }));
    const path = url!.slice(site.length);

    const answer = await t.app.request(path);

    expect(path).toMatch(/^\/cards\/[^/]+$/);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("content-type")).toBe("image/png");
    expect(answer.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const png = new Uint8Array(await answer.arrayBuffer());
    expect(answer.headers.get("content-length")).toBe(String(png.byteLength));
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test("an unknown file answers 404", async () => {
    const t = backend();

    expect((await t.app.request("/cards/no-such-file")).status).toBe(404);
  });

  test("a file that isn't a picture is served in a sandbox, so it can't run as a page of the site", async () => {
    const t = backend();
    const id = await t.run((ctx) => storedFile(ctx, new TextEncoder().encode("<script>alert(1)</script>"), "text/html"));

    const answer = await t.app.request(`/cards/${id}`);

    expect(answer.status).toBe(200);
    expect(answer.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("a file stored without a content type is served as bytes", async () => {
    const t = backend();
    const id = await t.run((ctx) => storedFile(ctx, new Uint8Array([1, 2, 3]), null));

    const answer = await t.app.request(`/cards/${id}`);

    expect(answer.headers.get("content-type")).toBe("application/octet-stream");
    expect([...new Uint8Array(await answer.arrayBuffer())]).toEqual([1, 2, 3]);
  });
});

describe("the card picture's reads", () => {
  test("no picture is kept under a key never drawn", async () => {
    vi.stubEnv("SITE_URL", site);
    const t = backend();

    expect(await t.query((ctx) => pictureAt(ctx, { key: "never-drawn" }))).toBeNull();
  });

  test("the card-image flag is off for a workspace without a key, and follows PostHog once it has one", async () => {
    postHogDeciding("sandbox");
    const t = backend();
    await definitionsStored(t.operations, onForEveryone(cardImageFlag.key));

    expect(await t.query((ctx) => cardImageShownIn(ctx, { workspace: "T1" }))).toBe(false);
    await t.run((ctx) => workspaceDecision(ctx, cardImageFlag, "T1"));
    expect(await t.query((ctx) => cardImageShownIn(ctx, { workspace: "T1" }))).toBe(true);
  });

  test("a workspace other than the site's draws no card", async () => {
    vi.stubEnv("SITE_URL", site);
    vi.stubEnv("SLACK_WORKSPACE_ID", "T2");
    const t = backend();
    const person = await member(t);

    expect(await t.query((ctx) => drawnCardOf(ctx, { workspace: "T1", person }))).toBeNull();
    expect(await t.query((ctx) => drawnEmojisOf(ctx, { workspace: "T1", person }))).toBeNull();
  });

  waitsOn(["S17"], "the site's workspace draws a member's card from their player card", async () => {
    vi.stubEnv("SITE_URL", site);
    vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
    const t = backend();
    const person = await member(t);

    expect(await t.query((ctx) => drawnCardOf(ctx, { workspace: "T1", person }))).toMatchObject({ face: { initials: expect.any(String) } });
  });

  waitsOn(["S9"], "the site's workspace draws a member's emojis from their emoji stack", async () => {
    vi.stubEnv("SITE_URL", site);
    vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
    const t = backend();
    const person = await member(t);

    expect(await t.query((ctx) => drawnEmojisOf(ctx, { workspace: "T1", person }))).toEqual({ count: 0, pictures: [] });
  });
});
