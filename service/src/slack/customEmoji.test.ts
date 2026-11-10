// Today's convex/slack/customEmoji.test.ts: the custom emoji sync through Slack's listing into the workspace's custom
// emoji directory (workspace/customEmoji.ts), and the emoji_changed events that ask for it through the front door.
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import type { TestBackend } from "../../testing/backend.ts";
import { rateLimitedFor, slackError } from "../../testing/fakeSlack.ts";
import { emojiChangedEvent, type EmojiChange } from "../../testing/slackMessages.ts";
import { customEmojiImageOf, customEmojiListedIn, customEmojiScopeMissingIn, forgetUnlistedCustomEmoji, originalCustomEmojiStartingWith } from "../workspace/customEmoji.ts";
import { syncCustomEmoji } from "./customEmoji.ts";
import { moveTo, sentTo, settle, useHugsBackend } from "./hugsTesting.ts";

const now = new Date("2026-10-14T10:00:00Z");

const parrotGif = "https://emoji.slack-edge.com/T1/partyparrot/1a2b3c.gif";
const fasterParrotGif = "https://emoji.slack-edge.com/T1/partyparrot/4d5e6f.gif";
const tacoPng = "https://emoji.slack-edge.com/T1/taco/7a8b9c.png";

const backend = useHugsBackend(now);
let logged: MockInstance[];

beforeEach(() => {
  logged = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the custom emoji sync keeps the workspace's custom emoji in the directory", () => {
  test("it keeps each custom emoji's image, and an alias with its original's image", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).withCustomEmoji("parrot", "alias:partyparrot").withCustomEmoji("taco", tacoPng);

    await sync(t);

    expect(await imagesOf(t, "partyparrot", "parrot", "taco", "tada")).toEqual({ partyparrot: parrotGif, parrot: parrotGif, taco: tacoPng, tada: undefined });
  });

  test("an alias of an alias gets the original's image, and aliases that only name each other get none", async () => {
    const t = backend();
    t.slack
      .withCustomEmoji("partyparrot", parrotGif)
      .withCustomEmoji("parrot", "alias:partyparrot")
      .withCustomEmoji("birb", "alias:parrot")
      .withCustomEmoji("ping", "alias:pong")
      .withCustomEmoji("pong", "alias:ping");

    await sync(t);

    expect(await imagesOf(t, "birb", "ping", "pong")).toEqual({ birb: parrotGif, ping: undefined, pong: undefined });
  });

  test("it keeps only https images: an http image, a data image, an alias of a standard emoji and an alias of an unknown one get none", async () => {
    const t = backend();
    t.slack
      .withCustomEmoji("plain", "http://emoji.slack-edge.com/T1/plain/1.png")
      .withCustomEmoji("inline", "data:image/png;base64,iVBORw0KGgo=")
      .withCustomEmoji("thumbs", "alias:thumbsup")
      .withCustomEmoji("dangling", "alias:gone")
      .withCustomEmoji("insecure", "alias:plain");

    await sync(t);

    expect(await imagesOf(t, "plain", "inline", "thumbs", "dangling", "insecure")).toEqual({ plain: undefined, inline: undefined, thumbs: undefined, dangling: undefined, insecure: undefined });
  });

  test("running it again follows Slack: a changed image, a removed emoji and a new one", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).withCustomEmoji("parrot", "alias:partyparrot").withCustomEmoji("blob", "https://emoji.slack-edge.com/T1/blob/1.png");
    await sync(t);

    t.slack.withCustomEmoji("partyparrot", fasterParrotGif).withoutCustomEmoji("blob").withCustomEmoji("taco", tacoPng);
    await sync(t);

    expect(await imagesOf(t, "partyparrot", "parrot", "blob", "taco")).toEqual({ partyparrot: fasterParrotGif, parrot: fasterParrotGif, blob: undefined, taco: tacoPng });
  });

  test("it keeps a whole list longer than one write takes, and forgets all of it once Slack lists none", async () => {
    const t = backend();
    const names = Array.from({ length: 1_200 }, (_, index) => `emoji_${index}`);
    const acrossBothWrites = names.filter((_, index) => index % 50 === 0 || index === 999 || index === 1_199);
    for (const name of names) t.slack.withCustomEmoji(name, `https://emoji.slack-edge.com/T1/${name}/1.png`);
    await sync(t);

    expect(await imagesOf(t, ...acrossBothWrites)).toEqual(Object.fromEntries(acrossBothWrites.map((name) => [name, `https://emoji.slack-edge.com/T1/${name}/1.png`])));

    for (const name of names) t.slack.withoutCustomEmoji(name);
    await sync(t);

    expect(await imagesOf(t, ...acrossBothWrites)).toEqual(Object.fromEntries(acrossBothWrites.map((name) => [name, undefined])));
  });

  test("an app without the emoji:read scope keeps none, fails nothing and logs nothing", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).answering("emoji.list", slackError("missing_scope"));

    await sync(t);

    expect(await imagesOf(t, "partyparrot")).toEqual({ partyparrot: undefined });
    for (const spy of logged) expect(spy).not.toHaveBeenCalled();
    expect(failuresLogged(t)).toEqual([]);
  });

  test("an app that lost the emoji:read scope forgets the custom emoji an earlier listing kept", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif);
    await sync(t);

    t.slack.answering("emoji.list", slackError("missing_scope"));
    const loggedBefore = t.logs.length;
    await sync(t);

    expect(await imagesOf(t, "partyparrot")).toEqual({ partyparrot: undefined });
    for (const spy of logged) expect(spy).not.toHaveBeenCalled();
    expect(failuresLogged(t, loggedBefore)).toEqual([]);
  });

  test("a rate-limited listing asks again after the Retry-After Slack gave", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).answering("emoji.list", rateLimitedFor(30));

    await syncing(t);
    await settle(t);

    const [first, second] = t.slack.timesOf("emoji.list");
    expect(second! - first!).toBe(30_000);
    expect(await imagesOf(t, "partyparrot")).toEqual({ partyparrot: parrotGif });
  });

  test("a listing Slack answered earlier changes nothing a listing asked for later already wrote", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif);
    const earlier = answeredNowReturnedLater();
    t.slack.answering("emoji.list", earlier.answer);
    const earlierSync = syncing(t);
    // Today's test waited for Slack's answer alone; a sync that ends at a stub before it asks Slack ends the test there.
    await Promise.race([earlier.reached, earlierSync]);

    t.slack.withCustomEmoji("partyparrot", fasterParrotGif).withCustomEmoji("taco", tacoPng);
    await sync(t);
    earlier.release();
    await earlierSync;
    await settle(t);

    expect(await imagesOf(t, "partyparrot", "taco")).toEqual({ partyparrot: fasterParrotGif, taco: tacoPng });
  });
});

