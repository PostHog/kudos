// The analytics drain, ported from convex/analytics/drain.test.ts onto the service's runner, jobs and worker. Events
// are recorded through the outbox's write API here, since the subscribers that record them in production are 14.3's.
import { and, asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { FakePostHog, answersAMomentLater, answersWith, failsToConnect, neverAnswers, postHogHost, projectToken, routedFetch, stallsUntilReleased, type BatchRequest } from "../../testing/fakePostHog.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import { createPool } from "../db/pool.ts";
import { jobs } from "../db/schema/service.ts";
import { jobRegistry } from "../jobs/define.ts";
import { createWorker, type Worker } from "../jobs/worker.ts";
import type { Log, LogFields } from "../log.ts";
import { createOperations } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import { claim, cleanUp, cleanUpJob, createDrain, drainArgs, recover, recoverJob, settle, wakeDrain } from "./drain.ts";
import { record } from "./outbox.ts";
import { drainJob, sendBatch } from "./send.ts";

const database = useTestDatabase();
const quiet: Log = { info() {}, error() {} };
const clock = createClock({ real: () => Date.parse("2026-10-13T10:00:00Z") });
const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1 });
const seed = seeder(operations);
const registry = jobRegistry([createDrain(sendBatch({ timeoutMs: 50 })), recoverJob, cleanUpJob]);
const minutes = (count: number) => count * 60_000;
const days = (count: number) => count * 24 * 60 * minutes(1);
const realFetch = globalThis.fetch;

let postHog: FakePostHog;
/** The app's instant at each batch request PostHog received. */
let sentAt: number[];
let worker: Worker;
let warnings: ReturnType<typeof vi.spyOn>;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("KUDOS_ENVIRONMENT", "production");
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("POSTHOG_NATIVE_ERRORS", "");
  postHog = new FakePostHog();
  sentAt = [];
  const routed = routedFetch(postHog, realFetch);
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const sent = routed(input, init);
    sentAt.push(clock.now());
    return sent;
  });
  worker = createWorker({ operations, log: quiet, registry });
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await worker.stop(1_000);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("O13 O15: recording", () => {
  test("records the events in the outbox and makes no network call", async () => {
    await recordKudosGiven();

    expect(postHog.requests).toEqual([]);
    expect((await outbox()).map(({ event, state }) => [event, state])).toEqual([
      ["kudos given", "pending"],
      ["kudos received", "pending"],
    ]);
  });

  // Today's let one drain be scheduled at a time, by a singleton each request read; that read ran requests out of
  // retries while a drain claimed. Here each request adds a drain job, and drains share the work without sending a row twice.
  test("O16: however many facts are recorded, each event is sent once", async () => {
    for (let message = 0; message < 3; message += 1) await recordKudosGiven();
    expect(await pendingDrains(), "a wake per request").toBe(3);

    await settleInTimeOrder();

    expect(postHog.events()).toHaveLength(6);
    expect(new Set(postHog.events().map(({ uuid }) => uuid)).size).toBe(6);
    expect(await outbox()).toEqual([]);
  });
});

