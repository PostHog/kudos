import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { routedFetch, type FakePostHog, type FlagDefinition } from "../../testing/fakePostHog";
import { FakeSlack } from "../../testing/fakeSlack";
import { flagsFromPostHog, offForEveryone, onForEveryone, postHogDeciding, unlocksShippedBeforeAnyoneJoined } from "../../testing/flags";
import { signedRequest, signingSecret } from "../../testing/signedSlack";
import { settle, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, messageEvent, section } from "../../testing/slackMessages";
import { replyPrivately, type Given } from "../feedback/replies";

const now = new Date("2026-10-13T10:00:00Z");
const xpLevels = "xp-levels";
const ref = { workspace: "T1", conversation: "C1", message: "1760349600.000100" };
const givenToBob: Given = { recipients: [{ user: "U_BOB", kudos: 1 }], left: 9, skipped: [], awards: [{ kudos: 1 }] };

let slack: FakeSlack;
let postHog: FakePostHog;
let sentMessages = 0;

beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  slack = new FakeSlack().withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL");
  sentMessages = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SW1 SW2: the gains line says what a kudos earned its giver", () => {
  test("a kudos to two people posts +20 XP as its extras line, the sum of the giver's effects records for the message", async () => {
    const t = await workspaceDeciding(onForEveryone(xpLevels));

    await giveKudos(t, "U_ALICE", ["U_BOB", "U_CAROL"]);

    expect(successRepliesTo("U_ALICE")).toEqual([["<@U_BOB> and <@U_CAROL> got 1 kudos from you. You have 8 kudos left today.", "+20 XP"]]);
    expect(await giverXpRecordedFor(t, "U_ALICE")).toBe(20);
  });

  test("R38: the gains line is the reply's last line, after the skipped mentions", async () => {
    const t = await workspaceDeciding(onForEveryone(xpLevels));

    await giveKudos(t, "U_ALICE", ["U_ALICE", "U_BOB"]);

    expect(successRepliesTo("U_ALICE")).toEqual([["<@U_BOB> got 1 kudos from you. You have 9 kudos left today.", "I skipped <@U_ALICE>: you can't give kudos to yourself.", "+10 XP"]]);
  });
});

describe("SW5 SW8: the gains line shows only what its giver can see when Slack takes the reply", () => {
  test("with xp-levels off and no quest done, the ephemeral Slack is asked to post is byte-for-byte today's", async () => {
    const t = await workspaceDeciding(offForEveryone(xpLevels));

    await giveKudos(t, "U_ALICE", ["U_BOB", "U_CAROL"]);

    expect(slack.callsTo("chat.postEphemeral")).toEqual([{ channel: "C1", user: "U_ALICE", text: "<@U_BOB> and <@U_CAROL> got 1 kudos from you. You have 8 kudos left today." }]);
  });

  test("a reply held for Quests whose giver's xp-levels turns off before its release goes out with no XP part", async () => {
    const t = await unlocksShippedBeforeAnyoneJoined(await workspaceDeciding(onForEveryone(xpLevels), onForEveryone("unlocks"), onForEveryone("quests")));
    await memberInserted(t, "U_ALICE");
    await t.run((ctx) => replyPrivately(ctx, ref, undefined, "U_ALICE", { kind: "given", outcome: givenToBob, base: 10 }));

    await flagsFromPostHog(t, postHog, offForEveryone(xpLevels), onForEveryone("unlocks"), onForEveryone("quests"));
    vi.advanceTimersByTime(10_000);
    await settle(t);

    expect(successRepliesTo("U_ALICE")).toEqual([["<@U_BOB> got 1 kudos from you. You have 9 kudos left today."]]);
  });
});

describe("O36: xp-levels exposure", () => {
  test("the mutation that writes the reply sends the giver's xp-levels exposure, with the value it read", async () => {
    const t = await workspaceDeciding(onForEveryone(xpLevels));
    const alice = await memberInserted(t, "U_ALICE");

    await t.run((ctx) => replyPrivately(ctx, ref, undefined, "U_ALICE", { kind: "given", outcome: givenToBob, base: 10 }));

    expect(await xpLevelsExposuresIn(t)).toEqual([{ member: alice, value: true }]);
  });
});

async function workspaceDeciding(...definitions: FlagDefinition[]) {
  postHog = postHogDeciding("sandbox");
  vi.stubGlobal("fetch", routedFetch(postHog, slack.fetch));
  const t = testBackend();
  await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 10 }));
  return flagsFromPostHog(t, postHog, ...definitions);
}

function memberInserted(t: Backend, user: string) {
  return t.run((ctx) => ctx.db.insert("members", { workspace: "T1", user, kind: "member" }));
}

function xpLevelsExposuresIn(t: Backend) {
  return t.run(async (ctx) => (await ctx.db.query("flagExposures").collect()).filter(({ flag }) => flag === xpLevels).map(({ member, value }) => ({ member, value })));
}

async function giveKudos(t: Backend, giver: string, recipients: string[]) {
  sentMessages += 1;
  const blocks = [section(...recipients.map((recipient) => mention(recipient)), emoji("taco"))];
  await t.fetch("/slack/events", await signedRequest(messageEvent(blocks, { user: giver, ts: `${now.getTime() / 1000 + sentMessages}.000100` })));
  await settle(t);
}

function successRepliesTo(user: string) {
  return slack.ephemeralsTo(user).map(({ text }) => String(text).split("\n"));
}

async function giverXpRecordedFor(t: Backend, user: string) {
  return t.run(async (ctx) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("workspace", "T1").eq("user", user))
      .unique();
    const records = await ctx.db
      .query("effectsRecords")
      .withIndex("by_member_side", (q) => q.eq("member", member!._id).eq("side", "giver"))
      .collect();
    return records.reduce((sum, { baseXp }) => sum + baseXp, 0);
  });
}
