import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeSlack } from "../../testing/fakeSlack";
import { flagsLoaded, flagsOnForEveryone } from "../../testing/flags";
import { signingSecret } from "../../testing/signedSlack";
import { edit, kudosReceived, kudosSpent, post, react, settle, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, section, text, tonedEmoji } from "../../testing/slackMessages";
import { internal } from "../_generated/api";
import { xpToReach } from "../progression/levels";
import { pickKudosEmoji } from "../album/kudosEmojis";
import { milestoneCatalogue } from "../album/milestoneCatalogue";
import { recordReward, standingOf } from "../progression/progression";
import type { MemberId } from "../workspace/directory";
import type { AttemptFailedEvent } from "../bus/events";

const now = new Date("2026-10-13T10:00:00Z");
const messageTs = `${Math.floor(now.getTime() / 1000) - 3600}.000100`;
const carolsMessageTs = `${Math.floor(now.getTime() / 1000) - 1800}.000100`;
const teamEmoji = "team-workflows";
const secondTeamEmoji = "workflows-heart";
const levelEmoji = "level-5";
const randomEmoji = "party-parrot";
const levelTwoEmoji = "raised_hands";
const firstThankYouEmoji = "love-hog";
const secondFirstThankYouEmoji = "hog-offers-heart";
const bobsHypeEmoji = "bob-hype";
const onboardingOn = ["hugs", "hidden-items", "onboarding"];
const saysWhy = "thanks for untangling the release notes today ";

let slack: FakeSlack;

beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  slack = new FakeSlack().withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL");
  flagsOnForEveryone(slack.fetch, "hugs");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("an emoji the giver unlocked in the album counts like the workspace's kudos emoji", () => {
  test.each([
    ["their team emoji", teamEmoji, unlockedTeamEmoji],
    ["their level emoji", levelEmoji, reachedLevelFive],
  ])("a kudos message with %s gives kudos", async (_, name, unlock) => {
    const t = await workspaceWithEmojiNames();
    await unlock(t, "U_ALICE");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji(name))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  test("a hype emoji the giver holds gives kudos to every mentioned teammate", async () => {
    const t = await workspaceWithEmojiNames();
    await heldHypeEmojiOf(t, "U_ALICE", "U_BOB");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), mention("U_CAROL"), text(" "), emoji(bobsHypeEmoji))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect({ bob: await kudosReceived(t, "U_BOB"), carol: await kudosReceived(t, "U_CAROL") }, "kudos received").toEqual({ bob: 1, carol: 1 });
  });

  test("a kudos message with an emoji only someone else unlocked gives nothing", async () => {
    const t = await workspaceWithEmojiNames();
    await memberOf(t, "U_ALICE");
    await unlockedTeamEmoji(t, "U_CAROL");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji(teamEmoji))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
  });

  test("a reaction with their team emoji is a hug", async () => {
    const t = await workspaceWithEmojiNames();
    await unlockedTeamEmoji(t, "U_BOB");

    await react(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: teamEmoji, ts: messageTs });
    await settle(t);

    expect(await xpOf(t, "U_ALICE")).toBe(1);
    expect(await xpOf(t, "U_BOB")).toBe(1);
  });

  test("a reaction with an emoji only someone else unlocked is no hug", async () => {
    const t = await workspaceWithEmojiNames();
    await memberOf(t, "U_BOB");
    await unlockedTeamEmoji(t, "U_CAROL");

    await react(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: teamEmoji, ts: messageTs });
    await settle(t);

    expect(await xpOf(t, "U_ALICE")).toBe(0);
    expect(await xpOf(t, "U_BOB")).toBe(0);
  });

  test.each([
    ["alone", []],
    ["beside 60 other emoji", Array.from({ length: 60 }, (_, index) => emoji(`other-${index}`))],
  ])("their team emoji's second name gives kudos %s and is a hug", async (_, others) => {
    const t = await workspaceWithEmojiNames();
    await secondNameOf(t, "team:workflows", secondTeamEmoji);
    await unlockedTeamEmoji(t, "U_ALICE");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), ...others, emoji(secondTeamEmoji))], { user: "U_ALICE", ts: messageTs });
    await react(t, { user: "U_ALICE", itemUser: "U_CAROL", reaction: secondTeamEmoji, ts: carolsMessageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB"), "kudos from the second name").toBe(1);
    expect(await xpOf(t, "U_CAROL"), "a hug from the second name").toBe(1);
  });

  test("the second name of an emoji only someone else unlocked gives nothing and is no hug", async () => {
    const t = await workspaceWithEmojiNames();
    await secondNameOf(t, "team:workflows", secondTeamEmoji);
    await memberOf(t, "U_ALICE");
    await unlockedTeamEmoji(t, "U_CAROL");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji(secondTeamEmoji))], { user: "U_ALICE", ts: messageTs });
    await react(t, { user: "U_ALICE", itemUser: "U_CAROL", reaction: secondTeamEmoji, ts: carolsMessageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(await xpOf(t, "U_CAROL")).toBe(0);
  });

  test("with random-emojis off, a held random emoji still gives kudos and a hug", async () => {
    const t = await workspaceWithEmojiNames();
    await droppedRandomEmoji(t, "U_ALICE");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji(randomEmoji))], { user: "U_ALICE", ts: messageTs });
    await react(t, { user: "U_ALICE", itemUser: "U_CAROL", reaction: randomEmoji, ts: carolsMessageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(await xpOf(t, "U_CAROL")).toBe(1);
  });

  test("a held random emoji the maintainer mapped to a level emoji the holder hasn't reached still gives kudos and a hug", async () => {
    const t = await workspaceWithEmojiNames();
    await droppedRandomEmoji(t, "U_ALICE");
    await t.run(async (ctx) => {
      await ctx.db.insert("emojiNames", { workspace: "T1", emoji: "level:25", name: randomEmoji });
      for (const row of await ctx.db.query("emojiClasses").collect()) await ctx.db.delete(row._id);
    });

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji(randomEmoji))], { user: "U_ALICE", ts: messageTs });
    await react(t, { user: "U_ALICE", itemUser: "U_CAROL", reaction: randomEmoji, ts: carolsMessageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(await xpOf(t, "U_CAROL")).toBe(1);
  });

  test.each([
    ["🙌", emoji(levelTwoEmoji), levelTwoEmoji],
    ["a skin-toned 🙌", tonedEmoji(levelTwoEmoji, 3, "1f64c-1f3fc"), `${levelTwoEmoji}::skin-tone-3`],
  ])("LP71: while onboarding is on, a level-2 member's kudos message with %s gives kudos and their reaction with it is a hug", async (_, element, reaction) => {
    flagsOnForEveryone(slack.fetch, ...onboardingOn);
    const t = await workspaceWithReservedNames();
    await reachedLevelTwo(t, "U_ALICE");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), element)], { user: "U_ALICE", ts: messageTs });
    await react(t, { user: "U_ALICE", itemUser: "U_CAROL", reaction, ts: carolsMessageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(await xpOf(t, "U_CAROL")).toBe(1);
  });

  test.each([
    ["onboarding is on and the member is at level 1", onboardingOn, false],
    ["onboarding is off", ["hugs", "hidden-items"], true],
    ["hidden-items is off", ["hugs", "onboarding"], true],
  ])("LP71 LP77: while %s, a 🙌 kudos message gives nothing and a 🙌 reaction is no hug", async (_, flags, atLevelTwo) => {
    flagsOnForEveryone(slack.fetch, ...flags);
    const t = await workspaceWithReservedNames();
    if (atLevelTwo) await reachedLevelTwo(t, "U_ALICE");
    else await memberOf(t, "U_ALICE");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji(levelTwoEmoji))], { user: "U_ALICE", ts: messageTs });
    await react(t, { user: "U_ALICE", itemUser: "U_CAROL", reaction: levelTwoEmoji, ts: carolsMessageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(await xpOf(t, "U_CAROL")).toBe(0);
  });

  test("an edit to a kudos with the workspace emoji and 700 other emoji keeps its kudos", { timeout: 60_000 }, async () => {
    const t = await workspaceWithEmojiNames({ transactionLimits: true });
    await unlockedTeamEmoji(t, "U_ALICE");
    const manyEmoji = Array.from({ length: 700 }, (_, index) => emoji(`other-${index}`));
    const blocks = [section(text(saysWhy), mention("U_BOB"), text(" "), emoji("taco"), ...manyEmoji)];
    await post(t, blocks, { user: "U_ALICE", ts: messageTs });
    await settle(t);

    const response = await edit(t, [section(text(`${saysWhy} again`), mention("U_BOB"), text(" "), emoji("taco"), ...manyEmoji)], { user: "U_ALICE", ts: messageTs, editedTs: `${Number(messageTs.split(".")[0]) + 60}.000100` });
    await settle(t);

    expect(response.status).toBe(200);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  test("a held random emoji past the album's 200 shown still gives kudos in a message with 60 other emoji", { timeout: 60_000 }, async () => {
    const t = await workspaceWithEmojiNames();
    await droppedRandomEmoji(t, "U_ALICE", Array.from({ length: 200 }, (_, index) => `a-held-${String(index).padStart(3, "0")}`));
    const others = Array.from({ length: 60 }, (_, index) => emoji(`other-${index}`));

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), ...others, emoji(randomEmoji))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  test("an edit to a plain kudos in a workspace whose registry holds 11,000 names keeps its kudos", { timeout: 120_000 }, async () => {
    const t = await workspaceWithEmojiNames({ transactionLimits: true });
    await t.run(async (ctx) => {
      for (let index = 0; index < 11_000; index += 1) await ctx.db.insert("emojiNames", { workspace: "T1", emoji: `team:filler-${index}`, name: `team-filler-${index}` });
    });
    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji("taco"))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    const response = await edit(t, [section(text(`${saysWhy} again`), mention("U_BOB"), text(" "), emoji("taco"))], { user: "U_ALICE", ts: messageTs, editedTs: `${Number(messageTs.split(".")[0]) + 60}.000100` });
    await settle(t);

    expect(response.status).toBe(200);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });
});

