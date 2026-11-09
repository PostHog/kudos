// One schema per Vitest worker on the run's Postgres: created and migrated once, its tables emptied before every test.
import pg from "pg";
import { afterAll, beforeEach, inject } from "vitest";
import { runMigrations } from "../src/db/migrate.ts";
import { createPool } from "../src/db/pool.ts";

export interface TestDatabase {
  /** A pool whose connections use this worker's schema. */
  pool: pg.Pool;
  /** A `DATABASE_URL` for this worker's schema, for a service started by the test. */
  url: string;
  schema: string;
}

/** Call at the top of a test file. */
export function useTestDatabase(): TestDatabase {
  const schema = `test_w${process.env.VITEST_POOL_ID ?? "0"}`;
  const url = withSearchPath(inject("databaseUrl"), schema);
  const pool = createPool(url);
  let ready: Promise<void> | undefined;

  beforeEach(async () => {
    ready ??= (async () => {
      const admin = new pg.Client({ connectionString: inject("databaseUrl") });
      await admin.connect();
      try {
        await admin.query(`create schema if not exists "${schema}"`);
      } finally {
        await admin.end();
      }
      await runMigrations(pool);
    })();
    await ready;
    await emptyTables(pool, schema);
  });
  afterAll(() => pool.end());

  return { pool, url, schema };
}

export function withSearchPath(databaseUrl: string, schema: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

async function emptyTables(pool: pg.Pool, schema: string): Promise<void> {
  const { rows } = await pool.query<{ name: string }>(
    "select tablename as name from pg_tables where schemaname = $1 and tablename <> '__migrations'",
    [schema],
  );
  if (rows.length === 0) return;
  await pool.query(`truncate ${rows.map(({ name }) => `"${schema}"."${name}"`).join(", ")}`);
}
