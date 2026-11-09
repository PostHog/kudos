import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, connect, type Server, type Socket } from "node:net";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { describe, expect, inject, onTestFinished, test } from "vitest";
import { boot } from "./boot.ts";
import { z } from "zod";
import { runMigrations } from "./db/migrate.ts";
import { actionJob, mutationJob } from "./jobs/define.ts";
import { createRegistry } from "./registration.ts";
import { errorFields, type Log, type LogFields } from "./log.ts";
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
    await service.waitFor((line) => line.message === "worker started");
    const messages = service.lines().map((line) => line.message);
    expect(messages.indexOf("listening"), "it listens before it migrates").toBeLessThan(messages.indexOf("migrations done"));
    expect(messages.indexOf("migrations done"), "the worker starts once the schema is current").toBeLessThan(messages.indexOf("worker started"));
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
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(service.lines().map((line) => line.message), "no worker, so no job and no cron runs").not.toContain("worker started");
  });

  test("the service's front door answers Slack's URL check, off or on, and refuses an unsigned event", async () => {
    const challenge = JSON.stringify({ type: "url_verification", challenge: "boot-challenge" });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = `v0=${createHmac("sha256", "boot-secret").update(`v0:${timestamp}:${challenge}`).digest("hex")}`;
    const signed = { method: "POST", headers: { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature }, body: challenge };
    for (const off of ["0", "1"]) {
      const service = await start({ DATABASE_URL: database.url, SLACK_SIGNING_SECRET: "boot-secret", HEDGEHUG_OFF: off });
      await service.waitFor((line) => line.message === "migrations done");

      expect(await (await fetch(`${service.url}/slack/events`, signed)).json(), `HEDGEHUG_OFF=${off}`).toEqual({ challenge: "boot-challenge" });
      expect((await fetch(`${service.url}/slack/events`, { method: "POST", body: challenge })).status, `unsigned, HEDGEHUG_OFF=${off}`).toBe(401);
      service.signal("SIGKILL");
    }
  });

  test("/testing/time exists only with HEDGEHUG_TEST_SECRET", async () => {
    const advance = (service: ServiceProcess) =>
      fetch(`${service.url}/testing/time`, { method: "POST", headers: { "x-hedgehug-test-secret": "s3cret" }, body: JSON.stringify({ advance: 1_000 }) });
    const without = await start({ DATABASE_URL: database.url });
    const withSecret = await start({ DATABASE_URL: database.url, HEDGEHUG_TEST_SECRET: "s3cret" });
    await Promise.all([without, withSecret].map((service) => service.waitFor((line) => line.message === "migrations done")));

    expect((await advance(without)).status, "without the env").toBe(404);
    const answer = await advance(withSecret);
    expect(answer.status, "with the env and its secret").toBe(200);
    expect(await answer.json()).toMatchObject({ ran: [] });
  });

  test("SIGTERM stops the service cleanly", async () => {
    const service = await start({ DATABASE_URL: database.url });
    await service.waitFor((line) => line.message === "migrations done");

    service.signal("SIGTERM");

    expect(await service.exited, "exit code after SIGTERM").toBe(0);
  });
});

