// Member verification: a sign-in asks Slack whether the person is a member, three tries at most with a doubling backoff
// that honours Slack's Retry-After, and a sweep every ten minutes tries again the verifications a crash stranded.
// Today's convex/slack/verifyMember.ts has no Convex test of its own (its cases sit in the website's sign-in tests,
// which S17 ports); these drive it as the service does: a sign-in's mutation, the worker, and the cron.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { rateLimitedFor } from "../../testing/fakeSlack.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { retryStranded, verificationOf, verifyLater } from "./verifyMember.ts";

const now = new Date("2026-10-13T10:00:00Z").getTime();
const backend = useTestBackend({ now });
const minute = 60_000;
const sweep = "slack.verifyMember.retryStranded";

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a sign-in verifies the person with Slack", () => {
  test("a person Slack doesn't know is asked about three times, a second and then two seconds apart, and the verification fails", async () => {
    const t = backend();

    await signIn(t, "U_DAVE");
    await t.settle();
    expect(await verification(t, "U_DAVE")).toEqual({ state: "pending", attempts: 1, nextTryAt: now + 1_000 });

    await t.time.advance(1_000);
    await t.settle();
    expect(await verification(t, "U_DAVE")).toEqual({ state: "pending", attempts: 2, nextTryAt: now + 3_000 });

    await t.time.advance(1_999);
    await t.settle();
    expect(t.slack.callsTo("users.info")).toHaveLength(2);

    await t.time.advance(1);
    await t.settle();
    expect(await verification(t, "U_DAVE")).toEqual({ state: "failed", attempts: 3, nextTryAt: now + 3_000 });
    expect(t.slack.callsTo("users.info")).toEqual([{ user: "U_DAVE" }, { user: "U_DAVE" }, { user: "U_DAVE" }]);
  });

  test("a rate-limited answer waits for Slack's Retry-After when it's longer than the backoff", async () => {
    const t = backend();
    t.slack.answering("users.info", rateLimitedFor(30));

    await signIn(t, "U_DAVE");
    await t.settle();
    expect(await verification(t, "U_DAVE")).toEqual({ state: "pending", attempts: 1, nextTryAt: now + 30_000 });

    await t.time.advance(29_999);
    await t.settle();
    expect(t.slack.callsTo("users.info")).toHaveLength(1);

    await t.time.advance(1);
    await t.settle();
    expect(t.slack.callsTo("users.info")).toHaveLength(2);
  });

  test("a second sign-in while a verification is pending doesn't ask Slack again", async () => {
    const t = backend();

    await signIn(t, "U_DAVE");
    await signIn(t, "U_DAVE");
    await t.settle();

    expect(t.slack.callsTo("users.info")).toHaveLength(1);
    expect(await t.seed.all("memberVerifications")).toHaveLength(1);
  });

  test("a sign-in after a failed verification starts over from the first try", async () => {
    const t = backend();
    await t.seed.insert("memberVerifications", { workspace: "T1", user: "U_DAVE", attempts: 3, state: "failed", nextTryAt: now - 60 * minute });

    await signIn(t, "U_DAVE");
    expect(await verification(t, "U_DAVE")).toEqual({ state: "pending", attempts: 0, nextTryAt: now });
    await t.settle();

    expect(await verification(t, "U_DAVE")).toEqual({ state: "pending", attempts: 1, nextTryAt: now + 1_000 });
    expect(await t.seed.all("memberVerifications")).toHaveLength(1);
  });

  test("a first sign-in is remembered once, and a first sign-in again after a failed verification doesn't remember it twice", async () => {
    const t = backend();

    await signIn(t, "U_DAVE", { firstSignIn: true });
    expect(await firstSignIns(t)).toEqual(["U_DAVE"]);

    await t.settle();
    await t.time.advance(1_000);
    await t.settle();
    await t.time.advance(2_000);
    await t.settle();
    expect(await verification(t, "U_DAVE")).toMatchObject({ state: "failed" });

    await signIn(t, "U_DAVE", { firstSignIn: true });
    expect(await firstSignIns(t)).toEqual(["U_DAVE"]);
    expect(await verification(t, "U_DAVE")).toEqual({ state: "pending", attempts: 0, nextTryAt: now + 3_000 });
  });

  test("a sign-in that isn't the first remembers no first sign-in", async () => {
    const t = backend();

    await signIn(t, "U_DAVE");

    expect(await firstSignIns(t)).toEqual([]);
  });

  waitsOn(["S11", "S15"], "a member Slack knows is verified: the directory keeps them and their verification is gone", async () => {
    const t = backend();
    t.slack.withMember("U_ANN", { name: "ann" });

    await signIn(t, "U_ANN");
    await t.settle();

    expect(await t.seed.all("memberVerifications")).toEqual([]);
  });
});