describe("O16: the drain", () => {
  test("the app registers the drain that sends, with the args a scheduled drain carries, and its recovery and clean-up", () => {
    expect(serviceRegistry.jobs.get("analytics.drain.drain"), "the sending drain").toBe(drainJob);
    expect(drainJob.args).toBe(drainArgs);
    expect(drainArgs.safeParse({ generation: "a-loaded-drain" }).success, "a drain loaded from Convex").toBe(true);
    expect(serviceRegistry.jobs.get("analytics.drain.recover")).toBe(recoverJob);
    expect(serviceRegistry.jobs.get("analytics.drain.cleanUp")).toBe(cleanUpJob);
  });

  test("sends at most 100 events per request, and delivered events leave the outbox", async () => {
    await recordKudosGiven(75);
    await settle_();

    // Today's one drain sent 100 then 50; drains running at once may split the rest between them.
    expect(postHog.requests.every((request) => request.events.length <= 100), "at most 100 to a request").toBe(true);
    expect(new Set(postHog.events().map(({ uuid }) => uuid)).size, "each event once").toBe(150);
    expect(postHog.events()).toHaveLength(150);
    expect(await outbox()).toEqual([]);
  });

  test("a batch PostHog answers a moment later is sent once", async () => {
    postHog.answering(answersAMomentLater);

    await recordKudosGiven();
    await settle_();

    expect(postHog.requests).toHaveLength(1);
    expect(await outbox()).toEqual([]);
  });

  test("a fact recorded after the drain finished starts a new drain", async () => {
    await recordKudosGiven();
    await settle_();

    await recordKudosGiven();
    await settle_();

    expect(postHog.requests.map((request) => request.events.length)).toEqual([2, 2]);
  });

  test("sends PostHog's batch body: the project token, each row's identity and properties, flag properties under PostHog's names", async () => {
    const [alice] = await members(1);
    await operations.mutation("test.record", (ctx) =>
      record(ctx, "T1", [{ event: "$feature_flag_called", subject: { member: alice! }, at: Date.parse("2026-10-13T09:00:00Z"), properties: { feature_flag: "f", feature_flag_response: true } }]),
    );

    await settle_();

    expect(postHog.requests.map(({ url, apiKey }) => ({ url, apiKey }))).toEqual([{ url: `${postHogHost}/batch/`, apiKey: projectToken }]);
    const [event] = postHog.events();
    expect(event).toMatchObject({ event: "$feature_flag_called", timestamp: "2026-10-13T09:00:00.000Z", properties: { $feature_flag: "f", $feature_flag_response: true, environment: "production" } });
    expect(event!.properties).not.toHaveProperty("feature_flag");
  });
});

describe("O18: a batch PostHog doesn't accept is retried", () => {
  test.each([
    ["429", answersWith(429)],
    ["503", answersWith(503)],
    ["401", answersWith(401)],
    ["a network error", failsToConnect],
    ["no answer in time", neverAnswers],
  ])("on %s, every event is retried after successive delays of 1, 5, 30, 120 and 360 minutes and given up on its sixth failure", async (_, failure) => {
    postHog.answering(...Array(7).fill(failure));

    await recordKudosGiven();
    await settleInTimeOrder();

    const delays = sentAt.slice(1).map((retry, index) => (retry - sentAt[index]!) / minutes(1));
    expect(delays).toEqual([1, 5, 30, 120, 360]);
    expect((await outbox()).map(({ state, reason }) => ({ state, reason }))).toEqual([
      { state: "exhausted", reason: "exhausted" },
      { state: "exhausted", reason: "exhausted" },
    ]);
    expect(warnings.mock.calls).toEqual([["analytics.events_given_up", { reason: "exhausted", events: ["kudos given", "kudos received"] }]]);
  });

  test("failures that PostHog answers at once fall 1, 6, 36, 156 and 516 minutes after the first", async () => {
    postHog.answering(...Array(6).fill(answersWith(503)));

    await recordKudosGiven();
    await settleInTimeOrder();

    const [first, ...retries] = sentAt;
    expect(retries.map((retry) => (retry - first!) / minutes(1))).toEqual([1, 6, 36, 156, 516]);
  });

  test("O14: every retry sends the same UUID, name, distinct_id and timestamp as the first attempt", async () => {
    postHog.answering(answersWith(429), answersWith(503), answersWith(401), failsToConnect, neverAnswers, answersWith(200));
    await recordKudosGiven();
    const recorded = await outbox();

    await settleInTimeOrder();

    const identities = postHog.requests.map((request) => request.events.map(identity));
    expect(identities).toHaveLength(6);
    for (const attempt of identities) {
      expect(attempt).toEqual(recorded.map((row) => ({ uuid: row.uuid, event: row.event, distinct_id: row.distinctId, timestamp: new Date(row.timestamp).toISOString() })));
    }
    expect(await outbox()).toEqual([]);
  });

  test.each([400, 413])("a batch PostHog answers with %i is given up at once as rejected", async (status) => {
    postHog.answering(answersWith(status));

    await recordKudosGiven();
    await settle_();

    expect(postHog.requests).toHaveLength(1);
    expect((await outbox()).map(({ state, reason }) => ({ state, reason }))).toEqual([
      { state: "exhausted", reason: "rejected" },
      { state: "exhausted", reason: "rejected" },
    ]);
    expect(warnings.mock.calls).toEqual([["analytics.events_given_up", { reason: "rejected", events: ["kudos given", "kudos received"] }]]);
  });

  // Convex read a batch's rows back by ID, in the order it claimed them. Here the rows are stored, and their IDs sort,
  // against that order, so a read back without an order of its own lists them the other way round.
  test("events given up together are named in the order they were recorded", async () => {
    postHog.answering(answersWith(503));
    const at = clock.now();
    const pending = { distinctId: "a-member", timestamp: at, properties: {}, state: "pending" as const, failures: 5, dueAt: at };
    await seed.insert("analyticsOutbox", { _id: "a-received", _creationTime: at + 1, uuid: "u-received", event: "kudos received", ...pending });
    await seed.insert("analyticsOutbox", { _id: "b-given", _creationTime: at, uuid: "u-given", event: "kudos given", ...pending });
    await operations.mutation("test.wake", (ctx) => wakeDrain(ctx));

    await settle_();

    expect(postHog.requests.map((request) => request.events.map(({ event }) => event))).toEqual([["kudos given", "kudos received"]]);
    expect(warnings.mock.calls).toEqual([["analytics.events_given_up", { reason: "exhausted", events: ["kudos given", "kudos received"] }]]);
  });
});

