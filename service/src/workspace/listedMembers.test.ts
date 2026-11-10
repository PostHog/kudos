// The daily users.list cron keeps the members Slack lists, apart from the directory, so the hype picker can offer a
// member Kudos hasn't met yet. Today's convex/slack/directory.ts's listSlackMembers and convex/workspace/listedMembers.ts
// have no Convex test of their own; these drive them through the cron, as the worker fires it.
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { rateLimitedFor } from "../../testing/fakeSlack.ts";
import { jobs } from "../db/schema/service.ts";
import { listSlackMembersJob } from "../slack/directory.ts";
import { listedMembersIn, unknownListedMembersIn } from "./listedMembers.ts";

const now = new Date("2026-10-13T04:20:00Z").getTime();
const backend = useTestBackend({ now });

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const listCron = "slack.directory.listSlackMembers";

describe("the daily users.list keeps the workspace's listed members", () => {
  test("a member Slack lists is kept with their display name; a bot, a deactivated person and a guest from another workspace aren't offered", async () => {
    const t = backend();
    t.slack
      .withMember("U_ANN", { profile: { display_name: "annie", real_name: "Ann Example" } })
      .withMember("U_BOB", { real_name: "Bob Example" })
      .withMember("B_HELPER", { is_bot: true })
      .withMember("U_GONE", { deleted: true })
      .withMember("U_GUEST", { team_id: "T_OTHER" });

    await t.time.runCron(listCron);

    expect(await listed(t)).toEqual([
      { user: "U_ANN", name: "annie" },
      { user: "U_BOB", name: "Bob Example" },
    ]);
  });

  test("a member the directory already knows isn't one Kudos hasn't met", async () => {
    const t = backend();
    t.slack.withMember("U_ANN", { name: "ann" }).withMember("U_BOB", { name: "bob" });
    await t.seed.insert("members", { workspace: "T1", user: "U_ANN", kind: "member", name: "ann", asOf: now - 60_000 });

    await t.time.runCron(listCron);

    expect(await t.query((ctx) => unknownListedMembersIn(ctx, "T1"))).toEqual([{ user: "U_BOB", name: "bob" }]);
  });

  test("the next day's list replaces what changed, and a member Slack now lists as deactivated is no longer offered", async () => {
    const t = backend();
    t.slack.withMember("U_ANN", { name: "ann" }).withMember("U_BOB", { name: "bob" });
    await t.time.runCron(listCron);

    t.slack.withMember("U_ANN", { name: "annie" }).withMember("U_BOB", { name: "bob", deleted: true });
    await t.time.advance(24 * 60 * 60_000);
    await t.time.runCron(listCron);

    expect(await listed(t)).toEqual([{ user: "U_ANN", name: "annie" }]);
    expect(await t.seed.all("listedMembers")).toHaveLength(2);
  });

  test("every page of the list is kept, following Slack's cursor", async () => {
    const t = backend();
    t.slack.answering(
      "users.list",
      () => Response.json({ ok: true, members: [{ id: "U_ANN", team_id: "T1", name: "ann" }], response_metadata: { next_cursor: "page-2" } }),
      () => Response.json({ ok: true, members: [{ id: "U_BOB", team_id: "T1", name: "bob" }], response_metadata: { next_cursor: "" } }),
    );

    await t.time.runCron(listCron);

    expect(await listed(t)).toEqual([
      { user: "U_ANN", name: "ann" },
      { user: "U_BOB", name: "bob" },
    ]);
    expect(t.slack.callsTo("users.list").map(({ cursor }) => cursor ?? "")).toEqual(["", "page-2"]);
  });

  test("a page listed twice, as recovery starts the run again from its cursor, keeps each member once", async () => {
    const t = backend();
    const firstPage = () => Response.json({ ok: true, members: [{ id: "U_ANN", team_id: "T1", name: "ann" }], response_metadata: { next_cursor: "page-2" } });
    const secondPage = () => Response.json({ ok: true, members: [{ id: "U_BOB", team_id: "T1", name: "bob" }], response_metadata: { next_cursor: "" } });
    t.slack.answering("users.list", firstPage, secondPage, secondPage);
    await t.time.runCron(listCron);

    await t.run((ctx) => ctx.jobs.enqueue(listSlackMembersJob, { cursor: "page-2" }));
    await t.settle();

    expect(await listed(t)).toEqual([
      { user: "U_ANN", name: "ann" },
      { user: "U_BOB", name: "bob" },
    ]);
    expect(await t.seed.all("listedMembers")).toHaveLength(2);
  });

  test("a rate-limited page is asked for again after Slack's Retry-After, from the same cursor", async () => {
    const t = backend();
    t.slack.withMember("U_BOB", { name: "bob" });
    t.slack.answering("users.list", () => Response.json({ ok: true, members: [{ id: "U_ANN", team_id: "T1", name: "ann" }], response_metadata: { next_cursor: "page-2" } }), rateLimitedFor(30));

    await t.time.runCron(listCron);
    expect(await listed(t)).toEqual([{ user: "U_ANN", name: "ann" }]);

    await t.time.advance(30_000);
    await t.settle();

    expect(await listed(t)).toEqual([
      { user: "U_ANN", name: "ann" },
      { user: "U_BOB", name: "bob" },
    ]);
    expect(t.slack.callsTo("users.list").map(({ cursor }) => cursor ?? "")).toEqual(["", "page-2", "page-2"]);
  });

  test("a refusal fails the run without quoting Slack's answer", async () => {
    const t = backend();
    t.slack.answering("users.list", () => Response.json({ ok: false, error: "dave.example" }));

    await t.time.runCron(listCron);

    const failed = await t.query(({ tx }) => tx.select({ error: jobs.error }).from(jobs).where(and(eq(jobs.name, listCron), eq(jobs.state, "failed"))));
    expect(failed).toEqual([{ error: "ReportableError: Slack users.list failed: an unexpected error" }]);
    expect(await listed(t)).toEqual([]);
  });
});

function listed(t: TestBackend) {
  return t.query((ctx) => listedMembersIn(ctx, "T1"));
}
