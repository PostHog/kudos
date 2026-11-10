// 13.3's own steps beyond today's tests: an emoji_changed event the front door can't place, the daily cron's sync, and a
// sync that can't learn whose token it holds. Today's sync tests are ported beside this file (customEmoji.test.ts).
import { describe, expect, test } from "vitest";
import { toDocument } from "../db/documents.ts";
import { jobs } from "../db/schema/service.ts";
import { slackReceipts } from "../db/schema/slack.ts";
import type { TestBackend } from "../../testing/backend.ts";
import { slackError } from "../../testing/fakeSlack.ts";
import { emojiChangedEvent } from "../../testing/slackMessages.ts";
import { syncCustomEmoji } from "./customEmoji.ts";
import { moveTo, useHugsBackend } from "./hugsTesting.ts";

const backend = useHugsBackend(new Date("2026-10-14T10:00:00Z"));
const tacoPng = "https://emoji.slack-edge.com/T1/taco/7a8b9c.png";

const receipts = (t: TestBackend) => t.query(({ tx }) => tx.select({ eventId: slackReceipts.eventId }).from(slackReceipts));

async function jobRows(t: TestBackend) {
  const rows = await t.query(({ tx }) => tx.select().from(jobs));
  return rows.map((row) => toDocument<{ name: string; state: string; error?: string | null }>(jobs, row)).map(({ name, state, error }) => ({ name, state, error }));
}

describe("an emoji_changed event", () => {
  test("that names no workspace is ignored: it keeps no receipt, and no listing follows", async () => {
    const t = backend();

    const answer = await t.send("/events", emojiChangedEvent({ subtype: "add", name: "taco", value: tacoPng }, { team: "", eventId: "Ev1" }));
    moveTo(t, t.clock.now() + 60_000);
    await t.settle();

    expect(answer.status).toBe(200);
    expect(await receipts(t)).toEqual([]);
    expect(t.slack.callsTo("emoji.list")).toEqual([]);
  });
});

describe("the custom emoji sync", () => {
  test("runs daily as the cron slack.customEmoji.syncCustomEmoji", async () => {
    const t = backend();
    t.slack.answering("auth.test", slackError("invalid_auth"));

    const answer = await t.time.runCron("slack.customEmoji.syncCustomEmoji");

    expect(answer?.ran).toEqual(["slack.customEmoji.syncCustomEmoji"]);
    expect(await jobRows(t)).toEqual([{ name: "slack.customEmoji.syncCustomEmoji", state: "failed", error: "ReportableError: Slack auth.test failed: invalid_auth" }]);
  });

  test("that can't learn whose token it holds fails, reporting why, before it lists any emoji", async () => {
    const t = backend();
    t.slack.withCustomEmoji("taco", tacoPng).answering("auth.test", slackError("invalid_auth"));

    const sync = t.operations.action("slack.customEmoji.syncCustomEmoji", (ctx) => syncCustomEmoji(ctx, {}));

    await expect(sync).rejects.toThrow("Slack auth.test failed: invalid_auth");
    expect(t.slack.callsTo("emoji.list")).toEqual([]);
  });
});