describe("O19: given-up events are kept for 7 days", () => {
  test("the daily cleanup deletes an event 7 days after it was given up, not earlier", async () => {
    postHog.answering(answersWith(400));
    await recordKudosGiven();
    await settle_();
    const givenUpAt = sentAt[0]!;

    moveTo(givenUpAt + days(7) - minutes(1));
    await cleanUpNow();
    expect(await outbox()).toHaveLength(2);

    moveTo(givenUpAt + days(7));
    await cleanUpNow();
    expect(await outbox()).toEqual([]);
  });
});

describe("O16 O17: leases", () => {
  test("a drain that dies mid-batch has its batch released at its lease's expiry and sent within 3 minutes", async () => {
    await recordKudosGiven();
    const recordedAt = clock.now();

    await drainDiesHoldingItsBatch();
    await settleInTimeOrder();

    expect(postHog.requests).toHaveLength(1);
    expect(sentAt[0]! - recordedAt).toBeLessThanOrEqual(minutes(3));
    expect(await outbox()).toEqual([]);
  });

  test("a drain whose lease expired changes nothing, before the recovery check and after another drain claimed its rows", async () => {
    await recordKudosGiven();
    const late = await claimAsTheDrain();
    const settleLate = (answer: "delivered" | "rejected" | "failed") =>
      operations.mutation("test.settle", (ctx) => settle(ctx, { token: late!.token, rows: late!.rows.map((row) => row._id), people: [], answer }));

    moveTo(clock.now() + minutes(2));
    const heldByLate = await outbox();
    await settleLate("delivered");
    expect(await outbox()).toEqual(heldByLate);

    await recoverNow();
    const current = await claimAsTheDrain();
    const heldByCurrent = await outbox();
    await settleLate("delivered");
    await settleLate("rejected");
    await settleLate("failed");

    expect(current!.token).not.toBe(late!.token);
    expect(await outbox()).toEqual(heldByCurrent);
  });

  test("a drain stalled past its lease is replaced at the lease's expiry, and changes nothing when it resumes", async () => {
    const stall = stallsUntilReleased();
    postHog.answering(stall.answer);
    await recordKudosGiven();
    const recordedAt = clock.now();

    await settleInTimeOrder({ until: recordedAt + minutes(3), budgetMs: 300 });
    expect(postHog.requests).toHaveLength(2);
    expect(sentAt[1]! - recordedAt).toBeLessThanOrEqual(minutes(3));

    stall.release();
    await settleInTimeOrder();
    await recordKudosGiven();
    await settleInTimeOrder();

    expect(postHog.requests.map((request) => request.events.length)).toEqual([2, 2, 2]);
    expect(await outbox()).toEqual([]);
  });

  test("an event recorded while a dead drain holds its batch is still sent, and so is the batch", async () => {
    await recordKudosGiven();
    await drainDiesHoldingItsBatch();

    moveTo(clock.now() + minutes(1));
    await recordKudosGiven();
    await settleInTimeOrder();

    expect(postHog.requests.map((request) => request.events.length)).toEqual([2, 2]);
    expect(await outbox()).toEqual([]);
  });

  test("the backstop starts a drain when the drain is gone and events are due", async () => {
    await recordKudosGiven();
    await drainDies();

    await recoverNow();
    await settle_();

    expect(postHog.events()).toHaveLength(2);
    expect(await outbox()).toEqual([]);
  });

  test("the recovery check starts no second drain while one is due, and none when nothing is pending", async () => {
    await recoverNow();
    expect(await pendingDrains(), "nothing pending").toBe(0);

    await recordKudosGiven();
    await recoverNow();
    await recoverNow();
    expect(await pendingDrains(), "the request's wake only").toBe(1);
  });
});

