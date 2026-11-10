// Today's convex/slack/customKudosEmoji.test.ts. Each walk starts with the custom emoji sync into the workspace's
// directory, then opens the App Home, picks, buys and gives kudos, so every test waits on the stacks those reach.
import { describe, expect } from "vitest";
import type { TestBackend } from "../../testing/backend.ts";
import { slackError, type FakeSlack } from "../../testing/fakeSlack.ts";
import { onForEmails, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import type { FlagDefinition } from "../../testing/fakePostHog.ts";
import { blockActions, buttonInHome, externalPickerInHome, externalPicksInHome, publishedHome, publishedHomeBlocks, staleButtonOf, stalePicksOf } from "../../testing/slackInteractions.ts";
import { emoji, mention, section, text } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { KudosGivenEvent } from "../bus/events.ts";
import { recordReward } from "../progression/progression.ts";
import { visibleInventoryOf } from "../store/inventory.ts";
import { balanceOf } from "../wallet/wallet.ts";
import type { MemberId } from "../workspace/directory.ts";
import { clicked, homeOpened, reachedByTheStore, searched, syncCustomEmojiNow } from "./customKudosEmojiTesting.ts";
import { factsOf, flagsLoaded, memberOf as memberOrNullOf, moveTo, post, settle, unlocksShippedBeforeAnyoneJoined, useHugsBackend } from "./hugsTesting.ts";

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const saysWhy = "thanks for untangling the release notes today";
const shipitArt = "https://emoji.slack-edge.com/T1/shipit/0a1b2c.png";
const remadeShipitArt = "https://emoji.slack-edge.com/T1/shipit/9f8e7d.png";
const partyArt = "https://emoji.slack-edge.com/T1/partyparrot/3c4d5e.gif";
const standardPicture = (file: string) => `https://a.slack-edge.com/production-standard-emoji-assets/17.0/apple-large/${file}.png`;
const shipit = "custom:shipit";
const picker = "setCustomKudosEmoji";
const reinstall = "Reinstall the app to pick custom emoji.";
const xpBelowLevelSix = 990;

const storeOn = [onForEveryone("xp-levels"), onForEveryone("unlocks"), onForEveryone("coins"), onForEveryone("store")];
const everyoneDeciding = [...storeOn, onForEveryone("custom-kudos-emoji")];

const backend = useHugsBackend(new Date(tuesday));
let slack: FakeSlack;
let sentMessages = 0;

describe("ST31 ST32: an admin picks custom kudos emoji that join the store", () => {
  waitsOn(reachedByTheStore, "an admin picks :shipit:, and a member sees it in the store at 100 🪙, buys it and thanks Bob with it", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await aliceOpensCoinsWith(t, 100);

    await openAdmin(t, "U_DANA");
    expect(adminSection(publishedHome(slack, "U_DANA"))).toEqual(["section: *Custom kudos emoji*", "section: Pick custom emoji members can buy as kudos emoji for 100 🪙. [multi_external_select: none]"]);
    expect(await suggested(t, "U_DANA", "ship")).toEqual([":shipit:"]);
    await send(t, blockActions("U_DANA", externalPicksInHome(slack, "U_DANA", "shipit")));
    expect(adminSection(publishedHome(slack, "U_DANA"))).toContain("section: Pick custom emoji members can buy as kudos emoji for 100 🪙. [multi_external_select: :shipit:]");

    await openInventory(t, "U_ALICE");
    expect(publishedHome(slack, "U_ALICE").at(-1)).toBe("section: :shipit: · 100 🪙 [button: Buy]");
    await send(t, blockActions("U_ALICE", buyButtonBeside(":shipit: · 100 🪙")));
    expect(await coinsOf(t, "U_ALICE")).toBe(0);
    expect(publishedHome(slack, "U_ALICE")).toContain("section: :shipit:");

    await giveKudos(t, "U_ALICE", ["U_BOB"], saysWhy, ["shipit"]);

    expect((await kudosGivenEvents(t)).at(-1)).toMatchObject({ kudosEmoji: "shipit", ownedEmoji: ["shipit"], awards: [{ kudos: 1 }] });
    expect((await kudosGivenEvents(t)).at(-1)?.awards.map(({ recipient }) => recipient)).toEqual([await memberOf(t, "U_BOB")]);
  }, 60_000);

  waitsOn(reachedByTheStore, "an alias resolves to the emoji it aliases, in the picker's options and in what is picked", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await openAdmin(t, "U_DANA");

    expect(await suggested(t, "U_DANA", "s")).toEqual([":shipit:"]);
    await send(t, blockActions("U_DANA", externalPicksInHome(slack, "U_DANA", "ship", "shipit")));

    expect((await pickedRowsOf(t)).map(({ name, url }) => ({ name, url }))).toEqual([{ name: "shipit", url: shipitArt }]);
  }, 60_000);

  waitsOn(reachedByTheStore, "a search typed with capitals finds the workspace's lowercase emoji", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await openAdmin(t, "U_DANA");

    expect(await suggested(t, "U_DANA", "Ship")).toEqual([":shipit:"]);
  }, 60_000);

  waitsOn(reachedByTheStore, "a pick read while a sync is between batches, with two names aliasing each other, picks the emoji the newer listing names", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await openAdmin(t, "U_DANA");
    const shipitRow = (await t.seed.all("customEmoji")).find((row) => row.workspace === "T1" && row.name === "shipit");
    await t.seed.patch("customEmoji", shipitRow!._id, { aliasOf: "ship" });

    await send(t, blockActions("U_DANA", stalePicksOf(picker, "ship")));

    expect((await pickedRowsOf(t)).map(({ name, url }) => ({ name, url }))).toEqual([{ name: "shipit", url: shipitArt }]);
  }, 60_000);

  waitsOn(reachedByTheStore, "the same picks twice leave the same picked emoji", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await openAdmin(t, "U_DANA");
    const picks = externalPicksInHome(slack, "U_DANA", "shipit", "partyparrot");

    await send(t, blockActions("U_DANA", picks));
    const once = await pickedRowsOf(t);
    moveTo(t, t.clock.now() + 60_000);
    await send(t, blockActions("U_DANA", picks));

    expect(await pickedRowsOf(t)).toEqual(once);
    expect(once.map(({ name }) => name)).toEqual(["partyparrot", "shipit"]);
  }, 60_000);

  waitsOn(reachedByTheStore, "an admin picks at most 20, which the picker says and a longer stale pick keeps to its first 20", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    const names = Array.from({ length: 21 }, (_, index) => `team${String(index).padStart(2, "0")}`);
    for (const name of names) slack.withCustomEmoji(name, `https://emoji.slack-edge.com/T1/${name}/1.png`);
    await syncCustomEmojiNow(t);
    await openAdmin(t, "U_DANA");

    await send(t, blockActions("U_DANA", stalePicksOf(picker, ...names)));

    expect(externalPickerInHome(slack, "U_DANA")).toMatchObject({ max_selected_items: 20 });
    expect((await pickedRowsOf(t)).map(({ name }) => name)).toEqual(names.slice(0, 20));
  }, 60_000);

  waitsOn(reachedByTheStore, "a custom emoji with an 80-character name keeps every Slack label within Slack's limits", async () => {
    const long = `ship_${"a".repeat(75)}`;
    const t = await workspaceDeciding(...everyoneDeciding);
    slack.withCustomEmoji(long, shipitArt);
    await syncCustomEmojiNow(t);
    await aliceOpensCoinsWith(t, 100);
    await openAdmin(t, "U_DANA");

    const [option] = await suggestedOptions(t, "U_DANA", "ship_");
    await send(t, blockActions("U_DANA", stalePicksOf(picker, long)));
    await openInventory(t, "U_ALICE");
    const buy = accessoryBeside("U_ALICE", `:${long}: · 100 🪙`);
    await send(t, blockActions("U_ALICE", { type: "button", action_id: String(buy.action_id), value: String(buy.value) }));

    expect(option).toEqual({ text: { type: "plain_text", text: `:${long.slice(0, 73)}…` }, value: long });
    expect(String(buy.accessibility_label).length).toBeLessThanOrEqual(75);
    expect((buy.confirm as { title: { text: string } }).title.text.length).toBeLessThanOrEqual(100);
    expect(await coinsOf(t, "U_ALICE")).toBe(0);
  }, 60_000);

  waitsOn(reachedByTheStore, "a name that isn't one of the workspace's custom emoji is not picked", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await openAdmin(t, "U_DANA");

    await send(t, blockActions("U_DANA", stalePicksOf(picker, "rocket", "nothere", "shipit")));

    expect((await pickedRowsOf(t)).map(({ name }) => name)).toEqual(["shipit"]);
  }, 60_000);
});

