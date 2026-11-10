// The workspace stack's one local setup until S4's in-process test backend lands: the operation runner on the test
// database, the seeder, flag definitions stored as PostHog would serve them, and the jobs an operation enqueued.
import { asc, eq } from "drizzle-orm";
import { createClock } from "../src/clock.ts";
import { toDocument } from "../src/db/documents.ts";
import { jobs } from "../src/db/schema/index.ts";
import type { Log } from "../src/log.ts";
import { createOperations, type MutationContext, type QueryContext } from "../src/operations.ts";
import type { MemberId } from "../src/workspace/directory.ts";
import type { TestDatabase } from "./database.ts";
import type { FlagDefinition } from "./fakePostHog.ts";
import { definitionsStored } from "./flags.ts";
import { seeder } from "./seed.ts";

const quiet: Log = { info: () => {}, error: () => {} };

export function workspaceBackend(database: TestDatabase, at: number) {
  const clock = createClock({ real: () => at });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1 });
  const seed = seeder(operations);
  return {
    clock,
    operations,
    seed,
    mutation: <T>(handler: (ctx: MutationContext) => Promise<T>) => operations.mutation("test.mutation", handler),
    query: <T>(handler: (ctx: QueryContext) => Promise<T>) => operations.query("test.query", handler),
    flags: (...definitions: FlagDefinition[]) => definitionsStored(operations, ...definitions),
    member: (user: string, fields: { admin?: boolean; name?: string; kind?: "member" | "bot" | "not-a-member" } = {}) =>
      seed.insert("members", { workspace: "T1", user, kind: "member", asOf: 0, ...fields }) as Promise<MemberId>,
    scheduled: () =>
      operations.query("test.scheduled", async ({ tx }) =>
        (await tx.select().from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs._creationTime), asc(jobs._id))).map((row) => {
          const { name, args } = toDocument<{ name: string; args: unknown }>(jobs, row);
          return { name, args };
        }),
      ),
  };
}

export type WorkspaceBackend = ReturnType<typeof workspaceBackend>;
