import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterEach, expect, test } from "vitest";
import { startPostgres } from "./embeddedPostgres.ts";

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

test("a throwaway Postgres 18 starts in the folder it is given, answers on its URL, and leaves nothing behind once stopped", async () => {
  const folder = await mkdtemp(join(tmpdir(), "hedgehug-pg-test-"));
  folders.push(folder);
  const dir = join(folder, "data");

  const postgres = await startPostgres({ dir });
  const client = new pg.Client({ connectionString: postgres.url });
  await client.connect();
  const { rows } = await client.query<{ version: string }>("select current_setting('server_version_num') as version");
  await client.end();
  await postgres.stop();

  expect(Math.floor(Number(rows[0]?.version) / 10_000), "the server's major version").toBe(18);
  expect(existsSync(dir), "its data folder after stop").toBe(false);
  await expect(new pg.Client({ connectionString: postgres.url, connectionTimeoutMillis: 2_000 }).connect(), "a connection after stop").rejects.toThrow();
});

test("a Postgres that died on its own still stops at once, and its folder goes", async () => {
  const folder = await mkdtemp(join(tmpdir(), "hedgehug-pg-test-"));
  folders.push(folder);
  const dir = join(folder, "data");
  const postgres = await startPostgres({ dir });
  const server = Number(readFileSync(join(dir, "postmaster.pid"), "utf8").split("\n")[0]);

  process.kill(server, "SIGKILL");
  while (alive(server)) await new Promise((resolve) => setTimeout(resolve, 20));
  const stopped = await Promise.race([postgres.stop().then(() => "stopped"), new Promise((resolve) => setTimeout(() => resolve("still stopping"), 5_000))]);

  expect(stopped).toBe("stopped");
  expect(existsSync(dir), "its data folder after stop").toBe(false);
});

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
