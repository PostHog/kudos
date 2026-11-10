// Convex's `.unique()`: at most one row, or the error Convex throws, word for word, so the analytics boundary reports
// it as Convex's own refusal, as it does today (`analytics/exceptions.ts`). Select with `.limit(2)` and pass the rows.
export function unique<Row>(table: string, rows: readonly Row[]): Row | null {
  if (rows.length > 1) throw new Error(`unique() query returned more than one result from table ${table}:`);
  return rows[0] ?? null;
}
