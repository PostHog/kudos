import pg from "pg";

// jsonb and json arrive as their text, for the value codec to decode: JSON.parse would turn the stored `null` into
// SQL NULL's null and lose the difference between a null field and a missing one. Drizzle hands pg's global parsers
// to every query and ignores a pool's own, so the parsers are set globally, once, when this module loads.
// int8 already arrives as text, which Drizzle's bigint mode reads.
const rawText = (text: string) => text;
pg.types.setTypeParser(pg.types.builtins.JSONB, rawText);
pg.types.setTypeParser(pg.types.builtins.JSON, rawText);

/** The service's connection pool. A connection that takes longer than `connectTimeoutMs`, handshake included, fails. */
export function createPool(connectionString: string, { max = 5, connectTimeoutMs = 10_000 }: { max?: number; connectTimeoutMs?: number } = {}): pg.Pool {
  return new pg.Pool({ connectionString, max, connectionTimeoutMillis: connectTimeoutMs });
}
