// Live views: `GET /api/live` is a member's stream of invalidations. Every committed write a website view shows
// notifies the process's one listener, which wakes the open streams, at most once a second each; the website then
// refetches what its open views hold. Every case asks the real app, with the real Postgres delivering the notifies.
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { slackError } from "../../testing/fakeSlack.ts";
import { definitionsStored, offForEveryone } from "../../testing/flags.ts";
import { websiteOpenIn } from "../../testing/website.ts";
import { record } from "../analytics/outbox.ts";
import { edgeEmailHeader } from "./identity.ts";

const backend = useTestBackend();

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const member = (t: TestBackend, user: string) => t.seed.insert("members", { workspace: "T1", user, kind: "member", email: `${user.toLowerCase()}@example.com`, name: user });
const signedIn = (email?: string): Record<string, string> => (email === undefined ? {} : { [edgeEmailHeader]: email });

/** A website member signed in as `U_JUNO`, in an open website. */
async function juno(t: TestBackend): Promise<string> {
  await websiteOpenIn(t);
  await member(t, "U_JUNO");
  return "u_juno@example.com";
}

interface Stream {
  /** The events received so far, by name. */
  events(): string[];
  /** When each event arrived, in milliseconds. */
  arrivals(): number[];
  /** Every chunk received so far, comments included. */
  chunks(): string[];
  /** Goes away, as a closed tab does. */
  leave(): Promise<void>;
}

/** Opens the live stream as `email`, once the backend listens, and reads it as it arrives. */
async function opened(t: TestBackend, email: string): Promise<Stream> {
  await t.listening;
  const answer = await t.app.request("/api/live", { headers: signedIn(email) });
  expect(answer.headers.get("content-type"), "a stream").toMatch(/^text\/event-stream/);
  const reader = answer.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ name: string; at: number }> = [];
  const chunks: string[] = [];
  let pending = "";
  let left = false;
  void (async () => {
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done) return;
      const text = decoder.decode(value, { stream: true });
      chunks.push(text);
      pending += text;
      for (let end = pending.indexOf("\n\n"); end >= 0; end = pending.indexOf("\n\n")) {
        const name = /^event: (.*)$/m.exec(pending.slice(0, end))?.[1];
        if (name !== undefined) events.push({ name, at: performance.now() });
        pending = pending.slice(end + 2);
      }
    }
  })();
  const leave = async () => {
    if (left) return;
    left = true;
    await reader.cancel();
  };
  onTestFinished(leave);
  return { events: () => events.map(({ name }) => name), arrivals: () => events.map(({ at }) => at), chunks: () => [...chunks], leave };
}

/** Waits until `stream` has `count` events, then a little longer, so a stray later one would show. */
async function settledAt(stream: Stream, count: number, quietMs = 1_300): Promise<string[]> {
  await vi.waitFor(() => expect(stream.events().length).toBeGreaterThanOrEqual(count), { timeout: 3_000 });
  await new Promise((resolve) => setTimeout(resolve, quietMs));
  return stream.events();
}

