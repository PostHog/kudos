// The album's flags over the service, as today's convex/album/flag.ts decides them; Convex has no test file for it.
// Each flag decides on the definitions PostHog serves, stored as the refresh stores them. The reads the album shows
// behind a flag write nothing; kudos-emoji-picks decides in the parse hook's mutation, and hype-by-reactions decides
// and exposes the member once to what it decided.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import {
  adminHypeEmojisShownTo,
  albumOnProfileOf,
  albumShownTo,
  bookNextShownTo,
  emojiMappingInPlaceShownTo,
  emojiWizardShownTo,
  hypeByReactionsCollectFor,
  hypeByReactionsShownTo,
  kudosEmojiPicksCountFor,
  kudosEmojiPicksShownTo,
  ownHypePickShownTo,
  personPageDShownTo,
  randomEmojisShownTo,
  shareableUrlsShownTo,
} from "./flag.ts";

const now = Date.parse("2026-10-13T10:00:00Z");
const backend = useTestBackend({ now });
let t: TestBackend;
let alice: MemberId;

beforeEach(async () => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  t = backend();
  alice = await t.seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member", email: "alice@example.com" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const shownTo: Array<[string, (ctx: QueryContext, member: MemberId) => Promise<boolean>]> = [
  ["album", albumShownTo],
  ["random-emojis", randomEmojisShownTo],
  ["emoji-wizard", emojiWizardShownTo],
  ["emoji-mapping-in-place", emojiMappingInPlaceShownTo],
  ["shareable-urls", shareableUrlsShownTo],
  ["own-hype-pick", ownHypePickShownTo],
  ["admin-hype-emojis", adminHypeEmojisShownTo],
  ["kudos-emoji-picks", kudosEmojiPicksShownTo],
  ["person-page-d", personPageDShownTo],
  ["book-next", bookNextShownTo],
  ["hype-by-reactions", hypeByReactionsShownTo],
];

describe("what the album shows behind a flag", () => {
  // A member's analytics ID comes with their first decision in a mutation; a read decides on it and writes nothing.
  beforeEach(async () => {
    await t.run((ctx) => analyticsIdOf(ctx, alice));
  });

  test.each(shownTo)("%s shows to the member it is on for, and to no one it is off for, writing nothing", async (key, isShownTo) => {
    await definitionsStored(t.operations, onForEveryone(key));
    expect(await t.query((ctx) => isShownTo(ctx, alice))).toBe(true);

    await definitionsStored(t.operations, offForEveryone(key));
    expect(await t.query((ctx) => isShownTo(ctx, alice))).toBe(false);

    expect({ ids: (await t.seed.all("analyticsIds")).length, exposures: await t.seed.all("flagExposures") }).toEqual({ ids: 1, exposures: [] });
  });

  test("each flag decides on its own key: the album on and every other flag off shows only the album", async () => {
    await definitionsStored(t.operations, onForEveryone("album"), ...shownTo.slice(1).map(([key]) => offForEveryone(key)));

    expect(await t.query(async (ctx) => Promise.all(shownTo.map(([, isShownTo]) => isShownTo(ctx, alice))))).toEqual(shownTo.map(([key]) => key === "album"));
  });

  test("the profile names the album only where it is on", async () => {
    await definitionsStored(t.operations, onForEveryone("album"));
    expect(await t.query((ctx) => albumOnProfileOf(ctx, alice))).toEqual({ album: true });

    await definitionsStored(t.operations, offForEveryone("album"));
    expect(await t.query((ctx) => albumOnProfileOf(ctx, alice))).toEqual({});
  });
});

describe("what a mutation decides", () => {
  test("a member with no analytics ID, in a workspace with no key yet, gets the safe default, and the read makes neither", async () => {
    const bruno = await t.seed.insert("members", { workspace: "T1", user: "U_BRUNO", kind: "member", email: "bruno@example.com" });
    await definitionsStored(t.operations, onForEveryone("album"));

    expect(await t.query((ctx) => albumShownTo(ctx, bruno))).toBe(false);
    expect(await t.run((ctx) => albumShownTo(ctx, bruno)), "read inside a mutation, as the album's pages read it").toBe(false);
    expect({ ids: await t.seed.all("analyticsIds"), keys: await t.seed.all("workspaceKeys") }).toEqual({ ids: [], keys: [] });
  });

  test("kudos-emoji-picks counts the picks where it is on, and exposes no one", async () => {
    await definitionsStored(t.operations, onForEveryone("kudos-emoji-picks"));
    expect(await t.run((ctx) => kudosEmojiPicksCountFor(ctx, alice))).toBe(true);

    await definitionsStored(t.operations, offForEveryone("kudos-emoji-picks"));
    expect(await t.run((ctx) => kudosEmojiPicksCountFor(ctx, alice))).toBe(false);

    expect(await t.seed.all("flagExposures")).toEqual([]);
  });

  test("hype-by-reactions collects where it is on and exposes the member once to each value, however often it decides", async () => {
    await definitionsStored(t.operations, onForEveryone("hype-by-reactions"));
    expect(await t.run((ctx) => hypeByReactionsCollectFor(ctx, alice))).toBe(true);
    expect(await t.run((ctx) => hypeByReactionsCollectFor(ctx, alice))).toBe(true);

    await definitionsStored(t.operations, offForEveryone("hype-by-reactions"));
    expect(await t.run((ctx) => hypeByReactionsCollectFor(ctx, alice))).toBe(false);
    expect(await t.run((ctx) => hypeByReactionsCollectFor(ctx, alice))).toBe(false);

    expect((await t.seed.all("flagExposures")).map(({ member, flag, value }) => [member, flag, value])).toEqual([
      [alice, "hype-by-reactions", true],
      [alice, "hype-by-reactions", false],
    ]);
  });
});