describe("an admin picks Slack's standard emoji as kudos emoji behind standard-emoji", () => {
  waitsOn(reachedByTheStore, "the picker finds Slack's standard emoji after the workspace's custom ones, never one of the catalogue's, and a picked one sells and gives kudos like a custom emoji", async () => {
    const t = await workspaceDeciding(...everyoneDeciding, onForEveryone("standard-emoji"));
    await aliceOpensCoinsWith(t, 100);
    await openAdmin(t, "U_DANA");

    expect(adminSection(publishedHome(slack, "U_DANA"))).toEqual(["section: *Custom kudos emoji*", "section: Pick Slack emoji members can buy as kudos emoji for 100 🪙. [multi_external_select: none]"]);
    expect(accessoryBeside("U_DANA", "Pick Slack emoji members can buy as kudos emoji for 100 🪙.").placeholder).toEqual({ type: "plain_text", text: "Search Slack emoji" });
    expect((await suggested(t, "U_DANA", "s")).slice(0, 2)).toEqual([":shipit:", ":sa:"]);
    expect(await suggested(t, "U_DANA", "thumbs")).toEqual([":-1:", ":+1:"]);
    expect(await suggested(t, "U_DANA", "rock")).toEqual([":rock:"]);

    await send(t, blockActions("U_DANA", stalePicksOf(picker, "tada", "thumbsup", "rocket", "hedgehog")));
    expect((await pickedRowsOf(t)).map(({ name, url }) => ({ name, url }))).toEqual([{ name: "tada", url: standardPicture("1f389") }]);

    await openInventory(t, "U_ALICE");
    await send(t, blockActions("U_ALICE", buyButtonBeside(":tada: · 100 🪙")));
    expect(await coinsOf(t, "U_ALICE")).toBe(0);
    await giveKudos(t, "U_ALICE", ["U_BOB"], saysWhy, ["tada"]);

    expect((await kudosGivenEvents(t)).at(-1)).toMatchObject({ kudosEmoji: "tada", ownedEmoji: ["tada"], awards: [{ kudos: 1 }] });
  }, 60_000);

  waitsOn(reachedByTheStore, "with standard-emoji off, the picker says custom emoji, finds no standard one, and a stale pick of one picks nothing", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await openAdmin(t, "U_DANA");

    expect(accessoryBeside("U_DANA", "Pick custom emoji members can buy as kudos emoji for 100 🪙.").placeholder).toEqual({ type: "plain_text", text: "Search custom emoji" });
    expect(await suggested(t, "U_DANA", "s")).toEqual([":shipit:"]);
    await send(t, blockActions("U_DANA", stalePicksOf(picker, "tada", "shipit")));

    expect((await pickedRowsOf(t)).map(({ name }) => name)).toEqual(["shipit"]);
  }, 60_000);
});

