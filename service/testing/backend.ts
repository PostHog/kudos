// The service's in-process test backend, what today's `testing/slackBackend.ts` gives Convex's tests: the operation
// runner wired to the registry's bus subscribers, a worker that runs due jobs and crons on the app's clock through
// AppTime, the seeder, the Slack and PostHog fakes behind `fetch`, signed Slack requests through the front door, and
// the domain events that committed operations published. One per test, on the worker's schema:
//
//   const backend = useTestBackend();
//   test("...", async () => {
//     const t = backend();
//     await t.event({ type: "message", ... });
//     await t.settle();
//     expect(t.slack.messagesIn("C_GENERAL")).toEqual(...);
//   });
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterEach, vi } from "vitest";
import { z } from "zod";
import { createAppTime, type AppTime, type TimeAnswer } from "../src/appTime.ts";
import type { Subscribers, Subscription } from "../src/bus/publish.ts";
import { createClock, type Clock } from "../src/clock.ts";
import { decodeStored } from "../src/db/codec.ts";
import { jobs } from "../src/db/schema/service.ts";
import { createApp } from "../src/http/app.ts";
import { mutationJob } from "../src/jobs/define.ts";
import { createWorker, type Worker } from "../src/jobs/worker.ts";
import type { Log, LogFields } from "../src/log.ts";
import { notPorted } from "../src/notPorted.ts";
import { createOperations, type MutationContext, type Operations, type QueryContext } from "../src/operations.ts";
import type { Registry } from "../src/registration.ts";
import { serviceRegistry } from "../src/registry.ts";
import { createFrontDoor } from "../src/slack/frontDoor.ts";
import { useTestDatabase } from "./database.ts";
import { FakePostHog, routedFetch } from "./fakePostHog.ts";
import { FakeSlack } from "./fakeSlack.ts";
import { seeder, type Seeder } from "./seed.ts";
import { signingSecret, slackClient, type SlackClient } from "./signedSlack.ts";

export interface BackendOptions {
  /** The app's clock at the start, in epoch milliseconds. */
  now?: number;
  /** The Slack workspace signed requests come from. */
  workspace?: string;
  /** What the domains registered; the service's own registry unless a test brings its own. */
  registry?: Registry;
}

/** A domain event as a committed operation published it, with the fact its subscribers' jobs share. */
export type PublishedEvent = { type: string; fact: string } & Record<string, unknown>;

export type LogLine = { level: "info" | "error"; message: string; fields: LogFields };

export interface TestBackend extends SlackClient {
  clock: Clock;
  operations: Operations;
  worker: Worker;
  /** The time seam: `advance`, `runCron` and `settle`, as the E2E suite drives it; `runCron` and `settle` throw as `settle()` does. */
  time: AppTime;
  seed: Seeder;
  slack: FakeSlack;
  postHog: FakePostHog;
  /** The app's HTTP routes, with the front door at `/slack` and the domains' website routes, as the service boots them. */
  app: ReturnType<typeof createApp>;
  /** Every line the service logged. */
  logs: LogLine[];
  /** Runs the handler as one mutation, as Convex's `t.run` does. */
  run<T>(handler: (ctx: MutationContext) => Promise<T>): Promise<T>;
  query<T>(handler: (ctx: QueryContext) => Promise<T>): Promise<T>;
  /**
   * Runs every job due by the app's clock, and those they make due, until none is due or running. A job that failed on
   * a body not ported yet throws its `NotPortedError` from here, as if the test had called the stub itself, so `waitsOn`
   * sees it; a job that failed any other way stays `failed` for the test's own assertions.
   */
  settle(): Promise<TimeAnswer>;
  /**
   * The events committed operations published, in the order they published them. Two operations that overlap are in
   * the order of their publishing, which is not always the order they committed.
   */
  published(): Promise<PublishedEvent[]>;
}

// The recorder: one more subscriber of every event type, whose job row holds the published event. A job row is
// written in the publishing transaction, so the events it records are exactly the committed ones.
const recorderName = "testing.published";
const recorder = mutationJob(recorderName, z.object({ event: z.looseObject({ type: z.string(), fact: z.string() }) }), async () => {});
const recording: Subscription = { event: "*", job: recorder };