describe("in a kudos message, an earned emoji counts only when the giver picked it, it is First thank-you, or it is the hype emoji of a teammate they mention", { timeout: 30_000 }, () => {
  beforeEach(() => {
    flagsOnForEveryone(slack.fetch, "hugs", "kudos-emoji-picks");
  });

  test("an earned emoji the giver didn't pick gives no kudos, while a reaction with it is still a hug", async () => {
    const t = await workspaceWithEmojiNames();
    await unlockedTeamEmoji(t, "U_ALICE");

    await post(t, [section(text("hey "), mention("U_BOB"), text(" "), emoji(teamEmoji))], { user: "U_ALICE", ts: messageTs });
    await react(t, { user: "U_ALICE", itemUser: "U_CAROL", reaction: teamEmoji, ts: carolsMessageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB"), "kudos from an unpicked emoji").toBe(0);
    expect(await xpOf(t, "U_CAROL"), "a hug from the same emoji").toBe(1);
  });

  test.each([
    ["their team emoji", teamEmoji, "team:workflows", unlockedTeamEmoji],
    ["their level emoji", levelEmoji, "level:5", reachedLevelFive],
    ["a random emoji they hold", randomEmoji, `random:${randomEmoji}`, droppedRandomEmoji],
  ])("a kudos message with %s, picked, gives kudos", async (_, name, id, unlock) => {
    const t = await workspaceWithEmojiNames();
    await unlock(t, "U_ALICE");
    await pickedForKudos(t, "U_ALICE", id);

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji(name))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  test("an earned emoji the giver picked and later unpicked gives no kudos", async () => {
    const t = await workspaceWithEmojiNames();
    await unlockedTeamEmoji(t, "U_ALICE");
    await pickedForKudos(t, "U_ALICE", "team:workflows");
    const member = await memberOf(t, "U_ALICE");
    await t.run((ctx) => pickKudosEmoji(ctx, member, "team:workflows", false));

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji(teamEmoji))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
  });

  test.each([firstThankYouEmoji, secondFirstThankYouEmoji])("First thank-you gives kudos unpicked as :%s:", async (name) => {
    const t = await workspaceWithFirstThankYou();
    await earnedFirstThankYou(t, "U_ALICE");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji(name))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  test.each([0, 60])("a held random emoji the maintainer later mapped to First thank-you gives kudos unpicked, beside %i other emoji", async (otherCount) => {
    const t = await workspaceWithEmojiNames();
    await droppedRandomEmoji(t, "U_ALICE");
    await earnedFirstThankYou(t, "U_ALICE");
    await t.run(async (ctx) => {
      await ctx.db.insert("emojiNames", { workspace: "T1", emoji: "milestone:thoughtful:bronze", name: randomEmoji });
      for (const row of await ctx.db.query("emojiClasses").collect()) await ctx.db.delete(row._id);
    });
    const others = Array.from({ length: otherCount }, (_, index) => emoji(`other-${index}`));

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), ...others, emoji(randomEmoji))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  test("the hype emoji of the teammate the giver mentions gives kudos unpicked", async () => {
    const t = await workspaceWithEmojiNames();
    await heldHypeEmojiOf(t, "U_ALICE", "U_BOB");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), emoji(bobsHypeEmoji))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  test("the hype emoji of one of two mentioned teammates gives kudos only to its person, and the giver hears the other got none", async () => {
    const t = await workspaceWithEmojiNames();
    await heldHypeEmojiOf(t, "U_ALICE", "U_BOB");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), mention("U_CAROL"), text(" "), emoji(bobsHypeEmoji))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect({ bob: await kudosReceived(t, "U_BOB"), carol: await kudosReceived(t, "U_CAROL"), spent: await kudosSpent(t) }, "kudos received and spent").toEqual({ bob: 1, carol: 0, spent: 1 });
    expect(repliesTo("U_ALICE")[0]?.slice(0, 2), "the giver's reply").toEqual(["<@U_BOB> got 1 kudos from you. You have 2 kudos left today.", "I skipped <@U_CAROL>: a hype emoji gives kudos only to its own person."]);
  });

  test("a message whose recipients would get different kudos than the giver has left gives nothing and says what it needs", async () => {
    const t = await workspaceWithEmojiNames();
    await heldHypeEmojiOf(t, "U_ALICE", "U_BOB");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), mention("U_CAROL"), text(" "), emoji("taco"), emoji(bobsHypeEmoji), emoji(bobsHypeEmoji), emoji(bobsHypeEmoji))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect({ bob: await kudosReceived(t, "U_BOB"), carol: await kudosReceived(t, "U_CAROL") }, "kudos received").toEqual({ bob: 0, carol: 0 });
    expect(repliesTo("U_ALICE"), "the giver's reply").toEqual([["This needs 4 kudos, but you have 3 left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have 3 again."]]);
    expect(await attemptsFailed(t), "the attempt failed event").toEqual([{ recipients: 2, perRecipient: 3, cost: 4 }]);
  });

  test("the hype emoji of a teammate the giver doesn't mention gives no kudos", async () => {
    const t = await workspaceWithEmojiNames();
    await heldHypeEmojiOf(t, "U_ALICE", "U_BOB");

    await post(t, [section(text(saysWhy), mention("U_CAROL"), text(" "), emoji(bobsHypeEmoji))], { user: "U_ALICE", ts: carolsMessageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_CAROL")).toBe(0);
  });

  test("the hype emoji of a teammate the giver doesn't mention gives no kudos, even when it was picked before picking it ended", async () => {
    const t = await workspaceWithEmojiNames();
    await heldHypeEmojiOf(t, "U_ALICE", "U_BOB");
    const member = await memberOf(t, "U_ALICE");
    const bob = await memberOf(t, "U_BOB");
    await t.run((ctx) => ctx.db.insert("kudosEmojiPicks", { member, emoji: `hype:${bob}` }));

    await post(t, [section(text(saysWhy), mention("U_CAROL"), text(" "), emoji(bobsHypeEmoji))], { user: "U_ALICE", ts: carolsMessageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_CAROL")).toBe(0);
  });
});

describe("a message gives each recipient as many kudos as its most repeated kudos emoji", () => {
  test.each([
    ["the workspace's kudos emoji beside their team emoji", ["taco", teamEmoji], 1],
    ["the workspace's kudos emoji twice beside their team emoji", ["taco", teamEmoji, "taco"], 2],
    ["their team emoji three times beside the workspace's kudos emoji", [teamEmoji, "taco", teamEmoji, teamEmoji], 3],
  ])("a kudos message with %s", async (_, names, kudos) => {
    const t = await workspaceWithEmojiNames();
    await unlockedTeamEmoji(t, "U_ALICE");
    await pickedForKudos(t, "U_ALICE", "team:workflows");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), ...names.map((name) => emoji(name)))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(kudos);
  });

  test("beside the workspace's kudos emoji, a repeated hype emoji gives its person the repeats and the other mentioned teammate one", async () => {
    flagsOnForEveryone(slack.fetch, "hugs", "kudos-emoji-picks");
    const t = await workspaceWithEmojiNames();
    await heldHypeEmojiOf(t, "U_ALICE", "U_BOB");

    await post(t, [section(text(saysWhy), mention("U_BOB"), text(" "), mention("U_CAROL"), text(" "), emoji("taco"), emoji(bobsHypeEmoji), emoji(bobsHypeEmoji))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect({ bob: await kudosReceived(t, "U_BOB"), carol: await kudosReceived(t, "U_CAROL"), spent: await kudosSpent(t) }, "kudos received and spent").toEqual({ bob: 2, carol: 1, spent: 3 });
    expect(repliesTo("U_ALICE")[0]?.[0], "the giver's reply").toBe("<@U_BOB> got 2 kudos and <@U_CAROL> got 1 kudos from you. That was your last kudos for today, and you'll have 3 more at midnight.");
  });
});

describe("the app reacts with the kudos emoji closest after the recipient's mention", () => {
  test.each([
    ["one before the mention and one after it", [emoji("taco"), mention("U_BOB"), text(" "), emoji(teamEmoji)], teamEmoji],
    ["two after the mention", [mention("U_BOB"), text(" thanks "), emoji(teamEmoji), text(" and "), emoji("taco")], teamEmoji],
    ["one after the giver's own mention and one after the recipient's", [mention("U_ALICE"), emoji("taco"), text(" and "), mention("U_BOB"), emoji(teamEmoji)], teamEmoji],
    ["none after the mention, the closest before it", [emoji(teamEmoji), text(" "), emoji("taco"), text(" "), mention("U_BOB")], "taco"],
  ])("a kudos message with %s", async (_, elements, reaction) => {
    const t = await workspaceWithEmojiNames();
    await unlockedTeamEmoji(t, "U_ALICE");
    await pickedForKudos(t, "U_ALICE", "team:workflows");

    await post(t, [section(text(saysWhy), ...elements)], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(slack.reactionsOn("C1", messageTs)).toEqual([reaction]);
  });

  test("the app reacts with the kudos emoji closest after the first recipient's mention that counts for them, never another teammate's hype emoji", async () => {
    flagsOnForEveryone(slack.fetch, "hugs", "kudos-emoji-picks");
    const t = await workspaceWithEmojiNames();
    await heldHypeEmojiOf(t, "U_ALICE", "U_BOB");

    await post(t, [section(text(saysWhy), mention("U_CAROL"), text(" "), emoji(bobsHypeEmoji), text(" "), mention("U_BOB"), text(" "), emoji("taco"))], { user: "U_ALICE", ts: messageTs });
    await settle(t);

    expect(slack.reactionsOn("C1", messageTs), "the app's reaction").toEqual(["taco"]);
  });
});

async function workspaceWithEmojiNames({ transactionLimits = false } = {}) {
  const t = testBackend({ transactionLimits });
  await t.run(async (ctx) => {
    await ctx.db.insert("emojiNames", { workspace: "T1", emoji: "team:workflows", name: teamEmoji });
    await ctx.db.insert("emojiNames", { workspace: "T1", emoji: "level:5", name: levelEmoji });
  });
  return flagsLoaded(t);
}

async function workspaceWithReservedNames() {
  const t = await workspaceWithEmojiNames();
  await t.mutation(internal.album.emojiNames.reserveSharedEmojiNames, {});
  return t;
}

async function workspaceWithFirstThankYou() {
  const t = await workspaceWithEmojiNames();
  await t.run((ctx) => ctx.db.insert("emojiNames", { workspace: "T1", emoji: "milestone:thoughtful:bronze", name: firstThankYouEmoji }));
  await secondNameOf(t, "milestone:thoughtful:bronze", secondFirstThankYouEmoji);
  return t;
}

async function earnedFirstThankYou(t: Backend, user: string) {
  const member = await memberOf(t, user);
  await t.run((ctx) => ctx.db.insert("milestoneTiers", { member, milestone: "thoughtful", tier: "bronze", at: now.getTime(), catalogue: milestoneCatalogue.version }));
}

async function heldHypeEmojiOf(t: Backend, user: string, of: string) {
  const member = await memberOf(t, user);
  const person = await memberOf(t, of);
  await t.run(async (ctx) => {
    await ctx.db.insert("thoughtfulPacks", { workspace: "T1", giver: member, recipient: person, week: "2026-10-05", message: { workspace: "T1", conversation: "C1", message: "1759600000.000100" }, holdsSticker: false, at: now.getTime() });
    await ctx.db.insert("emojiNames", { workspace: "T1", emoji: "hype", person, name: bobsHypeEmoji });
  });
}

async function pickedForKudos(t: Backend, user: string, emoji: string) {
  const member = await memberOf(t, user);
  expect(await t.run((ctx) => pickKudosEmoji(ctx, member, emoji, true))).toMatchObject({ kind: "picked" });
}

async function secondNameOf(t: Backend, emoji: string, name: string) {
  expect(await t.mutation(internal.album.emojiNames.giveEmojiASecondName, { workspace: "T1", emoji, name })).toBe(true);
}

async function reachedLevelTwo(t: Backend, user: string) {
  const member = await memberOf(t, user);
  await t.run((ctx) => recordReward(ctx, "T1", { member, key: "test:level-2", xp: xpToReach(2), coins: 0, item: null, catalogueVersion: "test", at: now.getTime() }));
  await settle(t);
}

async function unlockedTeamEmoji(t: Backend, user: string) {
  const member = await memberOf(t, user);
  await t.run((ctx) => ctx.db.insert("teamStickers", { member, workspace: "T1", team: "workflows", at: now.getTime(), name: "Workflows", art: null, emoji: teamEmoji }));
}

async function droppedRandomEmoji(t: Backend, user: string, heldBefore: string[] = []) {
  const member = await memberOf(t, user);
  const recipient = await memberOf(t, "U_BOB");
  await t.run(async (ctx) => {
    const pack = await ctx.db.insert("thoughtfulPacks", { workspace: "T1", giver: member, recipient, week: "2026-10-12", message: { workspace: "T1", conversation: "C1", message: "1760000000.000100" }, holdsSticker: false, at: now.getTime() });
    await ctx.db.insert("emojiClasses", { workspace: "T1", name: randomEmoji, class: "random" });
    for (const name of [...heldBefore, randomEmoji]) await ctx.db.insert("randomEmojiDrops", { member, name, pack, at: now.getTime() });
  });
}

async function reachedLevelFive(t: Backend, user: string) {
  const member = await memberOf(t, user);
  await t.run((ctx) => recordReward(ctx, "T1", { member, key: "test:level-5", xp: xpToReach(5), coins: 0, item: null, catalogueVersion: "test", at: now.getTime() }));
  await settle(t);
}

async function xpOf(t: Backend, user: string) {
  const member = await memberOf(t, user);
  return t.run(async (ctx) => (await standingOf(ctx, member)).xp);
}

function repliesTo(user: string) {
  return slack.ephemeralsTo(user).map(({ text }) => String(text).split("\n"));
}

async function attemptsFailed(t: Backend) {
  const jobs = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).filter(({ name }) => name === "analytics/subscribers:recordAttemptFailed"));
  return jobs.map(({ args }) => {
    const { recipients, perRecipient, cost } = (args[0] as { event: AttemptFailedEvent }).event;
    return { recipients, perRecipient, cost };
  });
}

async function memberOf(t: Backend, user: string): Promise<MemberId> {
  return t.run(async (ctx) => {
    const row = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("workspace", "T1").eq("user", user))
      .unique();
    return row?._id ?? (await ctx.db.insert("members", { workspace: "T1", user, kind: "member" }));
  });
}
