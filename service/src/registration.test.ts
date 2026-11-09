import { readdirSync } from "node:fs";
import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { createClock } from "./clock.ts";
import { createApp, type Migrations } from "./http/app.ts";
import { mutationJob } from "./jobs/define.ts";
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

test("a domain's website routes answer behind the app's gate", async () => {
  const album = new Hono().get("/api/album", (c) => c.json({ album: [] }));
  const { routes } = createRegistry({ website: { routes: album } });
  let migrations: Migrations = "pending";
  const app = createApp({ commit: "test", readiness: { migrations: () => migrations }, off: false, log: { info: () => {}, error: () => {} }, clock: createClock(), routes });

  expect((await app.request("/api/album")).status, "before the migrations").toBe(503);
  migrations = "done";
  expect(await (await app.request("/api/album")).json()).toEqual({ album: [] });
});
