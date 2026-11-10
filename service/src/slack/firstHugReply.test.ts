import { describe, expect } from "vitest";
import { networkFailure, rateLimitedFor, slackError, type ScriptedAnswer, type SlackUser } from "../../testing/fakeSlack.ts";
import type { TestBackend } from "../../testing/backend.ts";
import type { ReactionOptions } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { howToOf } from "../welcome/mondayWelcome.ts";
import { deliverFirstHugReply } from "./firstHugReply.ts";
import { flagsOn, hourMs, kudosMessage, reachedByAHug, react, setWorkspaceSettings, settle, slackTs, useHugsBackend, xpOf } from "./hugsTesting.ts";

const now = new Date("2026-10-13T10:00:00Z");
const alicesMessage = slackTs(now.getTime() - hourMs);
const alicesOtherMessage = slackTs(now.getTime() - 2 * hourMs);
const onboardingOn = ["hugs", "hidden-items", "onboarding"];
const toTheAuthor = (name: string) => `That was a hug: +1 XP for you and ${name}. Thank them in a message with :taco: to earn an item.`;
const toThePeopleThanked = "That was a hug: +1 XP for you and the people thanked. Thank them in a message with :taco: to earn an item.";

const backend = useHugsBackend(now);

describe("LP73: a member's first hug ever gets one first-hug reply", () => {
  waitsOn(reachedByAHug, "Bob's first hug on Alice's message tells only Bob, in its conversation and without a thread, what it did and how to earn an item", async () => {
    const t = await workspace(onboardingOn);

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

    expect(t.slack.callsTo("chat.postEphemeral")).toEqual([{ channel: "C1", user: "U_BOB", text: toTheAuthor("Alice") }]);
    expect(t.slack.callsTo("chat.postMessage")).toEqual([]);
  });

  waitsOn(reachedByAHug, "HH15: names a kudos as a message with the workspace's kudos emoji, and never asks to say why", async () => {
    const t = await workspace(onboardingOn);
    await setWorkspaceSettings(t, { kudosEmoji: "raised_hands" });

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: "raised_hands" });

    expect(t.slack.ephemeralsTo("U_BOB").map(({ text }) => text)).toEqual(["That was a hug: +1 XP for you and Alice. Thank them in a message with :raised_hands: to earn an item."]);
  });

  for (const [by, alice, named] of [
    ["their display name", { profile: { display_name: "Ally", real_name: "Alice Lee" } }, "Ally"],
    ["their real name without a display name", { profile: { display_name: "", real_name: "Alice Lee" } }, "Alice Lee"],
    ["the author with only a Slack handle", { name: "alice" }, "the author"],
  ] satisfies Array<[string, Partial<SlackUser>, string]>) {
    waitsOn(reachedByAHug, `names the author by ${by}`, async () => {
      const t = await workspace(onboardingOn);
      t.slack.withMember("U_ALICE", alice);

      await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

      expect(t.slack.ephemeralsTo("U_BOB").map(({ text }) => text)).toEqual([toTheAuthor(named)]);
    });
  }

  waitsOn(reachedByAHug, "Bob's first hug on a Given kudos message thanks the people thanked", async () => {
    const t = await workspace(onboardingOn);
    await kudosMessage(t, "U_ALICE", ["U_CAROL", "U_DANA"], alicesMessage);

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

    expect(t.slack.ephemeralsTo("U_BOB")).toEqual([{ channel: "C1", user: "U_BOB", text: toThePeopleThanked }]);
  });

  for (const [what, reactions] of [
    ["a second hug on another message", () => [{}, { ts: alicesOtherMessage }]],
    ["a redelivered reaction", (eventId) => [{ eventId }, { eventId }]],
    ["the reaction removed and added again", () => [{}, { type: "reaction_removed" }, {}]],
  ] satisfies Array<[string, (eventId: string) => ReactionOptions[]]>) {
    waitsOn(reachedByAHug, `${what} sends nothing more`, async () => {
      const t = await workspace(onboardingOn);

      for (const options of reactions("Ev-first-hug")) await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ...options });

      expect(t.slack.ephemeralsTo("U_BOB")).toHaveLength(1);
    });
  }

  waitsOn(reachedByAHug, "a member who hugged before onboarding was on for them gets none for their next hug", async () => {
    const t = await workspace(["hugs", "hidden-items"]);
    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts: alicesOtherMessage });
    await flagsOn(t, onboardingOn);

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

    expect(t.slack.callsTo("chat.postEphemeral")).toEqual([]);
  });

  waitsOn(reachedByAHug, "Alice, hugged, gets no reply: only the giver's first hug answers", async () => {
    const t = await workspace(onboardingOn);

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

    expect(t.slack.ephemeralsTo("U_ALICE")).toEqual([]);
  });

  for (const [what, answer] of [
    ["Bob not in the channel", slackError("user_not_in_channel")],
    ["the channel gone", slackError("channel_not_found")],
    ["an unknown answer", networkFailure],
  ] satisfies Array<[string, ScriptedAnswer]>) {
    waitsOn(reachedByAHug, `with ${what} it is tried once and sends nothing else, ever`, async () => {
      const t = await workspace(onboardingOn);
      t.slack.answering("chat.postEphemeral", answer);

      await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });
      await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts: alicesOtherMessage });

      expect(t.slack.callsTo("chat.postEphemeral")).toHaveLength(1);
      expect(t.slack.callsTo("chat.postMessage")).toEqual([]);
    });
  }

  waitsOn(reachedByAHug, "a rate limit holds it, and it goes out once the limit lifts", async () => {
    const t = await workspace(onboardingOn);
    t.slack.answering("chat.postEphemeral", rateLimitedFor(30));

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

    expect(t.slack.callsTo("chat.postEphemeral")).toHaveLength(2);
    expect(t.slack.ephemeralsTo("U_BOB").at(-1)).toEqual({ channel: "C1", user: "U_BOB", text: toTheAuthor("Alice") });
    expect(t.slack.timesOf("chat.postEphemeral")[1]! - t.slack.timesOf("chat.postEphemeral")[0]!).toBeGreaterThanOrEqual(30_000);
  });

  // The reply reads the workspace's kudos emoji from S5's `howToOf`, over S3's settings. The delivery takes any error
  // as a failed try, so the stub's error never reaches the test through it: the read runs first, alone, to end the
  // test there until both land.
  waitsOn(["S3", "S5"], "a reply queued before the deploy still goes out, naming the workspace's kudos emoji", async () => {
    const t = await workspace(onboardingOn);
    await t.query((ctx) => howToOf(ctx, { workspace: "T1" }));

    await t.operations.action("slack.firstHugReply.deliverFirstHugReply", (ctx) =>
      deliverFirstHugReply(ctx, { workspace: "T1", user: "U_BOB", conversation: "C1", hugged: { kind: "author", name: "Alice" }, attempt: 2 }),
    );

    expect(t.slack.ephemeralsTo("U_BOB").map(({ text }) => text)).toEqual(["That was a hug: +1 XP for you and Alice. Thank them in a message with :taco: to earn an item."]);
  });

  for (const [what, flags] of [
    ["onboarding is off", ["hugs", "hidden-items"]],
    ["hidden-items is off", ["hugs", "onboarding"]],
  ] satisfies Array<[string, string[]]>) {
    waitsOn(reachedByAHug, `while ${what}, a first hug is given and sends nothing, as before`, async () => {
      const t = await workspace(flags);

      await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

      expect(await xpOf(t, "U_BOB")).toBe(1);
      expect(await xpOf(t, "U_ALICE")).toBe(1);
      expect(t.slack.callsTo("chat.postEphemeral")).toEqual([]);
      expect(t.slack.callsTo("chat.postMessage")).toEqual([]);
    });
  }
});

async function workspace(flags: string[]) {
  const t = backend();
  t.slack.withMember("U_ALICE", { profile: { display_name: "Alice", real_name: "Alice Lee" } }).withMember("U_BOB").withMember("U_CAROL").withMember("U_DANA");
  await setWorkspaceSettings(t, { kudosEmoji: "taco" });
  return flagsOn(t, flags);
}

async function hug(t: TestBackend, options: ReactionOptions) {
  await react(t, { ts: alicesMessage, ...options });
  await settle(t);
}
