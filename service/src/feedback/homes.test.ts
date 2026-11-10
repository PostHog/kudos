// The member's App Home from outside: which home a person gets, the tab and period it opens on, and when it is published
// again. Publishing a home is S17's (slack/appHome.ts), and what a home shows reads S6's levels and unlocks, S8's
// items, S11's boards and S5's own message settings (5.8), so those journeys are declared waiting; the
// steps that reach none of them run here.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import type { XpRecordedEvent } from "../bus/events.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { serviceRegistry } from "../registry.ts";
import { publishHomeJob } from "../slack/appHome.ts";
import type { MemberFacts, MemberId } from "../workspace/directory.ts";
import { republish, republishOnRoleChange, selectLeaderboardPeriod, showHomeTab, shownHomeOf } from "./homes.ts";

// S17 registers the App Home's publishing when it ports it; until then a home published again reaches its stub here
// rather than failing as a job nobody registered.
const registry = { ...serviceRegistry, jobs: new Map([...serviceRegistry.jobs, [publishHomeJob.name, publishHomeJob]]) };
const backend = useTestBackend({ now: Date.parse("2026-10-13T10:00:00Z"), registry });
type Backend = ReturnType<typeof backend>;

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const member = (t: Backend, user: string, admin?: true) => t.seed.insert("members", { workspace: "T1", user, kind: "member", ...(admin && { admin }) }) as Promise<MemberId>;
const facts = (id: MemberId, admin = false): Extract<MemberFacts, { kind: "member" }> => ({ kind: "member", member: id, timeZone: undefined, admin });
const selections = async (t: Backend) => (await t.seed.all("homeSelections")).map(({ member, tab, period }) => ({ member, tab, period }));
const publishedTo = (t: Backend) => t.slack.callsTo("views.publish").map(({ user_id }) => user_id);

describe("the tab and period a home opens on", () => {
  test("choosing a leaderboard period keeps the member's home on the leaderboard with it, in one row per member", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");
    const bob = await member(t, "U_BOB");

    await t.run((ctx) => selectLeaderboardPeriod(ctx, alice, "week"));
    await t.run((ctx) => selectLeaderboardPeriod(ctx, alice, "month"));
    await t.run((ctx) => selectLeaderboardPeriod(ctx, bob, "all"));

    expect(await selections(t)).toEqual([
      { member: alice, tab: "leaderboard", period: "month" },
      { member: bob, tab: "leaderboard", period: "all" },
    ]);
  });

  test("choosing the period it already shows writes nothing", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");
    await t.run((ctx) => selectLeaderboardPeriod(ctx, alice, "month"));
    const [before] = await t.seed.all("homeSelections");

    await t.run((ctx) => selectLeaderboardPeriod(ctx, alice, "month"));

    expect(await t.seed.all("homeSelections")).toEqual([before]);
  });

  test("two rows for one member is an error in Convex's words, not a choice", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");
    await t.seed.insert("homeSelections", { member: alice, tab: "profile", period: "week" });
    await t.seed.insert("homeSelections", { member: alice, tab: "book", period: "week" });

    await expect(t.run((ctx) => selectLeaderboardPeriod(ctx, alice, "month"))).rejects.toThrow(new Error("unique() query returned more than one result from table homeSelections:"));
  });

  waitsOn(["S6", "S11"], "showing a tab the home shows keeps the period, and a tab it doesn't show is refused", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");
    await t.run((ctx) => selectLeaderboardPeriod(ctx, alice, "month"));

    expect(await t.run((ctx) => showHomeTab(ctx, "T1", facts(alice), "settings"))).toEqual({ tab: "settings", period: "month" });
    expect(await t.run((ctx) => showHomeTab(ctx, "T1", facts(alice), "admin"))).toBeNull();
  });
});

describe("the home a person gets", () => {
  test("is none for someone the directory doesn't hold as a member", async () => {
    const t = backend();
    await t.seed.insert("members", { workspace: "T1", user: "U_BOT", kind: "bot" });

    expect(await t.run((ctx) => shownHomeOf(ctx, { workspace: "T1", user: "U_BOT", frontDoor: false }))).toBeNull();
    expect(await t.run((ctx) => shownHomeOf(ctx, { workspace: "T1", user: "U_STRANGER", frontDoor: false }))).toBeNull();
  });

  waitsOn(["S4", "S5", "S6", "S7", "S8", "S9", "S11", "S17"], "opens on the profile, with the tabs the member's features show", async () => {
    const t = backend();
    await member(t, "U_ALICE");

    const home = await t.run((ctx) => shownHomeOf(ctx, { workspace: "T1", user: "U_ALICE", frontDoor: false }));

    expect(home?.shown.tab).toBe("profile");
  });
});

describe("publishing a home again", () => {
  test("a role that didn't change, or a person who was never a member, publishes nothing", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");

    await t.run((ctx) => republishOnRoleChange(ctx, facts(alice), facts(alice)));
    await t.run((ctx) => republishOnRoleChange(ctx, facts(alice, true), facts(alice, true)));
    await t.run((ctx) => republishOnRoleChange(ctx, undefined, facts(alice)));
    await t.run((ctx) => republishOnRoleChange(ctx, facts(alice), undefined));
    await t.run((ctx) => republishOnRoleChange(ctx, { kind: "bot" }, { kind: "not-a-member" }));

    expect((await t.settle()).ran).toEqual([]);
    expect(t.slack.calls).toEqual([]);
  });

  waitsOn(["S17"], "publishes the member's home to them", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");

    await t.run((ctx) => republish(ctx, alice));
    await t.settle();

    expect(publishedTo(t)).toEqual(["U_ALICE"]);
  });

  waitsOn(["S6", "S17"], "a member who becomes an admin gets their home again, while levels are on", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");

    await t.run((ctx) => republishOnRoleChange(ctx, facts(alice), facts(alice, true)));
    await t.settle();

    expect(publishedTo(t)).toEqual(["U_ALICE"]);
  });

  waitsOn(["S6", "S17"], "someone who becomes a member gets their home", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");

    await t.run((ctx) => republishOnRoleChange(ctx, { kind: "not-a-member" }, facts(alice)));
    await t.settle();

    expect(publishedTo(t)).toEqual(["U_ALICE"]);
  });

  waitsOn(["S6", "S17"], "recorded XP publishes the member's home again", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");

    await t.run((ctx) => {
      const recorded: XpRecordedEvent = { type: "xpRecorded", workspace: "T1", member: alice, at: ctx.now };
      return ctx.publish(recorded);
    });
    await t.settle();

    expect(publishedTo(t)).toEqual(["U_ALICE"]);
  });
});
