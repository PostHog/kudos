import { expect, test } from "vitest";
import { useTestDatabase } from "./database.ts";

const database = useTestDatabase();

test("the service's tests run on Postgres 18, in this worker's own schema", async () => {
  const { rows } = await database.pool.query<{ version: string; schema: string }>(
    "select current_setting('server_version_num') as version, current_schema() as schema",
  );

  expect(Math.floor(Number(rows[0]?.version) / 10_000), "the server's major version").toBe(18);
  expect(rows[0]?.schema, "the connection's schema").toBe(database.schema);
});