describe("ST31: only an admin who sees the picker picks custom kudos emoji", () => {
  waitsOn(reachedByTheStore, "a non-admin's setCustomKudosEmoji changes nothing, and their picker search finds nothing", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await aliceOpensCoinsWith(t, 100);

    await send(t, blockActions("U_ALICE", stalePicksOf(picker, "shipit")));

    expect(await customRowsOf(t)).toEqual([]);
    expect(await suggested(t, "U_ALICE", "ship")).toEqual([]);
    await openInventory(t, "U_ALICE");
    expect(publishedHome(slack, "U_ALICE").join("\n")).not.toContain("shipit");
  }, 60_000);

  for (const [what, definitions] of [
    ["custom-kudos-emoji off for the admin", [...storeOn, offForEveryone("custom-kudos-emoji")]],
    ["custom-kudos-emoji not created", storeOn],
    ["the store off for the admin", [onForEveryone("xp-levels"), onForEveryone("unlocks"), onForEveryone("coins"), offForEveryone("store"), onForEveryone("custom-kudos-emoji")]],
  ] satisfies Array<[string, FlagDefinition[]]>) {
    waitsOn(reachedByTheStore, `with ${what}, the Admin tab has no picker, a stale pick changes nothing and the search finds nothing`, async () => {
      const t = await workspaceDeciding(...definitions);

      await openAdmin(t, "U_DANA");
      await send(t, blockActions("U_DANA", stalePicksOf(picker, "shipit")));

      expect(publishedHome(slack, "U_DANA").join("\n")).not.toContain("Custom kudos emoji");
      expect(await customRowsOf(t)).toEqual([]);
      expect(await suggested(t, "U_DANA", "ship")).toEqual([]);
    }, 60_000);
  }
});

