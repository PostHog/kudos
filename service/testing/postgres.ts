// Vitest global setup for the service's tests: starts a throwaway Postgres 18 for the run, or uses
// `TEST_DATABASE_URL` when one is given, and hands its URL to every worker.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const given = process.env.TEST_DATABASE_URL;
  if (given) {
    project.provide("databaseUrl", given);
    return async () => {};
  }

  const dir = await mkdtemp(join(tmpdir(), "hedgehug-pg-"));
  const port = await freePort();
  const postgres = new EmbeddedPostgres({
    databaseDir: dir,
    port,
    user: "hedgehug",
    password: "hedgehug",
    persistent: false,
    onLog: () => {},
    // A test database: durability buys nothing, and every test empties its tables anyway.
    postgresFlags: ["-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off", "-c", "max_connections=200"],
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("hedgehug_test");
  project.provide("databaseUrl", `postgres://hedgehug:hedgehug@127.0.0.1:${port}/hedgehug_test`);

  return async () => {
    await postgres.stop();
    await rm(dir, { recursive: true, force: true });
  };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}
