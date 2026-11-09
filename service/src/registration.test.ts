import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { createClock } from "./clock.ts";
import { createApp, type Migrations } from "./http/app.ts";
import { mutationJob } from "./jobs/define.ts";
import type { Operations } from "./operations.ts";
import { createFrontDoor } from "./slack/frontDoor.ts";
import { createRegistry } from "./registration.ts";
import { domains, serviceRegistry } from "./registry.ts";

const job = (name: string) => mutationJob(name, z.object({}), async () => {});
const subscriber = (name: string) => mutationJob(name, z.object({ event: z.object({ type: z.string() }) }), async () => {});

describe("the registry", () => {
  test("every domain folder of today's app has a registration module the service's registry reads", () => {
    const folders = readdirSync(new URL("../../convex", import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => entry.name);
    expect(Object.keys(domains).sort()).toEqual(folders.sort());
    for (const registration of Object.values(domains)) expect(registration).toBeTypeOf("object");
  });

  test("the service's registry holds the front door's receipts cron", () => {
    expect([...serviceRegistry.jobs.keys()]).toContain("slack.receipts.deleteExpired");
  });

  test("a subscriber's job joins the worker's jobs, once even when the domain registers it as a job too", () => {
    const recordEffects = subscriber("progression.progression.recordEffects");
    const registry = createRegistry({
      progression: { jobs: [recordEffects], subscribers: [{ event: "kudosGiven", job: recordEffects }] },
      analytics: { subscribers: [{ event: "kudosGiven", job: subscriber("analytics.subscribers.recordKudosGiven") }] },
    });
    expect([...registry.jobs.keys()]).toEqual(["progression.progression.recordEffects", "analytics.subscribers.recordKudosGiven"]);
    expect(registry.subscribers.get("kudosGiven")?.map(({ job }) => job.name)).toEqual(["progression.progression.recordEffects", "analytics.subscribers.recordKudosGiven"]);
  });

  test("a job name two domains register stops the service", () => {
    expect(() => createRegistry({ quests: { jobs: [job("quests.newWeek.sweep")] }, unlocks: { jobs: [job("quests.newWeek.sweep")] } })).toThrow("Two jobs are registered as quests.newWeek.sweep");
  });

  test("a Slack kind two domains register stops the service, naming both", () => {
    const handler = async () => {};
    expect(() => createRegistry({ hugs: { slack: { events: { reactionAdded: handler } } }, album: { slack: { events: { reactionAdded: handler } } } })).toThrow(
      "Both hugs and album register the Slack events reactionAdded",
    );
    const merged = createRegistry({ hugs: { slack: { events: { reactionAdded: handler } } }, engine: { slack: { events: { message: handler }, commands: { leaderboard: async () => undefined } } } });
    expect(Object.keys(merged.slack.events ?? {})).toEqual(["reactionAdded", "message"]);
    expect(Object.keys(merged.slack.commands ?? {})).toEqual(["leaderboard"]);
  });
});

const quiet = { info: () => {}, error: () => {} };
const runtime = { operations: {} as Operations, clock: createClock(), log: quiet };

describe("a domain's website routes", () => {
  test("answer behind the app's gate", async () => {
    const { routes } = createRegistry({ website: { routes: () => new Hono().get("/api/album", (c) => c.json({ album: [] })) } });
    let migrations: Migrations = "pending";
    const app = createApp({ commit: "test", readiness: { migrations: () => migrations }, off: false, log: quiet, clock: createClock(), routes: routes.map((route) => route(runtime)) });

    expect((await app.request("/api/album")).status, "before the migrations").toBe(503);
    migrations = "done";
    expect(await (await app.request("/api/album")).json()).toEqual({ album: [] });
  });

  test("are built with the service's operations, clock and log", () => {
    let given: unknown;
    const { routes } = createRegistry({ website: { routes: (service) => ((given = service), new Hono()) } });
    routes.forEach((route) => route(runtime));
    expect(given).toBe(runtime);
  });

  test("can't take the app's own paths: Slack's, the health check, the time seam or the load's", async () => {
    const reached: string[] = [];
    const taken = new Hono();
    for (const path of ["/slack/events", "/slack/domain", "/slack", "/healthz", "/testing/time", "/admin/load/start"]) taken.all(path, (c) => (reached.push(path), c.text("domain")));
    const { routes } = createRegistry({ website: { routes: () => taken } });
    for (const [off, migrations] of [[true, "pending"], [false, "done"]] as const) {
      const slack = createFrontDoor({ signingSecret: "s", clock: createClock(), off, log: quiet, handlers: {} });
      const app = createApp({ commit: "test", readiness: { migrations: () => migrations }, off, log: quiet, clock: createClock(), slack, routes: routes.map((route) => route(runtime)) });
      // Off, the gate answers 503 for every path but Slack's; on, the reserved paths are not found.
      for (const path of ["/slack/domain", "/slack"]) expect((await app.request(path, { method: "POST" })).status, `${path}, off: ${off}`).toBe(404);
      for (const path of ["/testing/time", "/admin/load/start"]) expect((await app.request(path, { method: "POST" })).status, `${path}, off: ${off}`).toBe(off ? 503 : 404);
      expect((await app.request("/slack/events", { method: "POST", body: "{}" })).status, `the front door's own route, off: ${off}`).toBe(401);
      expect((await app.request("/healthz", { method: "POST" })).status, `POST /healthz, off: ${off}`).toBe(off ? 503 : 404);
      expect(await (await app.request("/healthz")).json()).toMatchObject({ commit: "test" });
    }
    expect(reached).toEqual([]);
  });

  test("a throw that isn't an Error, from a route, middleware or a Slack handler, answers 500 and is logged without its value", async () => {
    const lines: string[] = [];
    const log = { info: (message: string, fields?: object) => void lines.push(JSON.stringify({ message, ...fields })), error: (message: string, fields?: object) => void lines.push(JSON.stringify({ message, ...fields })) };
    const thrown: unknown[] = ["thanks for the release notes", { text: "thanks for the release notes" }, null];
    for (const value of thrown) {
      lines.length = 0;
      const routes = new Hono()
        .use("/api/guarded/*", async () => {
          throw value;
        })
        .post("/api/give", () => {
          throw value;
        })
        .post("/api/guarded/x", (c) => c.text("never"));
      const clock = createClock();
      const slack = createFrontDoor({ signingSecret: "s", clock, off: false, log, operations: runtime.operations, handlers: { commands: { profileCard: async () => { throw value; } } } });
      const app = createApp({ commit: "test", readiness: { migrations: () => "done" }, off: false, log, clock, slack, routes: [routes] });
      const timestamp = Math.floor(clock.now() / 1000).toString();
      const command = "text=thanks";
      const signature = `v0=${createHmac("sha256", "s").update(`v0:${timestamp}:${command}`).digest("hex")}`;
      const requests: Array<[string, RequestInit]> = [
        ["/api/give", { method: "POST" }],
        ["/api/guarded/x", { method: "POST" }],
        ["/slack/commands", { method: "POST", headers: { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature }, body: command }],
      ];

      for (const [path, init] of requests) {
        const answer = await app.request(path, init);
        expect(answer.status, `${path}, ${JSON.stringify(value)}`).toBe(500);
        expect(await answer.text()).not.toContain("thanks");
      }
      expect(lines.join("\n")).not.toContain("thanks");
      expect(lines.filter((line) => line.includes('"request failed"'))).toHaveLength(3);
      expect(lines.filter((line) => line.includes('"message":"request"'))).toHaveLength(3);
    }
  });

  test("a response body that fails while it streams ends the response, and is logged without its message", async () => {
    const lines: string[] = [];
    const log = { info: () => {}, error: (message: string, fields?: object) => void lines.push(JSON.stringify({ message, ...fields })) };
    const failing = new Hono().get("/api/export", () => {
      let sent = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent) throw Object.assign(new TypeError("select failed for thanks for the release notes"), { code: "57014" });
          sent = true;
          controller.enqueue(new TextEncoder().encode("first,"));
        },
      });
      return new Response(body, { headers: { "content-type": "text/csv" } });
    });
    const app = createApp({ commit: "test", readiness: { migrations: () => "done" }, off: false, log, clock: createClock(), routes: [failing] });

    const answer = await app.request("/api/export");
    const read = await answer.text().then(
      () => "read whole",
      (error: unknown) => String(error),
    );

    expect(read).not.toBe("read whole");
    expect(read).not.toContain("thanks");
    expect(answer.headers.get("content-type")).toBe("text/csv");
    expect(lines).toEqual([JSON.stringify({ message: "response body failed", path: "/api/export", error: "TypeError", code: "57014" })]);
  });

  test("a failure after a response was made answers a plain 500, with none of that response's headers", async () => {
    const lines: string[] = [];
    const log = { info: (message: string, fields?: object) => void lines.push(JSON.stringify({ message, ...fields })), error: (message: string, fields?: object) => void lines.push(JSON.stringify({ message, ...fields })) };
    for (const thrown of [new TypeError("thanks for the release notes"), "thanks for the release notes"]) {
      lines.length = 0;
      const routes = new Hono()
        .use("/api/*", async (_c, next) => {
          await next();
          throw thrown;
        })
        .get("/api/give", () => new Response("x", { headers: { "content-length": "1", "content-encoding": "gzip", etag: '"given"' } }));
      const app = createApp({ commit: "test", readiness: { migrations: () => "done" }, off: false, log, clock: createClock(), routes: [routes] });

      const answer = await app.request("/api/give");

      expect(answer.status).toBe(500);
      expect([answer.headers.get("content-encoding"), answer.headers.get("etag"), answer.headers.get("content-length")]).toEqual([null, null, null]);
      expect(await answer.text()).toBe("Internal Server Error");
      expect(lines.join("\n")).not.toContain("thanks");
      expect(lines.map((line) => JSON.parse(line).message)).toEqual(["request failed", "request"]);
    }
  });

  test("a client that stops reading is no failure: the body's source is cancelled and nothing is logged", async () => {
    const lines: string[] = [];
    const log = { info: () => {}, error: (message: string, fields?: object) => void lines.push(JSON.stringify({ message, ...fields })) };
    let cancelled = 0;
    const routes = new Hono().get("/api/export", () => {
      let sent = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent) return new Promise<void>(() => {});
          sent = true;
          controller.enqueue(new TextEncoder().encode("first,"));
        },
        cancel: () => void cancelled++,
      });
      return new Response(body);
    });
    const app = createApp({ commit: "test", readiness: { migrations: () => "done" }, off: false, log, clock: createClock(), routes: [routes] });

    const reader = (await app.request("/api/export")).body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(cancelled).toBe(1);
    expect(lines).toEqual([]);
  });

  test("a response whose body was already read or is locked answers 500, with the request line", async () => {
    const lines: string[] = [];
    const log = { info: (message: string, fields?: object) => void lines.push(JSON.stringify({ message, ...fields })), error: (message: string, fields?: object) => void lines.push(JSON.stringify({ message, ...fields })) };
    const routes = new Hono()
      .get("/api/read", async () => {
        const response = new Response("abcdef", { headers: { "content-length": "6" } });
        await response.text();
        return response;
      })
      .get("/api/locked", () => {
        const response = new Response("abcdef", { headers: { "content-length": "6" } });
        response.body!.getReader();
        return response;
      });
    const app = createApp({ commit: "test", readiness: { migrations: () => "done" }, off: false, log, clock: createClock(), routes: [routes] });

    for (const path of ["/api/read", "/api/locked"]) {
      lines.length = 0;
      const answer = await app.request(path);

      expect(answer.status, path).toBe(500);
      expect(answer.headers.get("content-length"), path).not.toBe("6");
      expect(lines.map((line) => JSON.parse(line)).map(({ message, status }) => ({ message, status })), path).toEqual([
        { message: "request failed", status: undefined },
        { message: "request", status: 500 },
      ]);
    }
  });

  test("no service code streams with Hono's streaming helpers, which print a failure whole and answer 200", () => {
    // Hono's streaming helpers, and JSX streaming, directly or through the renderer's `stream` option. Built from
    // parts, so this file isn't one of them.
    const helpers = new RegExp(`["'\`]hono/(${["streaming", "jsx/streaming", "jsx-renderer"].join("|")})["'\`]`);
    const sources = readdirSync(new URL(".", import.meta.url), { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file));
    const streaming = sources.filter((file) => helpers.test(readFileSync(new URL(file, import.meta.url), "utf8")));

    expect(streaming).toEqual([]);
  });

  test("a route that fails answers 500 and logs its class and code, never its message", async () => {
    const lines: string[] = [];
    const log = { info: () => {}, error: (message: string, fields?: object) => void lines.push(JSON.stringify({ message, ...fields })) };
    const failing = new Hono().post("/api/give", () => {
      throw Object.assign(new TypeError('insert failed with params ["thanks for the release notes"]'), { code: "23505" });
    });
    const printed: unknown[] = [];
    const console = vi.spyOn(globalThis.console, "error").mockImplementation((...args) => void printed.push(...args));
    try {
      const app = createApp({ commit: "test", readiness: { migrations: () => "done" }, off: false, log, clock: createClock(), routes: [failing] });
      const answer = await app.request("/api/give", { method: "POST" });

      expect(answer.status).toBe(500);
      expect(await answer.text()).not.toContain("thanks");
    } finally {
      console.mockRestore();
    }
    expect(printed, "nothing printed past the log").toEqual([]);
    expect(lines).toEqual([JSON.stringify({ message: "request failed", path: "/api/give", error: "TypeError", code: "23505" })]);
  });
});
