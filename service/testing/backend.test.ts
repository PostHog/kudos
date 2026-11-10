// The test backend, driven from outside as a ported test drives it: a signed Slack event in, the fake Slack's channel
// and the published events out.
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { z } from "zod";
import { jobs } from "../src/db/schema/service.ts";
import { actionJob, mutationJob } from "../src/jobs/define.ts";
import { NotPortedError, notPorted } from "../src/notPorted.ts";
import { createRegistry } from "../src/registration.ts";
import { serviceRegistry } from "../src/registry.ts";
import { useTestBackend } from "./backend.ts";
import { stillWaiting } from "./waiting.ts";

// A small domain: a message event publishes `noted`, whose subscriber posts the text back to the channel, and a
// mutation job a minute later publishes `remembered`.
const postBack = actionJob("testing.postBack", z.object({ event: z.object({ type: z.literal("noted"), channel: z.string(), text: z.string(), fact: z.string() }) }), async (_ctx, { event }) => {
  await fetch("https://slack.com/api/chat.postMessage", { method: "POST", body: JSON.stringify({ channel: event.channel, text: `noted: ${event.text}` }) });
});
const remember = mutationJob("testing.remember", z.object({ text: z.string() }), async (ctx, { text }) => {
  const remembered = { type: "remembered", text };
  await ctx.publish(remembered);
});
// Jobs that end the way a ported test's jobs do while another stack's bodies are missing, or for another reason.
const replyPrivately = mutationJob("testing.replyPrivately", z.object({}), async () => {
  throw notPorted("feedback.replies.privateReply");
});
const deliver = actionJob("testing.deliver", z.object({}), async () => {
  throw notPorted("slack.delivery.deliver");
});
const broken = mutationJob("testing.broken", z.object({}), async () => {
  throw new Error("a defect in the job");
});
const registry = createRegistry({
  testing: {
    jobs: [remember, replyPrivately, deliver, broken],
    subscribers: [{ event: "noted", job: postBack }],
    slack: {
      events: {
        message: async (ctx, { event }) => {
          const { channel, text } = event as unknown as { channel: string; text: string };
          const noted = { type: "noted", channel, text };
          await ctx.publish(noted);
          await ctx.jobs.enqueue(remember, { text }, { after: 60_000 });
        },
      },
    },
  },
});

const backend = useTestBackend({ registry });

test("a signed Slack event runs its handler, and settling runs the subscribers it published to", async () => {
  const t = backend();

  const response = await t.event({ type: "message", channel: "C_GENERAL", text: "thanks" });
  const settled = await t.settle();

  expect(response.status, "Slack's ack").toBe(200);
  expect(settled.ran, "the jobs that ran, without the recorder's").toEqual(["testing.postBack"]);
  expect(t.slack.messagesIn("C_GENERAL").map(({ text }) => text), "what the channel shows").toEqual(["noted: thanks"]);
  expect(await t.published(), "what was published").toEqual([{ type: "noted", channel: "C_GENERAL", text: "thanks", fact: expect.any(String) }]);
});

test("a job scheduled for later runs only once the app's clock gets there", async () => {
  const t = backend();
  await t.event({ type: "message", channel: "C_GENERAL", text: "thanks" });
  await t.settle();

  t.time.advance(59_000);
  await t.settle();
  const early = (await t.published()).map(({ type }) => type);
  t.time.advance(1_000);
  await t.settle();

  expect(early, "a second early").toEqual(["noted"]);
  expect((await t.published()).map(({ type }) => type), "on time").toEqual(["noted", "remembered"]);
});

test("only committed operations' events are published", async () => {
  const t = backend();

  await t.run(async (ctx) => ctx.publish({ type: "kept" }));
  await expect(t.run(async (ctx) => {
    await ctx.publish({ type: "rolledBack" });
    throw new Error("the operation fails");
  }), "the failing operation").rejects.toThrow("the operation fails");

  expect((await t.published()).map(({ type }) => type), "what was published").toEqual(["kept"]);
});

test("the seeder, run and query share the backend's database and its clock", async () => {
  const t = backend({ now: Date.UTC(2026, 9, 13, 10) });

  const id = await t.seed.insert("allowanceSpending", { giver: "member-1", day: "2026-10-13", spent: 2 });
  t.time.advance(60_000);
  const inserted = await t.run(async ({ newRow }) => newRow()._creationTime);

  expect(await t.seed.get("allowanceSpending", id), "the seeded row").toMatchObject({ giver: "member-1", spent: 2, _creationTime: Date.UTC(2026, 9, 13, 10) });
  expect(await t.query(async ({ now }) => now), "a query's now").toBe(Date.UTC(2026, 9, 13, 10, 1));
  expect(Math.floor(inserted), "a mutation's new row").toBe(Date.UTC(2026, 9, 13, 10, 1));
});

test("the PostHog fake answers fetch as well", async () => {
  const t = backend();

  const answer = await fetch("https://posthog.test/batch/", { method: "POST", body: JSON.stringify({ api_key: "phc_test_project_token", batch: [] }) });

  expect(answer.status, "the batch's answer").toBe(200);
  expect(t.postHog.requests, "the batches it took").toHaveLength(1);
});

test("with the service's registry, the time seam runs the service's crons", async () => {
  const t = backend({ registry: serviceRegistry });

  const answer = await t.time.runCron("slack.receipts.deleteExpired");

  expect(answer, "the cron's answer").toEqual({ now: t.clock.now(), ran: ["slack.receipts.deleteExpired"], done: true });
});

test("a mutation job that reaches a stub fails settle with the stub's NotPortedError, naming the job", async () => {
  const t = backend();
  await t.run(async (ctx) => void (await ctx.jobs.enqueue(replyPrivately, {})));

  const settled = t.settle();

  await expect(settled, "settle").rejects.toThrow(NotPortedError);
  await expect(settled, "settle").rejects.toThrow("feedback.replies.privateReply is not ported yet, reached by the job testing.replyPrivately");
  expect((await t.settle()).ran, "the next settle, which surfaces each stub once").toEqual([]);
});

test("an action job that reaches a stub fails settle too, so a waiting test keeps waiting", async () => {
  const t = backend();

  const path = await stillWaiting(["S5"], async () => {
    await t.run(async (ctx) => void (await ctx.jobs.enqueue(deliver, {})));
    await t.settle();
    expect.unreachable("settle throws the stub's error");
  });

  expect(path, "the stub the job reached").toBe("slack.delivery.deliver");
});

test("a job that fails any other way leaves settle answering, and stays failed for the test's assertions", async () => {
  const t = backend();
  await t.run(async (ctx) => void (await ctx.jobs.enqueue(broken, {})));

  const settled = await t.settle();
  const [row] = await t.query(async ({ tx }) => tx.select({ state: jobs.state, error: jobs.error }).from(jobs).where(eq(jobs.name, "testing.broken")));

  expect(settled.ran, "what ran").toEqual(["testing.broken"]);
  expect(row, "the job's row").toEqual({ state: "failed", error: "Error: a defect in the job" });
});
