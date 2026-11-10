// The module map across stacks, as a later stack will call it before the owner of the body merges: an action runs
// another stack's mutation through `ctx.run`, and a mutation enqueues another stack's job with its args typed by the
// job's schema. The typecheck is half the proof; the stubs then throw by their Convex path.
import { describe, expect, test } from "vitest";
import type { Id } from "./db/columns.ts";
import { recomputeSpotlightOfJob } from "./engine/spotlight.ts";
import { tellBatchSummariesJob } from "./feedback/tierNotices.ts";
import { startBackfillUnlessStarted } from "./stickers/backfill.ts";
import type { Job } from "./jobs/define.ts";
import { NotPortedError } from "./notPorted.ts";
import type { ActionContext, MutationContext } from "./operations.ts";

// An action runs another stack's mutation: the stickers' backfill of a workspace.
async function checkChannel(ctx: ActionContext) {
  return ctx.run.mutation("stickers.backfill.startBackfillUnlessStarted", (tx) => startBackfillUnlessStarted(tx, "T1"));
}

// The leaderboard's visibility change and the achievements replay schedule the engine's and the feedback's jobs.
async function scheduleAcrossStacks(ctx: MutationContext, member: Id<"members">, batch: Id<"bookBatches">) {
  await ctx.jobs.enqueue(recomputeSpotlightOfJob, { member, side: "given", before: null });
  await ctx.jobs.enqueue(tellBatchSummariesJob, { batch, cursor: null });
  // @ts-expect-error a job takes its schema's input: `side` is "given" or "received"
  await ctx.jobs.enqueue(recomputeSpotlightOfJob, { member, side: "sideways", before: null });
}

describe("the module map across stacks", () => {
  test("an action's run of another stack's mutation reaches its stub, which names its Convex path", async () => {
    const ctx = { run: { mutation: (_name: string, handler: (tx: MutationContext) => Promise<unknown>) => handler({} as MutationContext) } } as unknown as ActionContext;
    const refusal = await checkChannel(ctx).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(NotPortedError);
    expect((refusal as Error).message).toContain("stickers.backfill.startBackfillUnlessStarted");
  });

  test("another stack's jobs enqueue by their Convex names, their args checked by their schemas", async () => {
    const enqueued: string[] = [];
    const jobs = {
      enqueue: async (job: Job, args: unknown) => {
        job.args.parse(args);
        enqueued.push(job.name);
        return "job";
      },
    };
    const refusal = await scheduleAcrossStacks({ jobs } as unknown as MutationContext, "member" as Id<"members">, "batch" as Id<"bookBatches">).catch((error: unknown) => error);

    expect(enqueued).toEqual(["engine.spotlight.recomputeSpotlightOf", "feedback.tierNotices.tellBatchSummaries"]);
    // The third, which the typecheck refuses too, is refused by the job's schema before anything is enqueued.
    expect((refusal as Error).name).toBe("ZodError");
  });
});