describe("ST33: unpicking takes a custom emoji off sale and nothing from its owners", () => {
  waitsOn(reachedByTheStore, "after unpicking :shipit:, it leaves the store, and Alice keeps it among her kudos emoji, where it still counts", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await aliceOpensCoinsWith(t, 100);
    await openAdmin(t, "U_DANA");
    await send(t, blockActions("U_DANA", externalPicksInHome(slack, "U_DANA", "shipit", "partyparrot")));
    await openInventory(t, "U_ALICE");
    await send(t, blockActions("U_ALICE", buyButtonBeside(":shipit: · 100 🪙")));

    await send(t, blockActions("U_DANA", externalPicksInHome(slack, "U_DANA", "partyparrot")));
    await send(t, blockActions("U_ALICE", buttonInHome(slack, "U_ALICE", "Inventory")));
    await giveKudos(t, "U_ALICE", ["U_BOB"], saysWhy, ["shipit"]);

    const home = publishedHome(slack, "U_ALICE");
    expect(home).toContain("section: :shipit:");
    expect(home.at(-1)).toBe("section: :partyparrot: · 100 🪙 [button: Buy]");
    expect(home.filter((line) => line.includes("· 100 🪙")).join("\n")).not.toContain(":shipit:");
    expect((await kudosGivenEvents(t)).at(-1)).toMatchObject({ kudosEmoji: "shipit", ownedEmoji: ["shipit"], awards: [{ kudos: 1 }] });
  }, 60_000);

  waitsOn(reachedByTheStore, "a stale Buy of an unpicked emoji says it isn't for sale, by its name, and spends nothing", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await aliceOpensCoinsWith(t, 100);
    await openAdmin(t, "U_DANA");
    await send(t, blockActions("U_DANA", externalPicksInHome(slack, "U_DANA", "shipit")));
    await send(t, blockActions("U_DANA", externalPicksInHome(slack, "U_DANA")));
    await openInventory(t, "U_ALICE");

    await send(t, blockActions("U_ALICE", staleButtonOf({ type: "buyItem", item: shipit })));

    expect(publishedHome(slack, "U_ALICE").at(-1)).toBe("context: :shipit: isn't for sale.");
    expect(await coinsOf(t, "U_ALICE")).toBe(100);
  }, 60_000);
});

describe("ST32: a custom item's art follows Slack's list", () => {
  waitsOn(reachedByTheStore, "inventoryOf lists a picked emoji with its custom art, refreshed when an admin opens the Admin tab after the emoji was remade", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await aliceOpensCoinsWith(t, 100);
    await openAdmin(t, "U_DANA");
    await send(t, blockActions("U_DANA", externalPicksInHome(slack, "U_DANA", "shipit")));
    const alice = await memberOf(t, "U_ALICE");
    expect((await inventoryOf(t, alice))?.catalogue.at(-1)).toEqual({
      item: shipit,
      kind: "kudosEmoji",
      name: ":shipit:",
      emoji: "shipit",
      art: { kind: "custom", url: shipitArt },
      source: { kind: "store", price: 100 },
      onSale: true,
    });

    slack.withCustomEmoji("shipit", remadeShipitArt);
    await syncCustomEmojiNow(t);
    await openAdmin(t, "U_DANA");

    expect((await inventoryOf(t, alice))?.catalogue.at(-1)?.art).toEqual({ kind: "custom", url: remadeShipitArt });
  }, 60_000);
});

describe("ST34: without emoji:read the picker asks for a reinstall", () => {
  waitsOn(reachedByTheStore, "the Admin tab says ST34's line instead of the picker, and nothing else in it changes", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await openAdmin(t, "U_DANA");
    const withScope = publishedHome(slack, "U_DANA");

    slack.answering("emoji.list", slackError("missing_scope"));
    await syncCustomEmojiNow(t);
    await send(t, blockActions("U_DANA", buttonInHome(slack, "U_DANA", "Admin")));

    const withoutScope = publishedHome(slack, "U_DANA");
    expect(adminSection(withoutScope)).toEqual(["section: *Custom kudos emoji*", `section: ${reinstall}`]);
    expect(withoutScope.filter((line) => !adminSection(withoutScope).includes(line))).toEqual(withScope.filter((line) => !adminSection(withScope).includes(line)));
  }, 60_000);

  waitsOn(reachedByTheStore, "a picker left open while the scope goes missing keeps the workspace's picks", async () => {
    const t = await workspaceDeciding(...everyoneDeciding);
    await openAdmin(t, "U_DANA");
    await send(t, blockActions("U_DANA", stalePicksOf(picker, "shipit")));

    slack.answering("emoji.list", slackError("missing_scope"));
    await syncCustomEmojiNow(t);
    await send(t, blockActions("U_DANA", stalePicksOf(picker, "shipit", "partyparrot")));

    expect((await pickedRowsOf(t)).map(({ name }) => name)).toEqual(["shipit"]);
  }, 60_000);
});