describe("the sweep tries again the verifications a crash stranded", () => {
  test("a verification stranded past the action time limit is asked about again, counting the stranded try", async () => {
    const t = backend();
    await stranded(t, "U_DAVE", { attempts: 0, nextTryAt: now - 11 * minute });

    await t.time.runCron(sweep);

    expect(t.slack.callsTo("users.info")).toEqual([{ user: "U_DAVE" }]);
    expect(await verification(t, "U_DAVE")).toEqual({ state: "pending", attempts: 2, nextTryAt: now + 2_000 });
  });

  test("a stranded verification on its last try fails without asking Slack", async () => {
    const t = backend();
    await stranded(t, "U_DAVE", { attempts: 2, nextTryAt: now - 11 * minute });

    await t.time.runCron(sweep);

    expect(t.slack.callsTo("users.info")).toEqual([]);
    expect(await verification(t, "U_DAVE")).toEqual({ state: "failed", attempts: 3, nextTryAt: now - 11 * minute });
  });

  test("a verification still inside the action time limit, one with no next try and a failed one are left alone", async () => {
    const t = backend();
    await stranded(t, "U_RECENT", { attempts: 1, nextTryAt: now - 9 * minute });
    await stranded(t, "U_NEVER", { attempts: 1, nextTryAt: undefined });
    await t.seed.insert("memberVerifications", { workspace: "T1", user: "U_FAILED", attempts: 3, state: "failed", nextTryAt: now - 60 * minute });

    await t.time.runCron(sweep);

    expect(t.slack.callsTo("users.info")).toEqual([]);
    expect(await verification(t, "U_RECENT")).toEqual({ state: "pending", attempts: 1, nextTryAt: now - 9 * minute });
    expect(await verification(t, "U_NEVER")).toEqual({ state: "pending", attempts: 1, nextTryAt: undefined });
    expect(await verification(t, "U_FAILED")).toEqual({ state: "failed", attempts: 3, nextTryAt: now - 60 * minute });
  });

  test("a sweep takes the ten that have waited longest, and a full one sweeps again for the rest", async () => {
    const t = backend();
    // Inserted newest first, so only the index's order, not the insertion order, puts the oldest first.
    const users = Array.from({ length: 11 }, (_, index) => `U_${String(index).padStart(2, "0")}`);
    for (const [index, user] of [...users.entries()].reverse()) await stranded(t, user, { attempts: 2, nextTryAt: now - 11 * minute - (11 - index) * 1_000 });

    await t.run((ctx) => retryStranded(ctx, {}));

    expect(await statesOf(t, users)).toEqual([...users.slice(0, 10).map(() => "failed"), "pending"]);

    await t.settle();

    expect(await statesOf(t, users)).toEqual(users.map(() => "failed"));
  });

  waitsOn(["S15"], "a stranded verification of someone the directory already knows as a member is verified without asking Slack", async () => {
    const t = backend();
    await t.seed.insert("members", { workspace: "T1", user: "U_ANN", kind: "member", name: "ann", asOf: now - minute });
    await stranded(t, "U_ANN", { attempts: 1, nextTryAt: now - 11 * minute });

    await t.time.runCron(sweep);

    expect(t.slack.callsTo("users.info")).toEqual([]);
    expect(await t.seed.all("memberVerifications")).toEqual([]);
  });

  waitsOn(["S8", "S15"], "a member verified on their first sign-in is greeted once, and their first sign-in is forgotten", async () => {
    const t = backend();
    t.slack.withMember("U_ANN", { name: "ann" });
    await t.seed.insert("members", { workspace: "T1", user: "U_ANN", kind: "member", name: "ann", asOf: now - minute });

    await signIn(t, "U_ANN", { firstSignIn: true });
    await t.settle();

    expect((await t.published()).filter(({ type }) => type === "memberGreeted")).toHaveLength(1);
    expect(await t.seed.all("firstSignIns")).toEqual([]);
  });
});

function signIn(t: TestBackend, user: string, { firstSignIn = false } = {}) {
  return t.run((ctx) => verifyLater(ctx, "T1", user, { firstSignIn }));
}

async function firstSignIns(t: TestBackend) {
  return (await t.seed.all("firstSignIns")).map(({ user }) => user);
}

async function statesOf(t: TestBackend, users: string[]) {
  return Promise.all(users.map(async (user) => (await verification(t, user))?.state));
}

function stranded(t: TestBackend, user: string, { attempts, nextTryAt }: { attempts: number; nextTryAt: number | undefined }) {
  return t.seed.insert("memberVerifications", { workspace: "T1", user, attempts, state: "pending", ...(nextTryAt !== undefined && { nextTryAt }) });
}

async function verification(t: TestBackend, user: string) {
  const row = await t.query((ctx) => verificationOf(ctx, "T1", user));
  return row && { state: row.state, attempts: row.attempts, nextTryAt: row.nextTryAt };
}
