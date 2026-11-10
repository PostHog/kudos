import { describe, expect, vi } from "vitest";
import type { TestBackend } from "../../testing/backend.ts";
import { offForEveryone } from "../../testing/flags.ts";
import type { ReactionOptions } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { payHugPeople } from "../hugs/people.ts";
import type { MemberId } from "../workspace/directory.ts";
import {
  factsOf,
  flagsLoaded,
  flagsOn,
  hourMs,
  kudosMessage,
  memberOf,
  reachedByAHug,
  reachedByAReaction,
  react,
  setWorkspaceSettings,
  settle,
  slackTs,
  useHugsBackend,
  xpOf,
} from "./hugsTesting.ts";

const now = new Date("2026-10-13T10:00:00Z");
const messageTs = slackTs(now.getTime() - hourMs);
const message = { workspace: "T1", conversation: "C1", message: messageTs };

const backend = useHugsBackend(now);

describe("HH19: a recipient's hug on the kudos they received hugs it back to its author", () => {
  waitsOn(reachedByAHug, "Carol's hug on Alice's kudos to her and Dana pays Alice and Carol, and Dana nothing", async () => {
    const t = await workspace();
    await kudos(t, "U_ALICE", ["U_CAROL", "U_DANA"]);
    const before = await xpOfEveryone(t);

    await hug(t, { user: "U_CAROL", itemUser: "U_ALICE" });

    expect(await xpOfEveryone(t)).toEqual({ ...before, U_ALICE: before.U_ALICE + 1, U_CAROL: before.U_CAROL + 1 });
    expect(await factsOf(t, "hugGiven")).toEqual([expect.objectContaining({ giver: await memberOf(t, "U_CAROL"), author: await memberOf(t, "U_ALICE"), onKudos: false })]);
    expect(hugsGiven(t)).toHaveLength(1);
  });

  waitsOn(reachedByAHug, "the author's own reaction on their kudos still does nothing", async () => {
    const t = await workspace();
    await kudos(t, "U_ALICE", ["U_CAROL"]);
    const before = await xpOfEveryone(t);

    await hug(t, { user: "U_ALICE", itemUser: "U_ALICE" });

    expect(await xpOfEveryone(t)).toEqual(before);
    expect(await factsOf(t, "hugGiven")).toEqual([]);
  });
});

describe("HH19 HH21: a member's hype emoji the giver doesn't hold is a hype reaction", () => {
  waitsOn(reachedByAReaction, "Bob's :carol-hype: on Alice's message hugs nobody and publishes who reacted with whose emoji on whose message", async () => {
    const t = await workspace();
    const carol = await hypeEmojiOf(t, "U_CAROL", "carol-hype");

    const eventTs = "1791885600.000200";
    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: "carol-hype::skin-tone-2", eventTs });

    expect(await xpOfEveryone(t)).toEqual({ U_ALICE: 0, U_BOB: 0, U_CAROL: 0, U_DANA: 0 });
    expect(hugsGiven(t)).toEqual([]);
    expect(await factsOf(t, "hugGiven")).toEqual([]);
    expect(await factsOf(t, "hypeReacted")).toEqual([
      { type: "hypeReacted", workspace: "T1", giver: await memberOf(t, "U_BOB"), owner: carol, author: await memberOf(t, "U_ALICE"), emoji: "carol-hype", message, at: Number(eventTs) * 1000 },
    ]);
  });

  waitsOn(reachedByAHug, "a hype emoji the giver holds is a hug, and no hype reaction", async () => {
    const t = await workspace();
    const carol = await hypeEmojiOf(t, "U_CAROL", "carol-hype");
    await holdHypeEmoji(t, "U_BOB", carol);

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: "carol-hype" });

    expect(await xpOfEveryone(t)).toEqual({ U_ALICE: 1, U_BOB: 1, U_CAROL: 0, U_DANA: 0 });
    expect(await factsOf(t, "hugGiven")).toEqual([expect.objectContaining({ giver: await memberOf(t, "U_BOB"), reaction: "carol-hype" })]);
    expect(await factsOf(t, "hypeReacted")).toEqual([]);
  });

  waitsOn(reachedByAReaction, "a hype emoji whose owner reacts with it does nothing", async () => {
    const t = await workspace();
    await hypeEmojiOf(t, "U_BOB", "bob-hype");

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: "bob-hype" });

    expect(await factsOf(t, "hypeReacted")).toEqual([]);
    expect(await factsOf(t, "hugGiven")).toEqual([]);
  });

  for (const [what, options] of [
    ["more than 24 hours after the message", { ts: slackTs(now.getTime() - 24 * hourMs) }],
    ["on one's own message", { itemUser: "U_BOB" }],
  ] satisfies Array<[string, ReactionOptions]>) {
    waitsOn(reachedByAReaction, `a hype reaction ${what} does nothing`, async () => {
      const t = await workspace();
      await hypeEmojiOf(t, "U_CAROL", "carol-hype");

      await hug(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: "carol-hype", ...options });

      expect(await factsOf(t, "hypeReacted")).toEqual([]);
    });
  }

  waitsOn(reachedByAReaction, "while hugs is off for the giver, a hype reaction publishes nothing", async () => {
    const t = await workspace();
    await flagsLoaded(t, offForEveryone("hugs"));
    await hypeEmojiOf(t, "U_CAROL", "carol-hype");

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: "carol-hype" });

    expect(await factsOf(t, "hypeReacted")).toEqual([]);
  });

  waitsOn(reachedByAReaction, "an emoji no member owns, ending in -hype, is no hype reaction", async () => {
    const t = await workspace();

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: "nobody-hype" });

    expect(await factsOf(t, "hypeReacted")).toEqual([]);
  });
});

