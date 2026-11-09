import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

export const migrationsFolder = fileURLToPath(new URL("../../migrations", import.meta.url));

/**
 * Brings the schema the pool's connections use up to date with the migrations folder.
 * Two copies booting at once (the host overlaps them on each deploy) take turns on an advisory lock keyed by the schema,
 * so each migration runs once and the second copy finds nothing left to do.
 */
export async function runMigrations(pool: Pool, folder = migrationsFolder): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ schema: string }>("select current_schema() as schema");
    const schema = rows[0]?.schema;
    if (!schema) throw new Error("The connection has no current schema to migrate");
    const lock = lockKey(schema);
    await client.query("select pg_advisory_lock($1::bigint)", [lock]);
    try {
      await migrate(drizzle({ client }), { migrationsFolder: folder, migrationsSchema: schema, migrationsTable: "__migrations" });
    } finally {
      await client.query("select pg_advisory_unlock($1::bigint)", [lock]);
    }
  } finally {
    client.release();
  }
}

function lockKey(schema: string): string {
  return createHash("sha256").update(`hedgehug migrations ${schema}`).digest().readBigInt64BE(0).toString();
}
