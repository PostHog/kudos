import { describe, expect, test } from "vitest";
import { jsonLog } from "../log.ts";
import { createApp, type Migrations } from "./app.ts";

function appWith({ migrations = "done" as Migrations, off = false } = {}) {
  const lines: Array<Record<string, unknown>> = [];
  const raw: string[] = [];
  const log = jsonLog((line) => {
    raw.push(line);
    lines.push(JSON.parse(line) as Record<string, unknown>);
  });
  let state = migrations;
  const app = createApp({ commit: "0123abc", readiness: { migrations: () => state }, off, log });
  return { app, lines, raw, migrate: (next: Migrations) => (state = next) };
}

describe("before the migrations are done", () => {
  test("/healthz answers at once with the served commit and the migrations' state", async () => {
    const { app } = appWith({ migrations: "pending" });

    const response = await app.request("/healthz");

    expect(response.status, "health answers while migrating").toBe(200);
    expect(await response.json(), "health names the commit and that migrations are still running").toEqual({
      commit: "0123abc",
      migrations: "pending",
      off: false,
    });
  });

  test("every other route answers 503 until the migrations are done, then reaches the app", async () => {
    const { app, migrate } = appWith({ migrations: "pending" });

    for (const [method, path] of [["GET", "/"], ["POST", "/slack/events"], ["GET", "/api/anything"]] as const) {
      const response = await app.request(path, { method });
      expect(response.status, `${method} ${path} while migrating`).toBe(503);
      expect(response.headers.get("retry-after"), `${method} ${path} asks to retry`).toBe("5");
    }

    migrate("done");
    expect((await app.request("/nowhere")).status, "an unknown route after the migrations").toBe(404);
  });

  test("without a database every route but /healthz answers 503", async () => {
    const { app } = appWith({ migrations: "no-database" });

    expect(await (await app.request("/healthz")).json(), "health says there is no database").toMatchObject({ migrations: "no-database" });
    expect((await app.request("/")).status, "an app route without a database").toBe(503);
  });
});

describe("HEDGEHUG_OFF", () => {
  test("Slack's routes answer 200 and do nothing, everything else answers 503, health says off", async () => {
    const { app } = appWith({ off: true });

    for (const path of ["/slack/events", "/slack/commands", "/slack/interactivity"]) {
      const response = await app.request(path, { method: "POST", body: "token=x&text=thanks" });
      expect(response.status, `${path} while off`).toBe(200);
      expect(await response.text(), `${path} answers with no body`).toBe("");
    }
    expect((await app.request("/")).status, "the website while off").toBe(503);
    expect((await app.request("/api/query/x", { method: "POST" })).status, "the website's API while off").toBe(503);
    expect(await (await app.request("/healthz")).json(), "health says off").toMatchObject({ off: true });
  });

  test("Slack's routes answer 200 while off even before the migrations are done", async () => {
    const { app } = appWith({ off: true, migrations: "no-database" });

    expect((await app.request("/slack/events", { method: "POST" })).status, "Slack while off, no database").toBe(200);
  });
});

describe("request logs", () => {
  test("one line per request with method, path, status and duration, and never a header, query or body", async () => {
    const { app, lines, raw } = appWith();

    await app.request("/slack/events?token=query-secret-value", {
      method: "POST",
      headers: { authorization: "Bearer header-secret-value", "x-slack-signature": "v0=signature-secret-value" },
      body: JSON.stringify({ event: { text: "thanks for the body-secret-value :kudos:" } }),
    });

    const requests = lines.filter((line) => line.message === "request");
    expect(requests, "one request line").toHaveLength(1);
    expect(requests[0], "the line names method, path and status").toMatchObject({ method: "POST", path: "/slack/events", status: 404 });
    expect(typeof requests[0]?.durationMs, "the line has a duration").toBe("number");
    const everything = raw.join("");
    for (const secret of ["query-secret-value", "header-secret-value", "signature-secret-value", "body-secret-value"]) {
      expect(everything, `the log holds no ${secret}`).not.toContain(secret);
    }
  });
});