class RecordingSubscribers extends Map<string, readonly Subscription[]> {
  override get(type: string): readonly Subscription[] {
    return [...(super.get(type) ?? []), recording];
  }
}

// How long a test's end waits for its worker's running jobs; a test's jobs finish well inside it.
const stopGraceMs = 10_000;

const withoutRecorder =(answer: TimeAnswer): TimeAnswer => ({ ...answer, ran: answer.ran.filter((name) => name !== recorderName) });

// How the worker records a failed job's error: `<class>: <message>`, and a stub's message is `<path> is not ported yet`.
const stubFailure = /^NotPortedError: (.+) is not ported yet$/;

/** Call at the top of a test file; each call of what it answers starts a backend for one test. */
export function useTestBackend(defaults: BackendOptions = {}): (options?: BackendOptions) => TestBackend {
  const database = useTestDatabase();
  const db = drizzle({ client: database.pool });
  // A job still running when its test ends finishes within that test, before the next one empties the database and
  // before `fetch` is the real one again; otherwise it writes into the next test.
  const started: Worker[] = [];
  afterEach(async () => {
    await Promise.all(started.splice(0).map((worker) => worker.stop(stopGraceMs)));
    vi.unstubAllGlobals();
  });

  return (options = {}) => {
    const { now = 1_800_000_000_000, workspace = "T1", registry = serviceRegistry } = { ...defaults, ...options };
    const logs: LogLine[] = [];
    const log: Log = {
      info: (message, fields = {}) => void logs.push({ level: "info", message, fields }),
      error: (message, fields = {}) => void logs.push({ level: "error", message, fields }),
    };
    const clock = createClock({ real: () => now });
    const subscribers: Subscribers = new RecordingSubscribers(registry.subscribers);
    const operations = createOperations({ pool: database.pool, clock, log, retryDelayMs: () => 1, subscribers });
    const worker = createWorker({ operations, log, registry: new Map([...registry.jobs, [recorderName, recorder]]), pollMs: 3_600_000 });
    started.push(worker);
    const appTime = createAppTime({ clock, worker });
    // A job reaches a stub inside the worker, which records the failure and moves on; surface the first one not yet surfaced.
    const surfaced = new Set<string>();
    const throwStubFailures = async () => {
      const failed = await db.select({ _id: jobs._id, name: jobs.name, error: jobs.error }).from(jobs).where(eq(jobs.state, "failed")).orderBy(asc(jobs.completedAt), asc(jobs._creationTime), asc(jobs._id));
      for (const { _id, name, error } of failed) {
        const path = stubFailure.exec(error ?? "")?.[1];
        if (path === undefined || surfaced.has(_id)) continue;
        surfaced.add(_id);
        const stub = notPorted(path);
        stub.message = `${stub.message}, reached by the job ${name}`;
        throw stub;
      }
    };
    const time: AppTime = {
      advance: (ms) => appTime.advance(ms),
      runCron: async (id) => {
        const answer = await appTime.runCron(id);
        await throwStubFailures();
        return answer && withoutRecorder(answer);
      },
      settle: async () => {
        const answer = await appTime.settle();
        await throwStubFailures();
        return withoutRecorder(answer);
      },
    };
    const frontDoor = createFrontDoor({ signingSecret, clock, off: false, log, operations, handlers: registry.slack });
    const routes = registry.routes.map((domainRoutes) => domainRoutes({ operations, clock, log }));
    const app = createApp({ commit: "test", readiness: { migrations: () => "done" }, off: false, log, clock, worker, slack: frontDoor, routes });

    const slack = new FakeSlack();
    const postHog = new FakePostHog();
    vi.stubGlobal("fetch", routedFetch(postHog, slack.fetch));

    return {
      ...slackClient(app, { clock, workspace }),
      clock,
      operations,
      worker,
      time,
      seed: seeder(operations),
      slack,
      postHog,
      app,
      logs,
      run: (handler) => operations.mutation("test.run", handler),
      query: (handler) => operations.query("test.query", handler),
      settle: () => time.settle(),
      published: async () => {
        const rows = await db.select({ args: jobs.args }).from(jobs).where(eq(jobs.name, recorderName)).orderBy(asc(jobs._creationTime), asc(jobs._id));
        return rows.map(({ args }) => (decodeStored(args) as { event: PublishedEvent }).event);
      },
    };
  };
}