describe("a member's live stream", () => {
  test("a signed-in member's stream gets an invalidate once a write a website view shows commits", async () => {
    const t = backend();
    const stream = await opened(t, await juno(t));

    await member(t, "U_RAVI");

    await vi.waitFor(() => expect(stream.events()).toEqual(["invalidate"]), { timeout: 3_000 });
  });

  test("writes within a second reach a stream as one invalidate, then one more a second later", async () => {
    const t = backend();
    const stream = await opened(t, await juno(t));

    for (const user of ["U_RAVI", "U_ADA", "U_LIN"]) await member(t, user);

    expect(await settledAt(stream, 2)).toEqual(["invalidate", "invalidate"]);
    const [first, second] = stream.arrivals();
    expect(second! - first!, "the trailing one waits out the second").toBeGreaterThanOrEqual(900);
  });

  test("a write only the service's own tables hold, such as an analytics event, wakes no stream", async () => {
    const t = backend();
    const email = await juno(t);
    const subject = await member(t, "U_ADA");
    const stream = await opened(t, email);

    await t.run((ctx) => record(ctx, "T1", [{ event: "kudos given", subject: { member: subject }, at: ctx.now, properties: {} }]));
    expect(await t.seed.all("analyticsOutbox"), "the event is pending").toHaveLength(1);
    await member(t, "U_RAVI");

    expect(await settledAt(stream, 1), "only the member's write").toEqual(["invalidate"]);
  });

  test("holds no database connection: more streams than the pool has connections, and writes still commit and reach them all", async () => {
    const t = backend();
    const email = await juno(t);
    const streams = await Promise.all(Array.from({ length: 7 }, () => opened(t, email)));

    await member(t, "U_RAVI");

    await vi.waitFor(() => expect(streams.map((stream) => stream.events())).toEqual(streams.map(() => ["invalidate"])), { timeout: 3_000 });
  });

  test("a stream the member left gets nothing more, and the streams still open get theirs", async () => {
    const t = backend();
    const email = await juno(t);
    const [left, stays] = [await opened(t, email), await opened(t, email)];

    await left.leave();
    await member(t, "U_RAVI");

    await vi.waitFor(() => expect(stays.events()).toEqual(["invalidate"]), { timeout: 3_000 });
    expect(left.events()).toEqual([]);
    expect(t.logs.filter(({ level }) => level === "error")).toEqual([]);
  });

  test("an idle stream hears from the service about every 20 seconds, so the edge keeps it open", async () => {
    const t = backend();
    const email = await juno(t);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const stream = await opened(t, email);
    const before = stream.chunks().length;

    await vi.advanceTimersByTimeAsync(20_000);

    await vi.waitFor(() => expect(stream.chunks().length).toBeGreaterThan(before));
    expect(stream.events(), "no invalidate").toEqual([]);
  });
});

describe("who gets a stream", () => {
  test("signed out, not a member, or closed: the denial a read answers, and no stream", async () => {
    const t = backend();
    const email = await juno(t);
    const asked = async (email?: string) => {
      const answer = await t.app.request("/api/live", { headers: signedIn(email) });
      expect(answer.headers.get("content-type"), "no stream").toMatch(/^application\/json/);
      return answer.json();
    };

    expect(await asked()).toEqual({ kind: "signed-out" });
    expect(await asked("stranger@example.com")).toEqual({ kind: "not-a-member" });
    await definitionsStored(t.operations, offForEveryone("website"));
    expect(await asked(email)).toEqual({ kind: "closed" });
  });

  test("a cross-site request is refused before anyone is looked up", async () => {
    const t = backend();
    await websiteOpenIn(t);
    // An email only Slack could resolve, with Slack failing: looking anyone up first would answer 500.
    t.slack.answering("users.lookupByEmail", ...Array.from({ length: 5 }, () => slackError("internal_error")));

    const answer = await t.app.request("/api/live", { headers: { "sec-fetch-site": "cross-site", ...signedIn("stranger@example.com") } });

    expect(answer.status).toBe(403);
  });
});

describe("waking every open stream", () => {
  test("the website clock's cron writes the clock and wakes open streams, so a tab rolls into a new day", async () => {
    const t = backend();
    const stream = await opened(t, await juno(t));
    const at = t.clock.now();

    await t.time.runCron("website.clock.tick");
    await vi.waitFor(() => expect(stream.events()).toEqual(["invalidate"]), { timeout: 3_000 });
    await t.time.advance(15 * 60_000);
    await t.time.runCron("website.clock.tick");

    expect(await t.seed.all("websiteClock"), "one clock, at its last tick").toEqual([expect.objectContaining({ tick: at + 15 * 60_000 })]);
  });

  test("when the listener listens again after losing its connection, every open stream gets an invalidate", async () => {
    const t = backend();
    const email = await juno(t);
    const streams = [await opened(t, email), await opened(t, email)];
    const listener = await listenerBackend(t);

    await t.query(({ tx }) => tx.execute(sql`select pg_terminate_backend(${listener})`));

    await vi.waitFor(() => expect(streams.map((stream) => stream.events())).toEqual([["invalidate"], ["invalidate"]]), { timeout: 3_000 });
  });
});

/** The database backend holding the test backend's listener. */
async function listenerBackend(t: TestBackend): Promise<number> {
  const { rows } = await t.query(({ tx }) =>
    tx.execute<{ pid: number }>(sql`select pid from pg_stat_activity where state = 'idle' and query like 'listen %' and position('.' || current_schema() || '"' in query) > 0`),
  );
  expect(rows, "one listener").toHaveLength(1);
  return rows[0]!.pid;
}