describe("O26: capture switched off pauses the outbox", () => {
  test("the drain makes no request and counts no failure, and switching capture back on sends the events", async () => {
    await recordKudosGiven();
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");

    await settle_();
    expect(postHog.requests).toEqual([]);
    expect((await outbox()).map(({ state, failures }) => ({ state, failures }))).toEqual([
      { state: "pending", failures: 0 },
      { state: "pending", failures: 0 },
    ]);

    vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
    await recoverNow();
    await settle_();
    expect(postHog.events()).toHaveLength(2);
    expect(await outbox()).toEqual([]);
  });

  test.each([503, 400])("capture switched off while PostHog answers %i neither counts a failure nor gives the batch up", async (status) => {
    postHog.answering(() => {
      vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
      return new Response(null, { status });
    });
    await recordKudosGiven();

    await settleInTimeOrder();

    expect((await outbox()).map(({ state, failures }) => ({ state, failures }))).toEqual([
      { state: "pending", failures: 0 },
      { state: "pending", failures: 0 },
    ]);
    expect(warnings).not.toHaveBeenCalled();
  });

  test("an event still pending 7 days after it was recorded is given up as expired", async () => {
    await recordKudosGiven();
    const recordedAt = clock.now();
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
    await settle_();

    moveTo(recordedAt + days(7) - minutes(1));
    await cleanUpNow();
    expect((await outbox()).map((row) => row.state)).toEqual(["pending", "pending"]);

    moveTo(recordedAt + days(7) + minutes(1));
    await cleanUpNow();
    expect((await outbox()).map(({ state, reason }) => ({ state, reason }))).toEqual([
      { state: "exhausted", reason: "expired" },
      { state: "exhausted", reason: "expired" },
    ]);
    expect(warnings.mock.calls).toEqual([["analytics.events_given_up", { reason: "expired", events: ["kudos given", "kudos received"] }]]);
  });
});

