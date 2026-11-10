// The notices a member gets about their progress, from outside: whether one is sent and where, what it still says when
// its delivery runs, and the reply to a command for a feature that isn't open. Each notice reads S5's own message
// settings (5.8) and S6's levels and unlocks, so those journeys are declared waiting;
// the answers that reach none of them run here.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { MemberId } from "../workspace/directory.ts";
import { followersAwaitedUntil, linesStillWanted, notify, notifyFeaturesShipped, notifyLevelReached, purchaseReplyStillWanted, type Notification } from "./notify.ts";
import { isOpened, unopenedReplyOf, whenShipped } from "./unlockFilter.ts";
import { scheduled } from "../unlocks/schedule.ts";

const backend = useTestBackend({ now: Date.parse("2026-10-13T10:00:00Z") });
type Backend = ReturnType<typeof backend>;

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const member = (t: Backend, user = "U_ALICE") => t.seed.insert("members", { workspace: "T1", user, kind: "member" }) as Promise<MemberId>;
const kudos = { workspace: "T1", conversation: "C_KUDOS", message: "1700000000.000100" };
const levelReached: Notification = { kind: "level-reached", level: 3, skillPoints: null, xpToNextLevel: 40, ready: [] };

describe("a notice that waits for no follower", () => {
  test.each<Notification>([
    { kind: "features-shipped", ready: ["quests"] },
    { kind: "tiers-earned", tiers: [] },
    { kind: "coins-opened", balance: 5 },
  ])("a $kind notice is sent without waiting", async (notification) => {
    const t = backend();
    const alice = await member(t);

    expect(await t.query((ctx) => followersAwaitedUntil(ctx, { member: alice, notification }))).toBeNull();
  });

  waitsOn(["S6"], "a level-up waits for what follows it only while the level-up is recorded and not yet earned", async () => {
    const t = backend();
    const alice = await member(t);

    expect(await t.query((ctx) => followersAwaitedUntil(ctx, { member: alice, notification: levelReached }))).toBeNull();
  });
});

describe("sending a notice", () => {
  waitsOn(["S5", "S6", "S17"], "goes where the member's message settings put it, beside the kudos that caused it", async () => {
    const t = backend();
    const alice = await member(t);

    await t.run((ctx) => notify(ctx, alice, levelReached, kudos));
    await t.settle();

    expect(t.slack.calls.filter(({ method }) => method === "chat.postMessage" || method === "chat.postEphemeral")).toHaveLength(1);
  });

  waitsOn(["S6"], "a level reached is told while levels show to the member", async () => {
    const t = backend();
    const alice = await member(t);

    await t.run((ctx) => notifyLevelReached(ctx, { type: "levelReached", workspace: "T1", member: alice, level: 3, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 40, at: ctx.now }, []));
    await t.settle();

    expect(t.slack.callsTo("chat.postMessage")).toHaveLength(1);
  });

  waitsOn(["S6"], "features shipped are told while unlocks show to the member", async () => {
    const t = backend();
    const alice = await member(t);

    await t.run((ctx) => notifyFeaturesShipped(ctx, alice, [scheduled("quests")]));
    await t.settle();

    expect(t.slack.callsTo("chat.postMessage")).toHaveLength(1);
  });
});

describe("what a notice still says when it is sent", () => {
  waitsOn(["S5", "S6", "S17"], "a level-up still wanted says the level and how far the next one is", async () => {
    const t = backend();
    const alice = await member(t);

    const lines = await t.query((ctx) => linesStillWanted(ctx, { member: alice, notification: levelReached }));

    expect(lines?.slice(0, 2)).toEqual(["🎉 You reached level 3!", "Level 4 is 40 XP away."]);
  });

  waitsOn(["S6", "S7"], "a perk bought is told only while the skill tree applies", async () => {
    const t = backend();
    const alice = await member(t);

    expect(await t.query((ctx) => purchaseReplyStillWanted(ctx, { member: alice, outcome: { kind: "bought", perk: "spark" } }))).not.toBeNull();
  });
});

describe("a feature that isn't open yet", () => {
  test("a person the directory holds but not as a member is told nothing, and isn't a stranger", async () => {
    const t = backend();
    await t.seed.insert("members", { workspace: "T1", user: "U_BOT", kind: "bot" });

    expect(await t.run((ctx) => unopenedReplyOf(ctx, { workspace: "T1", user: "U_BOT", feature: "quests" }))).toEqual({ lines: null, shownToUnknownViewer: null });
  });

  waitsOn(["S6"], "a member is told when it opens, and nothing once it is open", async () => {
    const t = backend();
    await member(t);

    const reply = await t.run((ctx) => unopenedReplyOf(ctx, { workspace: "T1", user: "U_ALICE", feature: "quests" }));

    expect(reply.shownToUnknownViewer).toBeNull();
  });

  waitsOn(["S6"], "what is told about it waits until it is open, or until it ships", async () => {
    const t = backend();
    const alice = await member(t);

    expect(await t.query((ctx) => isOpened(ctx, alice, "skillTree"))).toBe(false);
    expect(await t.query((ctx) => whenShipped(ctx, alice, "skillTree", 2))).toBe(2);
  });
});