describe("the directory's reads of what the sync kept", () => {
  // Today their callers are workspace/slackEmoji.ts and store/customKudosEmoji.ts, both still stubs in the service, so
  // the reads are proven here on what a sync keeps.
  test("the picker's search finds each original once by the start of any of its names, sorted, up to the limit", async () => {
    const t = backend();
    t.slack
      .withCustomEmoji("partyparrot", parrotGif)
      .withCustomEmoji("parrot", "alias:partyparrot")
      .withCustomEmoji("parrotwave", fasterParrotGif)
      .withCustomEmoji("pizza", tacoPng)
      .withCustomEmoji("taco", tacoPng)
      .withCustomEmoji("partyblob", "alias:partyparrot")
      .withCustomEmoji("partytime", "https://emoji.slack-edge.com/T1/partytime/1.png");
    await sync(t);

    const found = (typed: string, limit: number) => t.query((ctx) => originalCustomEmojiStartingWith(ctx, "T1", typed, limit));

    expect(await found("par", 5)).toEqual([
      { name: "parrotwave", image: fasterParrotGif },
      { name: "partyparrot", image: parrotGif },
      { name: "partytime", image: "https://emoji.slack-edge.com/T1/partytime/1.png" },
    ]);
    expect(await found("p", 2)).toEqual([
      { name: "parrotwave", image: fasterParrotGif },
      { name: "partyparrot", image: parrotGif },
    ]);
    // An alias and its original both match, so the search reads past them to fill the limit.
    expect(await found("party", 2)).toEqual([
      { name: "partyparrot", image: parrotGif },
      { name: "partytime", image: "https://emoji.slack-edge.com/T1/partytime/1.png" },
    ]);
    expect(await found("x", 5)).toEqual([]);
  });

  test("the listed emoji come by name, at most as many as asked for", async () => {
    const t = backend();
    t.slack.withCustomEmoji("taco", tacoPng).withCustomEmoji("partyparrot", parrotGif).withCustomEmoji("parrot", "alias:partyparrot");
    await sync(t);

    expect(await t.query((ctx) => customEmojiListedIn(ctx, "T1", 2))).toEqual([
      { name: "parrot", image: parrotGif },
      { name: "partyparrot", image: parrotGif },
    ]);
  });

  test("a listing without the emoji:read scope is remembered until a listing with it", async () => {
    const t = backend();
    const scopeMissing = () => t.query((ctx) => customEmojiScopeMissingIn(ctx, "T1"));
    expect(await scopeMissing()).toBe(false);

    t.slack.answering("emoji.list", slackError("missing_scope"));
    await sync(t);
    expect(await scopeMissing()).toBe(true);

    t.slack.withCustomEmoji("taco", tacoPng);
    await sync(t);
    expect(await scopeMissing()).toBe(false);
  });
});

