// Vitest global setup for the service's tests: starts a throwaway Postgres 18 for the run, or uses
// `TEST_DATABASE_URL` when one is given, and hands its URL to every worker.
import type { TestProject } from "vitest/node";
import { startPostgres } from "./embeddedPostgres.ts";

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

  const postgres = await startPostgres();
  project.provide("databaseUrl", postgres.url);
  return postgres.stop;
}
