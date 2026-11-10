// The failed-job sweep's read of the job history: the failed jobs it has yet to take in, in the order they finished.
// The history is never deleted, so this read must come from an index that holds only that backlog, already in order.
import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";

const database = useTestDatabase();

const unswept = `
  select "_id" from "jobs"
  where "state" = 'failed' and "sweptAt" is null
  order by "completedAt", "_id"
  limit 100`;

describe("the failed jobs the sweep has yet to take in", () => {
  test("are read from their own index, in the order they finished, with no sort", async () => {
    const client = await database.pool.connect();
    try {
      await client.query("begin");
      // A test table is small enough that a scan of it is cheapest; the plan for the table the history becomes is the index's.
      await client.query("set local enable_seqscan = off");
      const { rows } = await client.query<{ "QUERY PLAN": string }>(`explain ${unswept}`);
      const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
      expect(plan).toContain("jobs_failed_and_unswept");
      expect(plan).not.toMatch(/\bSort\b/);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  test("are exactly the failed jobs with no sweptAt", async () => {
    const job = (id: string, state: string, completedAt: number | null, sweptAt: number | null) =>
      database.pool.query(
        `insert into "jobs" ("_id", "_creationTime", "name", "args", "runAt", "kind", "state", "completedAt", "sweptAt") values ($1, 1, 'welcome.welcome.welcomeNewMembers', '"{}"', 1, 'mutation', $2, $3, $4)`,
        [id, state, completedAt, sweptAt],
      );
    await job("failed-later", "failed", 20, null);
    await job("failed-first", "failed", 10, null);
    await job("failed-and-swept", "failed", 5, 30);
    await job("succeeded", "success", 1, null);
    await job("pending", "pending", null, null);

    const { rows } = await database.pool.query<{ _id: string }>(unswept);

    expect(rows.map(({ _id }) => _id)).toEqual(["failed-first", "failed-later"]);
  });
});
