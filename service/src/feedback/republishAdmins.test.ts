// Ported from convex/feedback/republishAdmins.test.ts: republishing every admin's App Home a page at a time, so no one call
// schedules more jobs than a call may. The pages read S3's admin directory, so the walk is declared waiting; publishing
// each home is S17's, and this walk only reads the jobs it leaves behind.
import { and, asc, eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { decodeStored } from "../db/codec.ts";
import { jobs } from "../db/schema/service.ts";
import { republishAdminsIn, republishAdminsInJob } from "./homes.ts";
import { publishHomeJob } from "../slack/appHome.ts";

const admins = Array.from({ length: 1_500 }, (_, index) => `U_ADMIN_${String(index).padStart(4, "0")}`);

const backend = useTestBackend({ now: Date.parse("2026-10-16T10:00:00Z") });
type Backend = ReturnType<typeof backend>;

waitsOn(
  ["S3"],
  "a workspace of 1,500 admins gets each admin's App Home published once, and nobody else's",
  async () => {
    const t = backend();
    for (const user of admins) await t.seed.insert("members", { workspace: "T1", user, kind: "member", admin: true });
    await t.seed.insert("members", { workspace: "T1", user: "U_GONE_ADMIN", kind: "not-a-member", admin: true });
    await t.seed.insert("members", { workspace: "T1", user: "U_MEMBER", kind: "member", admin: false });
    await t.seed.insert("members", { workspace: "T2", user: "U_OTHER_ADMIN", kind: "member", admin: true });

    await t.run((ctx) => republishAdminsIn(ctx, { workspace: "T1" }));
    await runEveryRepublishPage(t);

    expect(await publishedHomes(t)).toEqual(admins.map((user) => ({ workspace: "T1", user })));
  },
  120_000,
);

// Runs each page the last one left pending, by hand, as the oracle does, so the homes' own jobs stay pending to be read.
async function runEveryRepublishPage(t: Backend) {
  for (let pages = 0; pages < admins.length; pages += 1) {
    const [next] = await pendingJobsNamed(t, republishAdminsInJob.name);
    if (next === undefined) return;
    await t.run(async (ctx) => {
      await ctx.tx.update(jobs).set({ state: "canceled", completedAt: ctx.now }).where(eq(jobs._id, next._id));
      await republishAdminsIn(ctx, decodeStored(next.args) as { workspace: string; cursor?: string });
    });
  }
}

async function publishedHomes(t: Backend) {
  const pending = await pendingJobsNamed(t, publishHomeJob.name);
  return pending.map(({ args }) => decodeStored(args) as { workspace: string; user: string }).map(({ workspace, user }) => ({ workspace, user })).toSorted((first, second) => first.user.localeCompare(second.user));
}

function pendingJobsNamed(t: Backend, name: string) {
  return t.query(({ tx }) => tx.select().from(jobs).where(and(eq(jobs.name, name), eq(jobs.state, "pending"))).orderBy(asc(jobs._creationTime), asc(jobs._id)));
}
