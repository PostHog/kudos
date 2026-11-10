// Ported from convex/feedback/teaser.test.ts: the teaser counts what waits for a member, the items they haven't opened
// and the kudos that came in since their last visit. The oracle reads it where App Home's front door and the Monday hugs
// recap show it; those are S17's and S13's journeys. Here the line's copy runs as it is, and what it counts reads S8's
// items and flags, S17's last visit and S4's awards, so those steps are declared waiting.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import type { FlagDefinition } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEmails, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import { emoji, mention, messageEvent, section, text } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { moveLastVisitTo } from "../website/lastVisit.ts";
import type { MemberId } from "../workspace/directory.ts";
import { teaserLine, teaserOf } from "./teaser.ts";

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const teaserOn = ["website", "xp-levels", "hugs", "message-settings", "hidden-items", "teasers", "album"];

const backend = useTestBackend({ now: tuesday });
type Backend = ReturnType<typeof backend>;

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  postHogDeciding("sandbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("LP38 LP39 LP41: the teaser's line", () => {
  test("reads how many items wait: 1 item waits for one, the count past one, 50+ past fifty, and nothing while none waits", () => {
    expect(teaserLine({ waiting: 3, kudosSinceLastVisit: null })).toBe("3 items wait");
    expect(teaserLine({ waiting: 1, kudosSinceLastVisit: null })).toBe("1 item waits");
    expect(teaserLine({ waiting: "50+", kudosSinceLastVisit: null })).toBe("50+ items wait");
    expect(teaserLine({ waiting: 0, kudosSinceLastVisit: null })).toBeNull();
  });

  test("adds the kudos that came in since the last visit, alone when nothing waits, and 50+ past fifty", () => {
    expect(teaserLine({ waiting: 2, kudosSinceLastVisit: 2 })).toBe("2 items wait · 2 kudos came in since your last visit");
    expect(teaserLine({ waiting: 0, kudosSinceLastVisit: 1 })).toBe("1 kudos came in since your last visit");
    expect(teaserLine({ waiting: 0, kudosSinceLastVisit: 50 })).toBe("50 kudos came in since your last visit");
    expect(teaserLine({ waiting: 0, kudosSinceLastVisit: 51 })).toBe("50+ kudos came in since your last visit");
  });

  test("leaves the kudos out before a first visit, and while none came in since it", () => {
    expect(teaserLine({ waiting: 2, kudosSinceLastVisit: null })).toBe("2 items wait");
    expect(teaserLine({ waiting: 2, kudosSinceLastVisit: 0 })).toBe("2 items wait");
    expect(teaserLine({ waiting: 0, kudosSinceLastVisit: 0 })).toBeNull();
  });
});

describe("what the teaser counts", () => {
  waitsOn(["S4", "S8", "S17"], "kudos before a first visit are left out, and with nothing waiting there is no teaser", async () => {
    const t = await aWorkspace(teaserOn.map(onForEveryone));
    const bob = await member(t, "U_BOB");
    await member(t, "U_ALICE");

    await thanks(t, "U_ALICE", "U_BOB");

    expect(await t.query((ctx) => teaserOf(ctx, bob))).toBeNull();
  });

  waitsOn(["S4", "S8", "S17"], "three kudos emojis in one message count three kudos since the last visit", async () => {
    const t = await aWorkspace(teaserOn.map(onForEveryone));
    const bob = await member(t, "U_BOB");
    await member(t, "U_CAROL");
    await t.run((ctx) => moveLastVisitTo(ctx, bob, ctx.now));
    await t.time.advance(minuteMs);

    await thanks(t, "U_CAROL", "U_BOB", { emojis: 3 });

    expect(await t.query((ctx) => teaserOf(ctx, bob))).toBe("3 kudos came in since your last visit");
  });

  waitsOn(["S4", "S8", "S17"], "a kudos Slack delivered after the last visit counts, even when it was sent before it", async () => {
    const t = await aWorkspace(teaserOn.map(onForEveryone));
    const bob = await member(t, "U_BOB");
    await member(t, "U_CAROL");
    const sentBeforeTheVisit = t.clock.now();
    await t.time.advance(minuteMs);
    await t.run((ctx) => moveLastVisitTo(ctx, bob, ctx.now));
    await t.time.advance(minuteMs);

    await thanks(t, "U_CAROL", "U_BOB", { sentAt: sentBeforeTheVisit });

    expect(await t.query((ctx) => teaserOf(ctx, bob))).toBe("1 kudos came in since your last visit");
  });

  for (const { condition, flags } of [
    { condition: "with teasers off", flags: [...teaserOn.filter((key) => key !== "teasers").map(onForEveryone), offForEveryone("teasers")] },
    { condition: "with teasers on but hidden-items off", flags: [...teaserOn.filter((key) => key !== "hidden-items").map(onForEveryone), offForEveryone("hidden-items")] },
    { condition: "with teasers on for someone else's email only", flags: [...teaserOn.filter((key) => key !== "teasers").map(onForEveryone), onForEmails("teasers", "erin@example.com")] },
  ]) {
    waitsOn(["S4", "S8", "S17"], `${condition}, kudos since the last visit show no teaser`, async () => {
      const t = await aWorkspace(flags);
      const bob = await member(t, "U_BOB");
      await member(t, "U_CAROL");
      await t.run((ctx) => moveLastVisitTo(ctx, bob, ctx.now));
      await t.time.advance(minuteMs);

      await thanks(t, "U_CAROL", "U_BOB");

      expect(await t.query((ctx) => teaserOf(ctx, bob))).toBeNull();
    });
  }
});

async function aWorkspace(flags: FlagDefinition[]) {
  const t = backend();
  await definitionsStored(t.operations, ...flags);
  return t;
}

// Each member has an analytics ID, so the teaser's read, which can't write, decides their flags as a mutation would.
async function member(t: Backend, user: string) {
  t.slack.withMember(user, { profile: { email: `${user.slice(2).toLowerCase()}@example.com` } });
  const id = (await t.seed.insert("members", { workspace: "T1", user, kind: "member" })) as MemberId;
  await t.run((ctx) => analyticsIdOf(ctx, id));
  return id;
}

let seeded = 0;

async function thanks(t: Backend, giver: string, recipient: string, { emojis = 1, sentAt = t.clock.now() } = {}) {
  seeded += 1;
  const ts = `${Math.floor(sentAt / 1000)}.${String(seeded).padStart(6, "0")}`;
  const tacos = Array.from({ length: emojis }, () => emoji("taco"));
  await t.send("/events", messageEvent([section(mention(recipient), text(" thanks for untangling the release notes today "), ...tacos)], { user: giver, ts }));
  await t.settle();
}