describe("O20: the analytics module's own failures", () => {
  // Two identities under one analytics ID break the invariant a person event's check reads, so the claim fails.
  const aBrokenPersonEvent = async (state: "pending" | "sending") => {
    const [alice, bob] = await members(2);
    await seed.insert("analyticsIds", { member: alice!, analyticsId: "shared-id" });
    await seed.insert("analyticsIds", { member: bob!, analyticsId: "shared-id" });
    const person = { set: { environment: "production" }, unset: [], fingerprint: "f" };
    await seed.insert("analyticsOutbox", { uuid: "u-1", event: "$identify", distinctId: "shared-id", timestamp: clock.now(), properties: {}, person, state, failures: 0, dueAt: clock.now() });
  };

  test("a failing drain is logged with a fixed code and recorded as nothing", async () => {
    await aBrokenPersonEvent("pending");
    await recordKudosGiven();

    await settle_();

    expect(errors.mock.calls).toContainEqual(["analytics.drain_failed", { error: "Error" }]);
    expect(postHog.requests).toEqual([]);
    expect((await outbox()).map(({ event, state }) => [event, state])).toEqual([
      ["$identify", "pending"],
      ["kudos given", "pending"],
      ["kudos received", "pending"],
    ]);
  });

  test("a failing recovery check is logged with a fixed code", async () => {
    await aBrokenPersonEvent("sending");

    await expect(recoverNow()).rejects.toThrow();

    expect(errors.mock.calls).toEqual([["analytics.recovery_failed", { error: "Error" }]]);
  });
});

describe("the drain and the requests that wake it", () => {
  // #96's oracle found requests answering 500: today's wake read the drain's singleton in the request's transaction,
  // so drains claiming the outbox ran requests out of retries. Here requests record while the real drains claim,
  // send and settle, all under SERIALIZABLE on a pool of their own.
  test("requests recording while drains claim and settle: none fails or is retried, and every event is sent once", async () => {
    const requests = 60;
    const recorders = await members(requests);
    for (const [i, member] of recorders.entries()) await seed.insert("analyticsIds", { member, analyticsId: `analytics-id-${i}` });
    await seed.insert("workspaceKeys", { workspace: "T1", workspaceKey: "workspace-key-1" });
    postHog.answering(...Array(requests).fill(answersAMomentLater));
    const { log, lines } = captureLog();
    const pool = createPool(database.url, { max: 12 });
    onTestFinished(() => pool.end());
    const runner = createOperations({ pool, clock, log, retryDelayMs: () => 1 });
    const drains = createWorker({ operations: runner, log: quiet, registry, concurrency: 4 });
    onTestFinished(() => drains.stop(1_000));
    const attempts = recorders.map(() => 0);
    let recorded = false;
    const request = (member: Id<"members">, i: number) =>
      runner.mutation("test.request", (ctx) => {
        attempts[i]! += 1;
        return record(ctx, "T1", [{ event: "kudos received", subject: { member }, at: clock.now(), properties: { request: i } }]);
      });

    // The drains claim, send and settle for as long as requests record, and stop only once the last one committed.
    const draining = (async () => {
      while (!recorded) await drains.settle(50);
    })();
    // Six waves of ten requests; each wave starts once the drains sent a batch since the last began, so the drains
    // claim and settle between and during the waves however loaded the machine is.
    const waves = 6;
    const perWave = requests / waves;
    const outcomes: Array<PromiseSettledResult<void>> = [];
    let sentWhileRecording = 0;
    for (let wave = 0; wave < waves; wave += 1) {
      const sentBefore = postHog.requests.length;
      const recording = Promise.allSettled(
        recorders.slice(wave * perWave, (wave + 1) * perWave).map(async (member, j) => {
          await new Promise((resolve) => setTimeout(resolve, j * 2));
          return request(member, wave * perWave + j);
        }),
      );
      outcomes.push(...(await recording));
      if (wave < waves - 1) await vi.waitFor(() => expect(postHog.requests.length).toBeGreaterThan(sentBefore), { timeout: 30_000, interval: 10 });
      sentWhileRecording = postHog.requests.length;
    }
    recorded = true;
    await draining;
    await settleInTimeOrder();

    expect(outcomes.filter(({ status }) => status === "rejected"), "no request failed").toEqual([]);
    expect({ retried: attempts.filter((count) => count > 1).length, logged: lines.filter(({ message }) => message.includes("test.request")) }, "none was retried").toEqual({ retried: 0, logged: [] });
    expect(sentWhileRecording, "the drains sent a batch after each wave but the last").toBeGreaterThanOrEqual(waves - 1);
    const sent = postHog.events().map(({ properties }) => properties.request);
    expect(sent.toSorted((a, b) => Number(a) - Number(b)), "each request's event, once").toEqual(recorders.map((_, i) => i));
    expect(await outbox()).toEqual([]);
  });
});

