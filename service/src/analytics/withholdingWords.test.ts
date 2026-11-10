// A job that handles members' words withholds them from any error it throws, so a job's failure row never carries
// them. A stub not ported yet carries no words, only its module's path, so its NotPortedError passes as it is: the test
// backend's settle then names it, and a waiting test keeps waiting.
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { z } from "zod";
import { useTestBackend } from "../../testing/backend.ts";
import { stillWaiting } from "../../testing/waiting.ts";
import { jobs } from "../db/schema/service.ts";
import { mutationJob } from "../jobs/define.ts";
import { notPorted } from "../notPorted.ts";
import { createRegistry } from "../registration.ts";
import { withholdingWords } from "./exceptions.ts";

const quote = mutationJob(
  "testing.quote",
  z.object({}),
  withholdingWords(async () => {
    throw new Error("thanks for untangling the deploy");
  }),
);
const replyWithWords = mutationJob(
  "testing.replyWithWords",
  z.object({}),
  withholdingWords(async () => {
    throw notPorted("feedback.replies.privateReply");
  }),
);
const backend = useTestBackend({ registry: createRegistry({ testing: { jobs: [quote, replyWithWords] } }) });

test("a job's error keeps the member's words out of its failure row", async () => {
  const t = backend();
  await t.run(async (ctx) => void (await ctx.jobs.enqueue(quote, {})));

  await t.settle();
  const [row] = await t.query(async ({ tx }) => tx.select({ state: jobs.state, error: jobs.error }).from(jobs).where(eq(jobs.name, "testing.quote")));

  expect(row?.state, "the job").toBe("failed");
  expect(row?.error, "its error").not.toContain("untangling");
});

test("a stub not ported yet passes through as itself, so a waiting test keeps waiting", async () => {
  const t = backend();

  const path = await stillWaiting(["S5"], async () => {
    await t.run(async (ctx) => void (await ctx.jobs.enqueue(replyWithWords, {})));
    await t.settle();
  });

  expect(path, "the stub the job reached").toBe("feedback.replies.privateReply");
});
