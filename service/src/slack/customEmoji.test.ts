// Today's convex/slack/customEmoji.test.ts. Every listing writes through S3's custom emoji directory (the listing's
// start, each write, forgetting the unlisted, and the refresh claim an emoji_changed event takes), so each test waits on
// S3. The listing's own steps that reach no other stack are proven in customEmojiSync.test.ts.
import { afterEach, beforeEach, describe, expect, vi, type MockInstance } from "vitest";
import type { TestBackend } from "../../testing/backend.ts";
import { rateLimitedFor, slackError } from "../../testing/fakeSlack.ts";
import { emojiChangedEvent, type EmojiChange } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { customEmojiImageOf } from "../workspace/customEmoji.ts";
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
  waitsOn(["S3"], "it keeps each custom emoji's image, and an alias with its original's image", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).withCustomEmoji("parrot", "alias:partyparrot").withCustomEmoji("taco", tacoPng);

    await sync(t);

    expect(await imagesOf(t, "partyparrot", "parrot", "taco", "tada")).toEqual({ partyparrot: parrotGif, parrot: parrotGif, taco: tacoPng, tada: undefined });
  });

  waitsOn(["S3"], "an alias of an alias gets the original's image, and aliases that only name each other get none", async () => {
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

  waitsOn(["S3"], "it keeps only https images: an http image, a data image, an alias of a standard emoji and an alias of an unknown one get none", async () => {
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

  waitsOn(["S3"], "running it again follows Slack: a changed image, a removed emoji and a new one", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).withCustomEmoji("parrot", "alias:partyparrot").withCustomEmoji("blob", "https://emoji.slack-edge.com/T1/blob/1.png");
    await sync(t);

    t.slack.withCustomEmoji("partyparrot", fasterParrotGif).withoutCustomEmoji("blob").withCustomEmoji("taco", tacoPng);
    await sync(t);

    expect(await imagesOf(t, "partyparrot", "parrot", "blob", "taco")).toEqual({ partyparrot: fasterParrotGif, parrot: fasterParrotGif, blob: undefined, taco: tacoPng });
  });

  waitsOn(["S3"], "it keeps a whole list longer than one write takes, and forgets all of it once Slack lists none", async () => {
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

  waitsOn(["S3"], "an app without the emoji:read scope keeps none, fails nothing and logs nothing", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).answering("emoji.list", slackError("missing_scope"));

    await sync(t);

    expect(await imagesOf(t, "partyparrot")).toEqual({ partyparrot: undefined });
    for (const spy of logged) expect(spy).not.toHaveBeenCalled();
  });

  waitsOn(["S3"], "an app that lost the emoji:read scope forgets the custom emoji an earlier listing kept", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif);
    await sync(t);

    t.slack.answering("emoji.list", slackError("missing_scope"));
    await sync(t);

    expect(await imagesOf(t, "partyparrot")).toEqual({ partyparrot: undefined });
    for (const spy of logged) expect(spy).not.toHaveBeenCalled();
  });

  waitsOn(["S3"], "a rate-limited listing asks again after the Retry-After Slack gave", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif).answering("emoji.list", rateLimitedFor(30));

    await syncing(t);
    await settle(t);

    const [first, second] = t.slack.timesOf("emoji.list");
    expect(second! - first!).toBe(30_000);
    expect(await imagesOf(t, "partyparrot")).toEqual({ partyparrot: parrotGif });
  });

  waitsOn(["S3"], "a listing Slack answered earlier changes nothing a listing asked for later already wrote", async () => {
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

describe("emoji_changed brings the custom emoji up to date", () => {
  waitsOn(["S3"], "an added, renamed or removed custom emoji follows Slack once its change arrives", async () => {
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

  waitsOn(["S3"], "a burst of changes, and a change Slack delivers again, list the emoji once", async () => {
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

  waitsOn(["S3"], "a change after a refresh that failed lists the emoji again once that refresh was due", async () => {
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

  waitsOn(["S3"], "a change that arrives while a listing is under way lists the emoji again", async () => {
    const t = backend();
    t.slack.withCustomEmoji("partyparrot", parrotGif);
    const underWay = answeredNowReturnedLater();
    t.slack.answering("emoji.list", underWay.answer);
    await emojiChanged(t, { subtype: "add", name: "partyparrot", value: parrotGif });
    // Today's `vi.runOnlyPendingTimers()`: the refresh the change asked for falls due and starts, and runs on its own.
    moveTo(t, t.clock.now() + 30_000);
    const listing = t.settle();
    await Promise.race([underWay.reached, listing]);

    t.slack.withCustomEmoji("taco", tacoPng);
    await emojiChanged(t, { subtype: "add", name: "taco", value: tacoPng });
    underWay.release();
    await listing;
    await settle(t);

    expect(await imagesOf(t, "partyparrot", "taco")).toEqual({ partyparrot: parrotGif, taco: tacoPng });
  });
});

/** Today's `t.action(internal.slack.customEmoji.syncCustomEmoji, {})`: the sync job's body, run once now. */
function syncing(t: TestBackend) {
  return t.operations.action("slack.customEmoji.syncCustomEmoji", (ctx) => syncCustomEmoji(ctx, {}));
}

async function sync(t: TestBackend) {
  await syncing(t);
  await settle(t);
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
