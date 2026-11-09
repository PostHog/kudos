import { describe, expect, test } from "vitest";
import { createClock } from "../clock.ts";
import { jsonLog } from "../log.ts";
import { createApp } from "./app.ts";

const secret = "a-test-secret-of-the-test";

function app(testSecret?: string) {
  const clock = createClock({ real: () => 1_000_000 });
  const created = createApp({
    commit: "c",
    readiness: { migrations: () => "done" },
    off: false,
    log: jsonLog(() => {}),
    clock,
    ...(testSecret ? { testSecret } : {}),
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

  test("refuses a body it doesn't know or a step back", async () => {
    const { clock, request } = app(secret);

    for (const body of [{ advance: -1 }, { advance: "1" }, {}, { advance: 1, settle: true }, []]) {
      expect((await request(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(clock.now()).toBe(1_000_000);
  });
});
