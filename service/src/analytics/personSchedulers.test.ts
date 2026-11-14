// What the user group sync asks of analytics when a group's members or handle change: the people whose groups changed
// are followed, 200 to a job, while capture is on, and a renamed handle asks for one catch-up. The jobs' bodies are
// S14's, so these tests read the jobs the scheduling left behind.
import { asc } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { decodeStored } from "../db/codec.ts";
import { jobs } from "../db/schema/service.ts";
import { followPeopleLater, requestCatchUp } from "./person.ts";

const backend = useTestBackend();
type Backend = ReturnType<typeof backend>;

afterEach(() => {
  vi.unstubAllEnvs();
});

function captureOn() {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test_project_token");
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
}

function captureOff() {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
}

async function queued(t: Backend) {
  const rows = await t.query((ctx) => ctx.tx.select({ name: jobs.name, args: jobs.args, state: jobs.state }).from(jobs).orderBy(asc(jobs._creationTime), asc(jobs._id)));
  return rows.map(({ name, args, state }) => ({ name, args: decodeStored(args), state }));
}

describe("following people whose user groups changed", () => {
  test("while capture is on, they are followed 200 to a job", async () => {
    captureOn();
    const t = backend();
    const users = Array.from({ length: 401 }, (_, index) => `U_${index}`);

    await t.run((ctx) => followPeopleLater(ctx, "T1", users));

    expect(await queued(t)).toEqual([
      { name: "analytics.person.followPeople", args: { workspace: "T1", users: users.slice(0, 200) }, state: "pending" },
      { name: "analytics.person.followPeople", args: { workspace: "T1", users: users.slice(200, 400) }, state: "pending" },
      { name: "analytics.person.followPeople", args: { workspace: "T1", users: users.slice(400) }, state: "pending" },
    ]);
  });

  test("while capture is off, nobody is followed", async () => {
    captureOff();
    const t = backend();

    await t.run((ctx) => followPeopleLater(ctx, "T1", ["U_ANN"]));

    expect(await queued(t)).toEqual([]);
  });

  test("nobody to follow queues nothing", async () => {
    captureOn();
    const t = backend();

    await t.run((ctx) => followPeopleLater(ctx, "T1", []));

    expect(await queued(t)).toEqual([]);
  });
});

describe("a catch-up", () => {
  test("is asked for once per request, whether capture is on or off", async () => {
    captureOff();
    const t = backend();

    await t.run((ctx) => requestCatchUp(ctx));

    expect(await queued(t)).toEqual([{ name: "analytics.person.catchUp", args: {}, state: "pending" }]);
  });
});
