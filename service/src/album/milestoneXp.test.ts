// The medals over the service: behind milestone-xp, each milestone tier a member turns is paid its metal's XP by
// publishing medalsUnlocked with one reward key a tier, and the member is exposed to the decision. The flag decides on
// the definitions PostHog serves, stored as the refresh stores them. Paying is progression's (S6) subscriber, which
// pays each reward key once; the album's guard is that a tier is turned once, so a second turn pays nothing.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import type { MutationContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { markEmojiSeen, tierEmojiIdOf } from "./earnedEmojis.ts";
import type { ReachedTier } from "./milestones.ts";
import { milestoneXpByMetal, payTheMedals } from "./milestoneXp.ts";

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

const firstFace: ReachedTier = { milestone: "people", tier: "bronze" };
const firstThankYou: ReachedTier = { milestone: "thoughtful", tier: "bronze" };
const hoarder: ReachedTier = { milestone: "hoggies", tier: "gold" };

describe("the medals pay XP by their metal behind milestone-xp", () => {
  test("with milestone-xp on, each tier unlocked comes back with its metal's XP, and medalsUnlocked names each with its reward key", async () => {
    await definitionsStored(t.operations, onForEveryone("milestone-xp"));

    const paid = await t.run((ctx) => payTheMedals(ctx, { workspace: "T1", member: alice }, [firstFace, hoarder], now));

    expect(paid).toEqual([
      { ...firstFace, xp: milestoneXpByMetal.bronze },
      { ...hoarder, xp: milestoneXpByMetal.gold },
    ]);
    expect(await medalsPublished()).toEqual([
      {
        type: "medalsUnlocked",
        fact: expect.any(String),
        workspace: "T1",
        member: alice,
        medals: [
          { milestone: "people", tier: "bronze", xp: 100, rewardKey: "milestone:people:bronze" },
          { milestone: "hoggies", tier: "gold", xp: 500, rewardKey: "milestone:hoggies:gold" },
        ],
        catalogueVersion: "milestone-xp-1",
        at: now,
      },
    ]);
    expect(await exposuresOf(alice), "the member is exposed to on").toEqual([true]);
  });

  test("with milestone-xp off, the tiers come back unpaid, nothing is published, and the member is exposed to off", async () => {
    await definitionsStored(t.operations, offForEveryone("milestone-xp"));

    const unlocked = await t.run((ctx) => payTheMedals(ctx, { workspace: "T1", member: alice }, [firstFace], now));

    expect(unlocked).toEqual([firstFace]);
    expect(await medalsPublished()).toEqual([]);
    expect(await exposuresOf(alice)).toEqual([false]);
  });

  test("with nothing unlocked, the flag is never asked: no exposure, nothing published", async () => {
    await definitionsStored(t.operations, onForEveryone("milestone-xp"));

    expect(await t.run((ctx) => payTheMedals(ctx, { workspace: "T1", member: alice }, [], now))).toEqual([]);

    expect(await medalsPublished()).toEqual([]);
    expect(await exposuresOf(alice)).toEqual([]);
  });

  test("a tier turned once pays once: turning the same tiers again pays nothing more", async () => {
    await definitionsStored(t.operations, onForEveryone("milestone-xp"));

    const first = await t.run((ctx) => turnAndPay(ctx, [firstFace, firstThankYou]));
    const again = await t.run((ctx) => turnAndPay(ctx, [firstFace, firstThankYou]));

    expect(first.map(({ xp }) => xp)).toEqual([100, 100]);
    expect(again, "nothing newly turned").toEqual([]);
    expect((await medalsPublished()).map(({ medals }) => medals), "one medalsUnlocked, for the first turn").toEqual([[expect.objectContaining({ rewardKey: "milestone:people:bronze" }), expect.objectContaining({ rewardKey: "milestone:thoughtful:bronze" })]]);
  });
});

// What the milestone unlocks (S8's items/milestoneUnlocks.ts) do with the tiers earned: turn each one not seen yet, then pay those.
async function turnAndPay(ctx: MutationContext, tiers: ReachedTier[]) {
  const unlocked: ReachedTier[] = [];
  for (const tier of tiers) if (await markEmojiSeen(ctx, alice, tierEmojiIdOf(tier), ctx.now)) unlocked.push(tier);
  return payTheMedals(ctx, { workspace: "T1", member: alice }, unlocked, ctx.now);
}

async function medalsPublished() {
  return (await t.published()).filter(({ type }) => type === "medalsUnlocked") as unknown as Array<Record<string, unknown> & { medals: unknown[] }>;
}

async function exposuresOf(member: MemberId) {
  return (await t.seed.all("flagExposures")).filter((row) => row.member === member && row.flag === "milestone-xp").map(({ value }) => value);
}