describe("ST35: custom-kudos-emoji is the member's own decision", () => {
  waitsOn(reachedByTheStore, "where it is off for Alice, her :shipit: is hidden and claims nothing, and it comes back when it is on again", async () => {
    const t = await workspaceDeciding(...storeOn, onForEmails("custom-kudos-emoji", "dana@example.com", "alice@example.com"));
    await aliceOpensCoinsWith(t, 100);
    await openAdmin(t, "U_DANA");
    await send(t, blockActions("U_DANA", externalPicksInHome(slack, "U_DANA", "shipit")));
    await openInventory(t, "U_ALICE");
    await send(t, blockActions("U_ALICE", buyButtonBeside(":shipit: · 100 🪙")));

    await flagsLoaded(t, ...storeOn, onForEmails("custom-kudos-emoji", "dana@example.com"));
    await send(t, blockActions("U_ALICE", buttonInHome(slack, "U_ALICE", "Inventory")));
    const before = (await kudosGivenEvents(t)).length;
    await giveKudos(t, "U_ALICE", ["U_BOB"], saysWhy, ["shipit"]);

    expect(publishedHome(slack, "U_ALICE").join("\n")).not.toContain("shipit");
    expect(await kudosGivenEvents(t)).toHaveLength(before);
    expect((await inventoryOf(t, await memberOf(t, "U_ALICE")))?.catalogue.map(({ item }) => item)).not.toContain(shipit);

    await flagsLoaded(t, ...storeOn, onForEmails("custom-kudos-emoji", "dana@example.com", "alice@example.com"));
    await send(t, blockActions("U_ALICE", buttonInHome(slack, "U_ALICE", "Inventory")));
    expect(publishedHome(slack, "U_ALICE")).toContain("section: :shipit:");
  }, 60_000);

  waitsOn(reachedByTheStore, "an admin previewing alone can pick and buy, and nobody else sees a custom item", async () => {
    const t = await workspaceDeciding(...storeOn, onForEmails("custom-kudos-emoji", "dana@example.com"));
    await aliceOpensCoinsWith(t, 100);
    await openAdmin(t, "U_DANA");
    await send(t, blockActions("U_DANA", externalPicksInHome(slack, "U_DANA", "shipit")));

    await openInventory(t, "U_ALICE");
    await send(t, blockActions("U_ALICE", staleButtonOf({ type: "buyItem", item: shipit })));

    expect(publishedHome(slack, "U_ALICE").join("\n")).not.toContain(":shipit: ·");
    expect(publishedHome(slack, "U_ALICE").at(-1)).toBe("context: It isn't for sale.");
    expect(await coinsOf(t, "U_ALICE")).toBe(100);
    expect(externalPickerInHome(slack, "U_DANA")).toBeDefined();
  }, 60_000);
});

async function workspaceDeciding(...definitions: FlagDefinition[]) {
  const t = backend();
  slack = t.slack
    .withMember("U_DANA", { is_admin: true, profile: { email: "dana@example.com" } })
    .withMember("U_ALICE", { profile: { email: "alice@example.com" } })
    .withMember("U_BOB", { profile: { email: "bob@example.com" } })
    .withCustomEmoji("shipit", shipitArt)
    .withCustomEmoji("ship", "alias:shipit")
    .withCustomEmoji("partyparrot", partyArt);
  sentMessages = 0;
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 10 });
  await syncCustomEmojiNow(t);
  return unlocksShippedBeforeAnyoneJoined(await flagsLoaded(t, ...definitions));
}

