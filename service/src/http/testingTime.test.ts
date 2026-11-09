import { describe, expect, test } from "vitest";
import { createClock } from "../clock.ts";
import type { CronId } from "../jobs/crons.ts";
import type { Settled } from "../jobs/worker.ts";
import { jsonLog } from "../log.ts";
import { createApp } from "./app.ts";

const secret = "a-test-secret-of-the-test";

interface FakeWorker {
  settle(budgetMs: number): Promise<Settled>;
  runCron(id: CronId, budgetMs: number): Promise<Settled | undefined>;
}

function app(testSecret?: string, worker?: FakeWorker) {
  const clock = createClock({ real: () => 1_000_000 });
  const created = createApp({
    commit: "c",
    readiness: { migrations: () => "done" },
    off: false,
    log: jsonLog(() => {}),
    clock,
    ...(testSecret ? { testSecret } : {}),
    ...(worker ? { worker } : {}),
    timeBudgetMs: 1_234,
  });
  return { clock, request: (body: unknown, header: string | null = secret) => created.request("/testing/time", {
    method: "POST",
    headers: { "content-type": "application/json", ...(header === null ? {} : { "x-hedgehug-test-secret": header }) },
    body: JSON.stringify(body),
  }) };
}

describe("POST /testing/time", () => {
  test("is absent without HEDGEHUG_TEST_SECRET: 404 like any unknown path, and the clock stays", async () => {
    const { clock, request } = app();

    expect((await request({ advance: 60_000 })).status).toBe(404);
    expect(clock.now()).toBe(1_000_000);
  });

  test("answers 404 to a wrong or missing secret, and the clock stays", async () => {
    const { clock, request } = app(secret);

    expect((await request({ advance: 60_000 }, "wrong")).status, "wrong secret").toBe(404);
    expect((await request({ advance: 60_000 }, `${secret}x`)).status, "longer secret").toBe(404);
    expect((await request({ advance: 60_000 }, null)).status, "no header").toBe(404);
    expect(clock.now()).toBe(1_000_000);
  });

  test("advance moves the app's clock and answers the new now", async () => {
    const { clock, request } = app(secret);

    const response = await request({ advance: 60_000 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ now: 1_060_000, ran: [] });
    expect(clock.now()).toBe(1_060_000);
  });

  test("refuses a body it doesn't know, a step back, or a step past the last date", async () => {
    const { clock, request } = app(secret);

    for (const body of [{ advance: -1 }, { advance: "1" }, {}, { advance: 1, settle: true }, [], { advance: 1e300 }]) {
      expect((await request(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(clock.now()).toBe(1_000_000);
  });

  test("runCron runs the cron on the worker within the budget and answers what ran", async () => {
    const calls: unknown[] = [];
    const { request } = app(secret, {
      settle: async () => ({ ran: [], done: true }),
      runCron: async (id, budgetMs) => {
        calls.push([id, budgetMs]);
        return { ran: [id, "slack.delivery.sendReply"], done: true };
      },
    });

    const response = await request({ runCron: "website.clock.tick" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ now: 1_000_000, ran: ["website.clock.tick", "slack.delivery.sendReply"] });
    expect(calls).toEqual([["website.clock.tick", 1_234]]);
  });

  test("runCron refuses an id outside the contract, and a cron no job is registered for yet", async () => {
    const { request } = app(secret, { settle: async () => ({ ran: [], done: true }), runCron: async () => undefined });

    expect((await request({ runCron: "website.clock" })).status).toBe(400);
    expect((await request({ runCron: 7 })).status).toBe(400);
    expect((await request({ runCron: "analytics.drain.recover" })).status).toBe(409);
  });

  test("settle answers what ran, or 504 with what ran when the budget ran out first", async () => {
    let done = true;
    const { request } = app(secret, { settle: async () => ({ ran: ["a"], done }), runCron: async () => undefined });

    const settled = await request({ settle: true });
    expect(settled.status).toBe(200);
    expect(await settled.json()).toEqual({ now: 1_000_000, ran: ["a"] });

    done = false;
    const late = await request({ settle: true });
    expect(late.status).toBe(504);
    expect(await late.json()).toMatchObject({ now: 1_000_000, ran: ["a"] });

    expect((await request({ settle: false })).status).toBe(400);
  });

  test("without a worker, settle has nothing to run", async () => {
    const { request } = app(secret);

    expect(await (await request({ settle: true })).json()).toEqual({ now: 1_000_000, ran: [] });
  });
});
