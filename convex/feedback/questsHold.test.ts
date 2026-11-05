import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeSlack } from "../../testing/fakeSlack";
import { flagsLoaded, flagsOnForEveryone } from "../../testing/flags";
import { signedRequest, signingSecret } from "../../testing/signedSlack";
import { settle, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, messageEvent, section, text } from "../../testing/slackMessages";
import { replyPrivately } from "./replies";

const now = new Date("2026-10-13T10:00:00Z");
const saysWhy = "thanks for untangling the release notes today";

let slack: FakeSlack;

beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  slack = new FakeSlack().withMember("U_ALICE").withMember("U_BOB");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("P71 R36: a success reply held for Quests is never lost", () => {
  test("off the Monday path, the kudos' own request schedules the success reply's delivery", async () => {
    flagsOnForEveryone(slack.fetch, "xp-levels");
    const t = await workspace();
    await sendKudos(t, "U_ALICE", "U_BOB", 1);
    await settle(t);

    await sendKudos(t, "U_ALICE", "U_BOB", 2);

    expect(await pendingDeliveries(t)).toEqual(["slack/delivery:deliverPrivateReply"]);
  });

  test("on the Monday path, a success reply held for Quests that nobody releases goes out 10 seconds later with its XP and no quest", async () => {
    flagsOnForEveryone(slack.fetch, "xp-levels", "monday-quest");
    const t = await workspace();
    const ref = { workspace: "T1", conversation: "C1", message: "1760349600.000100" };
    const given = { recipients: [{ user: "U_BOB", kudos: 1 }], left: 9, skipped: [] };
    await t.run((ctx) => ctx.db.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member" }));

    await t.run((ctx) => replyPrivately(ctx, ref, undefined, "U_ALICE", { kind: "given", outcome: given, base: 10 }));
    vi.advanceTimersByTime(9_999);
    await t.finishInProgressScheduledFunctions();
    expect(slack.ephemeralsTo("U_ALICE"), "the replies before 10 seconds").toEqual([]);
    await settle(t);

    expect(slack.ephemeralsTo("U_ALICE").map(({ text }) => String(text).split("\n"))).toEqual([["<@U_BOB> got 1 kudos from you. You have 9 kudos left today.", "+10 XP"]]);
  });
});

async function workspace() {
  const t = await flagsLoaded(testBackend());
  await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 10 }));
  return t;
}

async function sendKudos(t: Backend, giver: string, recipient: string, sent: number) {
  const blocks = [section(mention(recipient), text(` ${saysWhy} `), emoji("taco"))];
  await t.fetch("/slack/events", await signedRequest(messageEvent(blocks, { user: giver, ts: `${Math.floor(now.getTime() / 1000) + sent}.000100` })));
}

async function pendingDeliveries(t: Backend) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter(({ name, state }) => name.startsWith("slack/delivery:deliverPrivate") && state.kind === "pending").map(({ name }) => name);
}
