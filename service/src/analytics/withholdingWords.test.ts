// A job that handles members' words withholds them from any error it throws, so a job's failure row never carries
// them. A stub not ported yet carries no words, only its module's path, so its NotPortedError passes as it is: the test
// backend's settle then names it, and a waiting test keeps waiting. A database error keeps its code, which carries no
// words either, so a serialization failure still retries.
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
const wordsInItsCode = "THANKS_FOR_UNTANGLING_THE_DEPLOY";
const codedQuote = mutationJob(
  "testing.codedQuote",
  z.object({ nested: z.boolean() }),
  withholdingWords(async (_ctx, { nested }: { nested: boolean }) => {
    const coded = Object.assign(new Error("thanks"), { code: wordsInItsCode });
    throw nested ? new Error("wrapped", { cause: coded }) : coded;
  }),
);
let conflicts = 0;
const forgetOnce = mutationJob(
  "testing.forgetOnce",
  z.object({}),
  withholdingWords(async (ctx) => {
    if (conflicts-- > 0) throw Object.assign(new Error("could not serialize access due to concurrent update of thanks"), { code: "40001" });
    await ctx.tx.update(jobs).set({ error: "forgotten" }).where(eq(jobs.name, "testing.forgetOnce"));
  }),
);
const backend = useTestBackend({ registry: createRegistry({ testing: { jobs: [quote, codedQuote, replyWithWords, forgetOnce] } }) });

test("a job's error keeps the member's words out of its failure row", async () => {
  const t = backend();
  await t.run(async (ctx) => void (await ctx.jobs.enqueue(quote, {})));

  await t.settle();
  const [row] = await t.query(async ({ tx }) => tx.select({ state: jobs.state, error: jobs.error }).from(jobs).where(eq(jobs.name, "testing.quote")));

  expect(row?.state, "the job").toBe("failed");
  expect(row?.error, "its error").not.toContain("untangling");
});

test("a code that isn't the database's or the network's stays out of the failure row and the log, nested or not", async () => {
  for (const nested of [false, true]) {
    const t = backend();
    await t.run(async (ctx) => void (await ctx.jobs.enqueue(codedQuote, { nested })));

    await t.settle();
    const [row] = await t.query(async ({ tx }) => tx.select({ state: jobs.state, error: jobs.error }).from(jobs).where(eq(jobs.name, "testing.codedQuote")));

    expect(row?.state, `the job, nested: ${nested}`).toBe("failed");
    expect(JSON.stringify([row, t.logs]), `its row and the log, nested: ${nested}`).not.toContain(wordsInItsCode);
  }
});

test("a stub not ported yet passes through as itself, so a waiting test keeps waiting", async () => {
  const t = backend();

  const path = await stillWaiting(["S5"], async () => {
    await t.run(async (ctx) => void (await ctx.jobs.enqueue(replyWithWords, {})));
    await t.settle();
  });

  expect(path, "the stub the job reached").toBe("feedback.replies.privateReply");
});

test("a serialization failure in a job that withholds words retries, and the job completes", async () => {
  const t = backend();
  conflicts = 1;
  await t.run(async (ctx) => void (await ctx.jobs.enqueue(forgetOnce, {})));

  await t.settle();
  const [row] = await t.query(async ({ tx }) => tx.select({ state: jobs.state, error: jobs.error }).from(jobs).where(eq(jobs.name, "testing.forgetOnce")));

  expect(row, "the job").toEqual({ state: "success", error: "forgotten" });
});