describe("the worker in the service", () => {
  const record = mutationJob("website.clock.tick", z.object({}), async () => {});

  test("runs the jobs the service registered; /testing/time settles them and names what ran", async () => {
    const service = await boot({
      env: { PORT: "0", DATABASE_URL: database.url, HEDGEHUG_TEST_SECRET: "s3cret" },
      log: captureLog().log,
      registry: createRegistry({ test: { jobs: [record] } }),
      pollMs: 3_600_000, // only /testing/time runs jobs here, so what it answers is all that ran
    });
    onTestFinished(() => service.stop());
    await service.migrated;
    const time = (body: unknown) =>
      fetch(`http://127.0.0.1:${service.port}/testing/time`, { method: "POST", headers: { "x-hedgehug-test-secret": "s3cret" }, body: JSON.stringify(body) });

    await service.operations!.mutation("schedule", ({ jobs }) => jobs.enqueue(record, {}, { after: 60_000 }));
    expect(await (await time({ settle: true })).json(), "not due yet").toMatchObject({ ran: [] });
    await time({ advance: 60_000 });
    expect(await (await time({ settle: true })).json()).toMatchObject({ ran: ["website.clock.tick"] });
    expect(await (await time({ runCron: "website.clock.tick" })).json()).toMatchObject({ ran: ["website.clock.tick"] });
  });

  test("while a load holds, no cron is written and no due job runs", async () => {
    let runs = 0;
    const counted = mutationJob("website.clock.tick", z.object({}), async () => {
      runs += 1;
    });
    // A token set and no load started yet: the copy holds until its data arrives.
    const service = await boot({
      env: { PORT: "0", DATABASE_URL: database.url, HEDGEHUG_ADMIN_TOKEN: "a-load-token" },
      log: captureLog().log,
      registry: createRegistry({ test: { jobs: [counted] } }),
      pollMs: 20,
    });
    onTestFinished(() => service.stop());
    await service.migrated;
    await database.pool.query(
      `insert into jobs ("_id", "_creationTime", name, args, "runAt", kind, state) values ('due', 1, 'website.clock.tick', '{}', 0, 'mutation', 'pending')`,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect((await database.pool.query("select * from crons")).rows, "no cron written").toEqual([]);
    expect((await database.pool.query("select state from jobs")).rows, "the due job waits").toEqual([{ state: "pending" }]);
    expect(runs).toBe(0);
  });

  test("while a load holds, Slack answers 503 even with HEDGEHUG_OFF", async () => {
    const service = await boot({ env: { PORT: "0", DATABASE_URL: database.url, HEDGEHUG_ADMIN_TOKEN: "a-load-token", HEDGEHUG_OFF: "1" }, log: captureLog().log });
    onTestFinished(() => service.stop());
    await service.migrated;

    expect((await fetch(`http://127.0.0.1:${service.port}/slack/events`, { method: "POST", body: "{}" })).status).toBe(503);
  });

  test("stop takes no new job and lets a running one finish before the connections close", async () => {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    let reached!: () => void;
    const arrived = new Promise<void>((resolve) => (reached = resolve));
    const send = actionJob("slack.delivery.send", z.object({}), async ({ run }) => {
      reached();
      await opened;
      await run.query("still connected", async () => {});
    });
    const { log, lines } = captureLog();
    const service = await boot({ env: { PORT: "0", DATABASE_URL: database.url }, log, registry: createRegistry({ test: { jobs: [send] } }), jobGraceMs: 5_000, pollMs: 20 });
    await service.migrated;
    await service.operations!.mutation("schedule", ({ jobs }) => jobs.enqueue(send, {}));
    await arrived;

    const stopped = service.stop();
    open();
    await stopped;

    expect(lines.filter((line) => line.message === "job"), "the job finished, its query on an open connection").toEqual([
      { message: "job", name: "slack.delivery.send", outcome: "success", durationMs: expect.any(Number) },
    ]);
  });
});

describe("a database that accepts connections but never answers", () => {
  test("each attempt times out and is retried, and the service comes up once the database answers", async () => {
    const real = new URL(database.url);
    // The first two connections hang after the TCP handshake; later ones reach the real database.
    let connections = 0;
    const proxy = await listenOn((client) => {
      connections += 1;
      if (connections <= 2) return;
      const upstream = connect(Number(real.port), real.hostname);
      client.pipe(upstream).pipe(client);
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
    });
    const { log, lines } = captureLog();
    const service = await boot({ env: { PORT: "0", DATABASE_URL: viaProxy(database.url, proxy) }, log, retryMs: 50, connectTimeoutMs: 300 });
    onTestFinished(() => service.stop());

    await service.migrated;

    const failures = lines.filter((line) => line.message === "migrations failed, retrying");
    expect(failures.length, "one failure per hung connection").toBe(2);
    expect(failures.map(({ code }) => code), "each named as a connect timeout").toEqual(["DB_CONNECT_TIMEOUT", "DB_CONNECT_TIMEOUT"]);
    expect(lines.at(-1)?.message, "then the migrations ran").toBe("migrations done");
  });

  test("stop returns while a connection still hangs", async () => {
    const proxy = await listenOn(() => {});
    const service = await boot({ env: { PORT: "0", DATABASE_URL: viaProxy(database.url, proxy) }, log: captureLog().log, connectTimeoutMs: 60_000, stopTimeoutMs: 200 });

    const started = performance.now();
    await service.stop();

    expect(performance.now() - started, "stop gives up on the hung connection").toBeLessThan(5_000);
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

  test("no migration names a schema, so it lands in whichever schema the connection's search_path names", () => {
    // Each test worker migrates its own schema through search_path, and production may use any schema. drizzle-kit
    // qualifies foreign keys and enums with "public"; a migration that did would reach past the worker's schema.
    const folder = fileURLToPath(new URL("../migrations", import.meta.url));
    const qualified = readdirSync(folder)
      .filter((name) => name.endsWith(".sql"))
      .filter((name) => /"public"\s*\./i.test(readFileSync(`${folder}/${name}`, "utf8")));

    expect(qualified).toEqual([]);
  });

  test("a failed migration is logged by its class and SQLSTATE, never by its SQL", async () => {
    const schema = `${database.schema}_failing`;
    const admin = new pg.Client({ connectionString: inject("databaseUrl") });
    await admin.connect();
    await admin.query(`drop schema if exists "${schema}" cascade; create schema "${schema}"`);
    const pool = new pg.Pool({ connectionString: withSearchPath(inject("databaseUrl"), schema), max: 1 });
    onTestFinished(async () => {
      await pool.end();
      await admin.query(`drop schema if exists "${schema}" cascade`);
      await admin.end();
    });

    const error = await runMigrations(pool, fileURLToPath(new URL("../testing/fixtures/failing-migration", import.meta.url))).catch((caught: unknown) => caught);

    expect(String((error as Error).message) + String((error as Error).cause), "the error itself quotes the SQL").toContain("hedgehug-fixture-literal");
    const fields = errorFields(error);
    expect(fields.code, "the SQLSTATE of an invalid integer").toBe("22P02");
    expect(JSON.stringify(fields), "the logged fields").not.toContain("hedgehug-fixture-literal");
  });
});

function captureLog(): { log: Log; lines: Array<{ message: string } & LogFields> } {
  const lines: Array<{ message: string } & LogFields> = [];
  const push = (message: string, fields: LogFields = {}) => lines.push({ message, ...fields });
  return { log: { info: push, error: push }, lines };
}

async function listenOn(onConnection: (socket: Socket) => void): Promise<Server> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    onConnection(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(
    () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  );
  return server;
}

function viaProxy(databaseUrl: string, proxy: Server): string {
  const url = new URL(databaseUrl);
  url.hostname = "127.0.0.1";
  url.port = String((proxy.address() as { port: number }).port);
  return url.toString();
}
