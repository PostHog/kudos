// A throwaway Postgres 18 on a free port, for the service's tests and the E2E suite's rewrite target.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import EmbeddedPostgres from "embedded-postgres";

export interface ThrowawayPostgres {
  url: string;
  /** Stops the server and removes its data folder. */
  stop(): Promise<void>;
}

/** Starts Postgres in `dir`, a folder of its own under the system's temporary folder unless given. */
export async function startPostgres({ dir }: { dir?: string } = {}): Promise<ThrowawayPostgres> {
  const dataDir = dir ?? (await mkdtemp(join(tmpdir(), "hedgehug-pg-")));
  const port = await freePort();
  const postgres = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: "hedgehug",
    password: "hedgehug",
    persistent: false,
    onLog: () => {},
    // A test database: durability buys nothing, and every test empties its tables anyway.
    postgresFlags: ["-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off", "-c", "max_connections=200"],
  });
  const stop = async () => {
    try {
      await serverStopped(postgres);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  };
  try {
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase("hedgehug_test");
  } catch (error) {
    await stop();
    throw error;
  }
  return { url: `postgres://hedgehug:hedgehug@127.0.0.1:${port}/hedgehug_test`, stop };
}

// `stop()` of embedded-postgres waits for an exit its server may already have made, when it died on its own or never
// got ready, and then waits forever. So the server is only asked to stop while it runs, and killed if it lingers.
async function serverStopped(postgres: EmbeddedPostgres, graceMs = 10_000) {
  const holder = postgres as unknown as { process?: ChildProcess };
  const server = holder.process;
  if (server === undefined || server.exitCode !== null || server.signalCode !== null) {
    holder.process = undefined;
    return;
  }
  const exited = once(server, "exit");
  const force = setTimeout(() => server.kill("SIGKILL"), graceMs);
  try {
    await Promise.all([postgres.stop().catch(() => {}), exited]);
  } finally {
    clearTimeout(force);
  }
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
