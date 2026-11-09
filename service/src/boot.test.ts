import { fileURLToPath } from "node:url";
import pg from "pg";
import { describe, expect, inject, onTestFinished, test } from "vitest";
import { runMigrations } from "./db/migrate.ts";
import { useTestDatabase, withSearchPath } from "../testing/database.ts";
import { startServiceProcess, type ServiceProcess } from "../testing/serviceProcess.ts";

const database = useTestDatabase();

async function start(env: Record<string, string>): Promise<ServiceProcess> {
  const service = await startServiceProcess({ HEDGEHUG_COMMIT: "feedc0de", ...env });
  onTestFinished(() => service.signal("SIGKILL"));
  return service;
}

const get = async (service: ServiceProcess, path: string) => fetch(`${service.url}${path}`);

describe("booting", () => {
  test("without DATABASE_URL the service listens, answers /healthz and 503s the rest", async () => {
    const service = await start({});

    const health = await get(service, "/healthz");
    expect(await health.json(), "health answers with the commit and no database").toEqual({
      commit: "feedc0de",
      migrations: "no-database",
      off: false,
    });
    expect((await get(service, "/")).status, "an app route without a database").toBe(503);
  });

  test("with a database it migrates after it listens, then opens the app routes", async () => {
    const service = await start({ DATABASE_URL: database.url });

    await service.waitFor((line) => line.message === "migrations done");
    expect(await (await get(service, "/healthz")).json(), "health after the migrations").toMatchObject({ migrations: "done" });
    expect((await get(service, "/nowhere")).status, "an unknown route once migrated").toBe(404);
    const messages = service.lines().map((line) => line.message);
    expect(messages.indexOf("listening"), "it listens before it migrates").toBeLessThan(messages.indexOf("migrations done"));
  });

  test("while the database can't be reached it keeps answering /healthz, 503s the rest and retries", async () => {
    const service = await start({ DATABASE_URL: "postgres://nobody:nothing@127.0.0.1:9/none" });

    await service.waitFor((line) => line.message === "migrations failed, retrying");
    expect(await (await get(service, "/healthz")).json(), "health while the database is down").toMatchObject({ migrations: "pending" });
    expect((await get(service, "/")).status, "an app route while the database is down").toBe(503);
  });

  test("HEDGEHUG_OFF answers Slack with 200 and the website with 503", async () => {
    const service = await start({ DATABASE_URL: database.url, HEDGEHUG_OFF: "1" });
    await service.waitFor((line) => line.message === "migrations done");

    expect((await fetch(`${service.url}/slack/events`, { method: "POST", body: "{}" })).status, "Slack while off").toBe(200);
    expect((await get(service, "/")).status, "the website while off").toBe(503);
  });

  test("SIGTERM stops the service cleanly", async () => {
    const service = await start({ DATABASE_URL: database.url });
    await service.waitFor((line) => line.message === "migrations done");

    service.signal("SIGTERM");

    expect(await service.exited, "exit code after SIGTERM").toBe(0);
  });
});

describe("migrations", () => {
  const fixture = fileURLToPath(new URL("../testing/fixtures/migrations", import.meta.url));

  test("two copies migrating one database at once run each migration once", async () => {
    const schema = `${database.schema}_overlap`;
    const admin = new pg.Client({ connectionString: inject("databaseUrl") });
    await admin.connect();
    await admin.query(`drop schema if exists "${schema}" cascade; create schema "${schema}"`);
    onTestFinished(async () => {
      await admin.query(`drop schema if exists "${schema}" cascade`);
      await admin.end();
    });
    const copies = [0, 1].map(() => new pg.Pool({ connectionString: withSearchPath(inject("databaseUrl"), schema), max: 2 }));
    onTestFinished(async () => {
      await Promise.all(copies.map((pool) => pool.end()));
    });

    await Promise.all(copies.map((pool) => runMigrations(pool, fixture)));

    const { rows } = await admin.query(`select "_id" from "${schema}".fixture`);
    expect(rows, "the fixture migration's insert ran once").toEqual([{ _id: "only-once" }]);
  });
});