describe("HH20: the hug facts", () => {
  waitsOn(reachedByAHug, "a hug on an ordinary message names its author, the reaction without its skin tone, and whether it is the giver's first", async () => {
    const t = await workspace();

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: "taco::skin-tone-3" });
    await hug(t, { user: "U_BOB", itemUser: "U_CAROL", ts: slackTs(now.getTime() - 2 * hourMs) });

    const alice = await memberOf(t, "U_ALICE");
    expect((await factsOf(t, "hugGiven")).map(({ author, reaction, first }) => ({ author, reaction, first }))).toEqual([
      { author: alice, reaction: "taco", first: true },
      { author: await memberOf(t, "U_CAROL"), reaction: "taco", first: false },
    ]);
  });

  waitsOn(reachedByAHug, "a hug on a Given kudos message names no author", async () => {
    const t = await workspace();
    await kudos(t, "U_ALICE", ["U_CAROL"]);

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

    expect(await factsOf(t, "hugGiven")).toEqual([expect.not.objectContaining({ author: expect.anything() })]);
  });

  waitsOn(reachedByAHug, "each paid person is published once as hugReceived, in their own week, even when the hug is delivered again", async () => {
    vi.setSystemTime(mondayMorningInKiritimati);
    const t = await workspace();
    const ts = slackTs(mondayMorningInKiritimati - hourMs);
    await kudos(t, "U_ALICE", ["U_CAROL", "U_DANA"], ts);

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts });
    const [given] = await factsOf(t, "hugGiven");
    await t.run((ctx) => payHugPeople(ctx, { event: given! }));
    await settle(t);

    const giver = await memberOf(t, "U_BOB");
    const hugged = { ...message, message: ts };
    const { at } = (await factsOf(t, "hugGiven"))[0]!;
    expect((await factsOf(t, "hugReceived")).toSorted((a, b) => a.week.localeCompare(b.week))).toEqual([
      { type: "hugReceived", workspace: "T1", giver, person: await memberOf(t, "U_DANA"), message: hugged, at, week: "2026-10-12", rewards: false },
      { type: "hugReceived", workspace: "T1", giver, person: await memberOf(t, "U_CAROL"), message: hugged, at, week: "2026-10-19", rewards: false },
    ]);
  });
});

const mondayMorningInKiritimati = new Date("2026-10-18T12:00:00Z").getTime();

async function workspace() {
  const t = backend();
  t.slack.withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL", { tz: "Pacific/Kiritimati" }).withMember("U_DANA", { tz: "Pacific/Pago_Pago" });
  await setWorkspaceSettings(t, { kudosEmoji: "taco" });
  return flagsOn(t, ["hugs"]);
}

async function hug(t: TestBackend, options: ReactionOptions) {
  const response = await react(t, { ts: messageTs, ...options });
  await settle(t);
  return response;
}

async function kudos(t: TestBackend, giver: string, recipients: string[], ts = messageTs) {
  await kudosMessage(t, giver, recipients, ts);
}

async function hypeEmojiOf(t: TestBackend, user: string, name: string) {
  const person = await t.seed.insert("members", { workspace: "T1", user, kind: "member" });
  await t.seed.insert("emojiNames", { workspace: "T1", emoji: "hype", person, name });
  return person;
}

async function holdHypeEmoji(t: TestBackend, user: string, owner: MemberId) {
  const holder = await t.seed.insert("members", { workspace: "T1", user, kind: "member" });
  await t.seed.insert("thoughtfulPacks", { workspace: "T1", giver: holder, recipient: owner, week: "2026-10-12", message, holdsSticker: false, at: now.getTime() });
  await t.seed.insert("seenEmojis", { member: holder, emoji: `hype:${owner}`, at: now.getTime() });
}

const everyone = ["U_ALICE", "U_BOB", "U_CAROL", "U_DANA"] as const;

async function xpOfEveryone(t: TestBackend): Promise<Record<(typeof everyone)[number], number>> {
  const [U_ALICE, U_BOB, U_CAROL, U_DANA] = await Promise.all(everyone.map((user) => xpOf(t, user)));
  return { U_ALICE: U_ALICE!, U_BOB: U_BOB!, U_CAROL: U_CAROL!, U_DANA: U_DANA! };
}

function hugsGiven(t: TestBackend) {
  return t.postHog.events().filter(({ event }) => event === "hug given");
}