describe("forgetting the emoji a listing didn't keep", () => {
  // S18's data move restarts a pending forgetUnlistedCustomEmoji from its row, so a second run of one listing's forgetting
  // must change nothing, and a run for any listing but the one that wrote last must forget nothing.
  test("run twice for one listing forgets each unlisted emoji once and keeps the rest", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).withCustomEmoji("taco", tacoPng);
    await sync(t);
    t.slack.withoutCustomEmoji("taco");
    await sync(t);
    const written = await listingWrittenLast(t);

    await forgetting(t, written);
    await forgetting(t, written);

    expect(await imagesOf(t, "partyparrot", "taco")).toEqual({ partyparrot: parrotGif, taco: undefined });
    expect((await t.seed.all("customEmoji")).map(({ name }) => name)).toEqual(["partyparrot"]);
  });

  test("run for a listing other than the one that wrote last forgets nothing", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).withCustomEmoji("taco", tacoPng);
    await sync(t);
    const written = await listingWrittenLast(t);

    await forgetting(t, written + 1);
    await forgetting(t, written - 1);

    expect(await imagesOf(t, "partyparrot", "taco")).toEqual({ partyparrot: parrotGif, taco: tacoPng });
  });
});

describe("emoji_changed brings the custom emoji up to date", () => {
  test("an added, renamed or removed custom emoji follows Slack once its change arrives", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif);
    await sync(t);

    t.slack.withCustomEmoji("taco", tacoPng);
    expect((await emojiChanged(t, { subtype: "add", name: "taco", value: tacoPng })).status).toBe(200);
    await settle(t);
    expect(await imagesOf(t, "taco")).toEqual({ taco: tacoPng });

    t.slack.withoutCustomEmoji("partyparrot").withCustomEmoji("party_parrot", parrotGif);
    await emojiChanged(t, { subtype: "rename", old_name: "partyparrot", new_name: "party_parrot", value: parrotGif });
    await settle(t);
    expect(await imagesOf(t, "partyparrot", "party_parrot")).toEqual({ partyparrot: undefined, party_parrot: parrotGif });

    t.slack.withoutCustomEmoji("taco");
    await emojiChanged(t, { subtype: "remove", names: ["taco"] });
    await settle(t);
    expect(await imagesOf(t, "taco")).toEqual({ taco: undefined });
  });

  test("a burst of changes, and a change Slack delivers again, list the emoji once", async () => {
    const t = backend();
    for (const name of ["one", "two", "three", "four", "five"]) {
      t.slack.withCustomEmoji(name, `https://emoji.slack-edge.com/T1/${name}/1.png`);
      await emojiChanged(t, { subtype: "add", name, value: `https://emoji.slack-edge.com/T1/${name}/1.png` }, { eventId: `Ev_${name}` });
    }
    await emojiChanged(t, { subtype: "add", name: "five", value: "https://emoji.slack-edge.com/T1/five/1.png" }, { eventId: "Ev_five" });
    await settle(t);

    expect(t.slack.callsTo("emoji.list")).toHaveLength(1);
    expect(await imagesOf(t, "one", "five")).toEqual({ one: "https://emoji.slack-edge.com/T1/one/1.png", five: "https://emoji.slack-edge.com/T1/five/1.png" });
  });

  test("a change after a refresh that failed lists the emoji again once that refresh was due", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).answering("auth.test", slackError("internal_error"));
    await emojiChanged(t, { subtype: "add", name: "partyparrot", value: parrotGif });
    await settle(t);
    expect(await imagesOf(t, "partyparrot")).toEqual({ partyparrot: undefined });

    await emojiChanged(t, { subtype: "add", name: "taco", value: tacoPng });
    t.slack.withCustomEmoji("taco", tacoPng);
    await settle(t);

    expect(await imagesOf(t, "partyparrot", "taco")).toEqual({ partyparrot: parrotGif, taco: tacoPng });
  });

  test("a change that arrives while a listing is under way lists the emoji again", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif);
    const underWay = answeredNowReturnedLater();
    t.slack.answering("emoji.list", underWay.answer);
    await emojiChanged(t, { subtype: "add", name: "partyparrot", value: parrotGif });
    // Today's `vi.runOnlyPendingTimers()`: the refresh the change asked for falls due and starts, and runs on its own.
    moveTo(t, t.clock.now() + 30_000);
    const listing = t.settle();
    // The listing must be under way, held at Slack's answer; a refresh that settled first proves nothing.
    let held = false;
    await Promise.race([underWay.reached.then(() => (held = true)), listing]);
    if (!held) throw new Error("the refresh settled before it reached Slack's held answer: no listing was under way");

    t.slack.withCustomEmoji("taco", tacoPng);
    await emojiChanged(t, { subtype: "add", name: "taco", value: tacoPng });
    underWay.release();
    await listing;
    await settle(t);

    expect(await imagesOf(t, "partyparrot", "taco")).toEqual({ partyparrot: parrotGif, taco: tacoPng });
  });
});