async function aliceOpensCoinsWith(t: TestBackend, coins: number) {
  await giveKudos(t, "U_ALICE", ["U_BOB"], saysWhy);
  await xpOf(t, "U_ALICE", xpBelowLevelSix);
  await giveKudos(t, "U_ALICE", ["U_BOB"], saysWhy);
  await send(t, blockActions("U_ALICE", staleButtonOf({ type: "openUnlock", feature: "coins" })));
  const member = await memberOf(t, "U_ALICE");
  const top = coins - (await t.query((ctx) => balanceOf(ctx, member)));
  await t.run((ctx) => recordReward(ctx, "T1", { member, key: "test:savings", xp: 0, coins: top, item: null, catalogueVersion: "2", at: Date.now() }));
  await settle(t);
}

async function giveKudos(t: TestBackend, giver: string, recipients: string[], words: string, emojiNames = ["taco"]) {
  sentMessages += 1;
  const blocks = [section(...recipients.flatMap((recipient) => [mention(recipient), text(" ")]), text(`${words} `), ...emojiNames.map((name) => emoji(name)))];
  await post(t, blocks, { user: giver, ts: `${Math.floor(Date.now() / 1000) + sentMessages}.000100` });
  await settle(t);
}

async function openAdmin(t: TestBackend, user: string) {
  await homeOpened(t, user);
  await settle(t);
  await send(t, blockActions(user, buttonInHome(slack, user, "Admin")));
}

async function openInventory(t: TestBackend, user: string) {
  await homeOpened(t, user);
  await settle(t);
  await send(t, blockActions(user, buttonInHome(slack, user, "Inventory")));
}

async function send(t: TestBackend, interaction: string) {
  const response = await clicked(t, interaction);
  expect(response.status).toBe(200);
  await settle(t);
}

async function suggested(t: TestBackend, user: string, typed: string): Promise<string[]> {
  return (await suggestedOptions(t, user, typed)).map(({ text }) => text.text);
}

async function suggestedOptions(t: TestBackend, user: string, typed: string) {
  const response = await searched(t, user, typed);
  expect(response.status).toBe(200);
  const { options } = (await response.json()) as { options: Array<{ text: { type: string; text: string }; value: string }> };
  return options;
}

function adminSection(home: string[]) {
  const start = home.indexOf("section: *Custom kudos emoji*");
  return start < 0 ? [] : home.slice(start, start + 2);
}

function accessoryBeside(user: string, line: string) {
  const block = publishedHomeBlocks(slack, user).find((each) => each.text?.text === line);
  expect(block?.accessory, `an accessory beside ${line}`).toBeDefined();
  return block!.accessory as Record<string, unknown>;
}

function buyButtonBeside(line: string) {
  const block = publishedHomeBlocks(slack, "U_ALICE").find((each) => each.text?.text === line);
  expect(block?.accessory, `a Buy button beside ${line}`).toBeDefined();
  return { type: "button" as const, action_id: String(block!.accessory!.action_id), value: String(block!.accessory!.value) };
}

async function memberOf(t: TestBackend, user: string): Promise<MemberId> {
  return (await memberOrNullOf(t, user))!;
}

async function xpOf(t: TestBackend, user: string, xp: number) {
  const member = await memberOf(t, user);
  const progress = (await t.seed.all("memberProgress")).filter((row) => row.member === member);
  if (progress.length > 1) throw new Error("unique() query returned more than one result from table memberProgress:");
  await t.seed.patch("memberProgress", progress[0]!._id, { xp });
}

async function coinsOf(t: TestBackend, user: string) {
  const member = await memberOf(t, user);
  return t.query((ctx) => balanceOf(ctx, member));
}

/** Today's `internal.store.inventory.inventoryOf`, which answered `visibleInventoryOf`. */
function inventoryOf(t: TestBackend, member: MemberId) {
  return t.query((ctx) => visibleInventoryOf(ctx, member));
}

async function customRowsOf(t: TestBackend) {
  return t.seed.all("customKudosEmoji");
}

async function pickedRowsOf(t: TestBackend) {
  const rows = await customRowsOf(t);
  return rows
    .filter(({ unpickedAt }) => unpickedAt === undefined)
    .map(({ name, url, pickedAt }) => ({ name, url, pickedAt }))
    .toSorted((first, second) => first.name.localeCompare(second.name));
}

/** Today's read of the scheduled `recordKudosGiven` jobs: the `kudosGiven` events committed operations published. */
async function kudosGivenEvents(t: TestBackend): Promise<Array<Omit<KudosGivenEvent, "fact">>> {
  return factsOf(t, "kudosGiven");
}
