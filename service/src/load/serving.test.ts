import { describe, expect, onTestFinished, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
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
});