/** What the service logged as failing since `from`: an error line, or a job that ended in an error. Today's console spies. */
function failuresLogged(t: TestBackend, from = 0) {
  return t.logs.slice(from).filter(({ level, message, fields }) => level === "error" || (message === "job" && fields.error !== undefined));
}

/** Today's `t.action(internal.slack.customEmoji.syncCustomEmoji, {})`: the sync job's body, run once now. */
function syncing(t: TestBackend) {
  return t.operations.action("slack.customEmoji.syncCustomEmoji", (ctx) => syncCustomEmoji(ctx, {}));
}

async function sync(t: TestBackend) {
  await syncing(t);
  await settle(t);
}

/** The number of the listing that wrote last in the one workspace. */
async function listingWrittenLast(t: TestBackend) {
  const [listings] = (await t.seed.all("customEmojiListings")) as Array<{ written?: number }>;
  if (listings?.written === undefined) throw new Error("no listing has written yet");
  return listings.written;
}

/** One run of the job that forgets what `listing` didn't keep, as a restart after the data move runs it. */
function forgetting(t: TestBackend, listing: number) {
  return t.run((ctx) => forgetUnlistedCustomEmoji(ctx, { workspace: "T1", listing }));
}

function emojiChanged(t: TestBackend, change: EmojiChange, options: { eventId?: string } = {}) {
  return sentTo(t, "emojiChanged", "slack.customEmoji.emojiChanged", emojiChangedEvent(change, options));
}

function answeredNowReturnedLater() {
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  let signalReached = () => {};
  const reached = new Promise<void>((resolve) => (signalReached = resolve));
  const answer = async (answerAsSlackWould: () => Response) => {
    const answered = answerAsSlackWould();
    signalReached();
    await released;
    return answered;
  };
  return { answer, reached, release };
}

async function imagesOf(t: TestBackend, ...names: string[]) {
  const images = await t.query((ctx) => Promise.all(names.map(async (name) => (await customEmojiImageOf(ctx, "T1", name)) ?? null)));
  return Object.fromEntries(names.map((name, index) => [name, images[index] ?? undefined]));
}
