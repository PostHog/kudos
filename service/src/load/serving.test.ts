import pg from "pg";
import { describe, expect, inject, onTestFinished, test } from "vitest";
import { useTestDatabase, withSearchPath } from "../../testing/database.ts";
import { startServiceProcess } from "../../testing/serviceProcess.ts";

const database = useTestDatabase();

describe("the service as the image runs it", () => {
  test("with HEDGEHUG_ADMIN_TOKEN set it holds the app routes and answers the admin path with the token only", async () => {
    const service = await startServiceProcess({ DATABASE_URL: database.url, HEDGEHUG_ADMIN_TOKEN: "a-load-token" });
    onTestFinished(() => service.signal("SIGKILL"));
    await service.waitFor((line) => line.message === "migrations done");

    const progress = await fetch(`${service.url}/admin/load`, { headers: { "x-hedgehug-admin-token": "a-load-token" } });
    expect(await progress.json(), "the admin path answers its progress").toMatchObject({ phase: "none", stagedChunks: 0 });
    expect((await fetch(`${service.url}/admin/load`)).status, "the admin path without its token").toBe(401);
    expect((await fetch(`${service.url}/slack/events`, { method: "POST", body: "{}" })).status, "Slack waits for the data").toBe(503);
    expect((await fetch(`${service.url}/healthz`)).status, "health answers").toBe(200);
  });

  test("while its migrations can't finish, a database no load has reached keeps HEDGEHUG_OFF's acknowledgement", async () => {
    // A table in the first migration's way keeps the migrations failing, before any load table exists.
    const schema = `serving_stuck_${process.env.VITEST_POOL_ID ?? "0"}`;
    const admin = new pg.Client({ connectionString: inject("databaseUrl") });
    await admin.connect();
    await admin.query(`drop schema if exists "${schema}" cascade; create schema "${schema}"; create table "${schema}"."bookBatches" (x int)`);
    await admin.end();
    const service = await startServiceProcess({ DATABASE_URL: withSearchPath(inject("databaseUrl"), schema), HEDGEHUG_OFF: "1" });
    onTestFinished(() => service.signal("SIGKILL"));
    await service.waitFor((line) => line.message === "migrations failed, retrying");

    expect((await fetch(`${service.url}/slack/events`, { method: "POST", body: "{}" })).status, "Slack while off and migrating").toBe(200);
  });
});