async function members(count: number): Promise<Array<Id<"members">>> {
  const ids = [];
  for (let i = 0; i < count; i += 1) ids.push(await seed.insert("members", { workspace: "T1", user: `U_${i}`, kind: "member" }));
  return ids;
}

/** Records a kudos given and received, `times` times, as the kudos-given subscriber records one. */
async function recordKudosGiven(times = 1): Promise<void> {
  const [giver, recipient] = await members(2);
  const at = clock.now();
  await operations.mutation("test.recordKudosGiven", async (ctx) => {
    for (let i = 0; i < times; i += 1) {
      await record(ctx, "T1", [
        { event: "kudos given", subject: { member: giver! }, at, properties: { recipients: 1 } },
        { event: "kudos received", subject: { member: recipient! }, at, properties: {} },
      ]);
    }
  });
}

async function settle_(): Promise<void> {
  const { done } = await worker.settle(10_000);
  expect(done, "settled").toBe(true);
}

/** Runs due jobs, then moves the clock to the next pending job and runs again, until none is pending or past `until`. */
async function settleInTimeOrder({ until = Infinity, budgetMs = 10_000 }: { until?: number; budgetMs?: number } = {}): Promise<void> {
  for (let round = 0; round < 100; round += 1) {
    await worker.settle(budgetMs);
    const [next] = await operations.query("test.nextJob", ({ tx }) =>
      tx.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt)).limit(1),
    );
    if (next === undefined || next.runAt > until) return;
    if (next.runAt > clock.now()) clock.advance(next.runAt - clock.now());
  }
  throw new Error("Jobs were still pending after 100 rounds");
}

function moveTo(at: number): void {
  clock.advance(at - clock.now());
}

const recoverNow = () => operations.mutation("test.recover", (ctx) => recover(ctx, {}));
const cleanUpNow = () => operations.mutation("test.cleanUp", (ctx) => cleanUp(ctx, {}));
const claimAsTheDrain = () => operations.mutation("test.claim", claim);

/** Every pending drain job is canceled, as if the drain that would run them were gone. */
async function drainDies(): Promise<void> {
  await operations.mutation("test.drainDies", ({ tx }) =>
    tx.update(jobs).set({ state: "canceled" }).where(and(eq(jobs.state, "pending"), eq(jobs.name, "analytics.drain.drain"))),
  );
}

async function drainDiesHoldingItsBatch(): Promise<void> {
  await claimAsTheDrain();
  await drainDies();
}

async function pendingDrains(): Promise<number> {
  const rows = await operations.query("test.pendingDrains", ({ tx }) =>
    tx.select({ _id: jobs._id }).from(jobs).where(and(eq(jobs.state, "pending"), eq(jobs.name, "analytics.drain.drain"))),
  );
  return rows.length;
}

function identity({ uuid, event, distinct_id, timestamp }: BatchRequest["events"][number]) {
  return { uuid, event, distinct_id, timestamp };
}

const outbox = () => seed.all("analyticsOutbox");

function captureLog(): { log: Log; lines: Array<{ message: string } & LogFields> } {
  const lines: Array<{ message: string } & LogFields> = [];
  const push = (message: string, fields: LogFields = {}) => lines.push({ message, ...fields });
  return { log: { info: push, error: push }, lines };
}

