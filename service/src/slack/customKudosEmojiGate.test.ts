// Today's convex/slack/customKudosEmojiGate.test.ts. Each walk starts with the custom emoji sync, which writes through
// S3's directory, then opens the App Home, picks, buys and gives kudos, so every test waits on the stacks those reach.
import { describe, expect, vi } from "vitest";
import type { TestBackend } from "../../testing/backend.ts";
import type { FakePostHog, FlagDefinition } from "../../testing/fakePostHog.ts";
import type { FakeSlack, SlackCall } from "../../testing/fakeSlack.ts";
import { offForEveryone, onForEmails, onForEveryone } from "../../testing/flags.ts";
import { blockActions, publishedHome, publishedHomeBlocks, readBlocks, staleButtonOf, stalePicksOf, type Block } from "../../testing/slackInteractions.ts";
import { emoji, mention, section, text } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { KudosGivenEvent } from "../bus/events.ts";
import { recordReward } from "../progression/progression.ts";
import { visibleInventoryOf } from "../store/inventory.ts";
import { balanceOf } from "../wallet/wallet.ts";
import type { MemberId } from "../workspace/directory.ts";
import { clicked, homeOpened, reachedByTheStore, searched, startedOver, syncCustomEmojiNow } from "./customKudosEmojiTesting.ts";
import { factsOf, flagsLoaded, memberOf as memberOrNullOf, moveTo, post, settle, unlocksShippedBeforeAnyoneJoined, useHugsBackend } from "./hugsTesting.ts";

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const dayMs = 24 * 60 * 60 * 1000;
const saysWhy = "thanks for untangling the release notes today";
const customKudosEmoji = "custom-kudos-emoji";
const danasEmail = "dana@example.com";
const shipit = "custom:shipit";
const partyparrot = "custom:partyparrot";
const picker = "setCustomKudosEmoji";
const xpBelowLevelSix = 990;
const savedUp = 300;

const storeOnFor = (...emails: string[]) => [onForEveryone("xp-levels"), onForEveryone("unlocks"), onForEveryone("coins"), emails.length === 0 ? onForEveryone("store") : onForEmails("store", ...emails)];
const storeOn = storeOnFor();
const onForEveryoneDeciding = [...storeOn, onForEveryone(customKudosEmoji)];
const previewedByDana = [...storeOn, onForEmails(customKudosEmoji, danasEmail)];
const customOff = [...storeOn, offForEveryone(customKudosEmoji)];
const storeOffForAliceAndBob = [...storeOnFor(danasEmail), onForEveryone(customKudosEmoji)];
const coinsOffForAliceAndBob = [onForEveryone("xp-levels"), onForEveryone("unlocks"), onForEmails("coins", danasEmail), onForEveryone("store"), onForEveryone(customKudosEmoji)];

const friendOf: Record<string, string> = { U_ALICE: "U_BOB", U_DANA: "U_FRANK", U_BOB: "U_ALICE" };

const backend = useHugsBackend(new Date(tuesday));
let slack: FakeSlack;
let postHog: FakePostHog;
let sentMessages = 0;

describe("ST35 O36: custom kudos emoji are dark wherever custom-kudos-emoji isn't on for the member, and its exposure goes once per member and value", () => {
  for (const [what, definitions, flagsKeySet] of [
    ["off", customOff, true],
    ["not created", storeOn, true],
    ["on but the flags key missing", onForEveryoneDeciding, false],
  ] satisfies Array<[string, FlagDefinition[], boolean]>) {
    waitsOn(reachedByTheStore, `with custom-kudos-emoji ${what} after Alice bought :shipit:, no picker, no custom item and no claim reach Slack or inventoryOf, nothing is picked or bought, and it all returns when it is on again`, async () => {
      const t = await workspaceDeciding(...onForEveryoneDeciding);
      await danaPicksAndAliceBuysShipit(t);
      const shown = await customSideOf(t, "U_ALICE");
      const stored = await storeStateOf(t);
      const before = slack.calls.length;
      const flagsKey = process.env.POSTHOG_PERSONAL_API_KEY!;

      await flagsLoaded(t, ...definitions);
      if (!flagsKeySet) vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");
      const { claimed, searched } = await walkEveryCustomPath(t);

      expect(slack.calls.slice(before).flatMap(readCall).filter(namesCustomEmoji)).toEqual([]);
      expect(searched).toEqual({ U_DANA: [], U_ERIN: [] });
      expect(claimed).toEqual([]);
      expect(await customItemsInInventoryOf(t, "U_ALICE")).toEqual(flagsKeySet ? [] : null);
      expect(await customItemsInInventoryOf(t, "U_BOB")).toEqual(flagsKeySet ? [] : null);
      expect(await storeStateOf(t)).toEqual(stored);

      vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
      await flagsLoaded(t, ...onForEveryoneDeciding);
      expect(await customSideOf(t, "U_ALICE")).toEqual(shown);
    }, 120_000);
  }

  for (const [what, definitions] of [
    ["store off", storeOffForAliceAndBob],
    ["coins off", coinsOffForAliceAndBob],
  ] satisfies Array<[string, FlagDefinition[]]>) {
    waitsOn(reachedByTheStore, `with custom-kudos-emoji on but ${what} for Alice, Bob and the admin Erin, they see no picker and no custom item, her :shipit: still gives kudos and Bob's doesn't, their stale clicks pick and buy nothing, and no new custom-kudos-emoji exposure is sent for them`, async () => {
      const t = await workspaceDeciding(...onForEveryoneDeciding);
      await danaPicksAndAliceBuysShipit(t);
      const exposed = { alice: await exposuresOf(t, "U_ALICE"), bob: await exposuresOf(t, "U_BOB") };
      const stored = await storeStateOf(t);
      const before = slack.calls.length;

      await flagsLoaded(t, ...definitions);
      const { claimed, searched } = await walkEveryCustomPath(t);

      expect(["U_ALICE", "U_BOB", "U_ERIN"].flatMap((user) => slackCallsAbout(user, before)).flatMap(readCall).filter(namesCustomEmoji)).toEqual([]);
      expect(searched.U_ERIN).toEqual([]);
      expect(claimed).toMatchObject([{ kudosEmoji: "shipit", ownedEmoji: ["shipit"], awards: [{ kudos: 1 }] }]);
      expect(await customItemsInInventoryOf(t, "U_ALICE")).toBeNull();
      expect(await customItemsInInventoryOf(t, "U_BOB")).toBeNull();
      expect(withoutBalances(await storeStateOf(t)), "nothing picked, bought or spent; her kudos still credits coins").toEqual(withoutBalances(stored));
      expect({ alice: await exposuresOf(t, "U_ALICE"), bob: await exposuresOf(t, "U_BOB"), erin: await exposuresOf(t, "U_ERIN") }).toEqual({ ...exposed, erin: [] });
    }, 120_000);
  }

  waitsOn(reachedByTheStore, "with custom-kudos-emoji on for Dana's email only, she picks, buys and thanks Frank with :shipit:, and nobody else sees or claims it: Alice's, Bob's and the other admin Erin's distinct Slack calls and kudos equal those with it off, and nothing public names where her emoji came from", async () => {
    const whilePreviewed = await othersSideOfDanasWalk(previewedByDana);
    vi.setSystemTime(tuesday);
    const whileOff = await othersSideOfDanasWalk(customOff);

    expect(whilePreviewed.danaThanked).toMatchObject({ kudosEmoji: "shipit", ownedEmoji: ["shipit"], awards: [{ kudos: 1 }] });
    expect(whilePreviewed.danaBought).toEqual([{ kind: "bought", item: shipit }]);
    expect(whilePreviewed.told.filter(namesCustomEmoji)).toEqual([]);
    expect(whilePreviewed.saidInPublic.filter(namesTheSource)).toEqual([]);
    expect(whilePreviewed.calls).toEqual(whileOff.calls);
    expect(whilePreviewed.kudos).toEqual(whileOff.kudos);
    expect(whilePreviewed.aliceInventory).toEqual(whileOff.aliceInventory);
    expect(whileOff.danaThanked).toBeUndefined();
    expect(whileOff.danaBought).toEqual([]);
  }, 120_000);

  waitsOn(reachedByTheStore, "O36 F25: the custom-kudos-emoji exposure goes once per member and value, again for a value that changed, and never for a member the store isn't shown to", async () => {
    const t = await workspaceDeciding(...[...storeOnFor(danasEmail, "alice@example.com"), onForEmails(customKudosEmoji, danasEmail)]);
    await opensCoinsWith(t, "U_ALICE", 100);
    await danaPicksAndBuys(t);
    await walkEveryCustomPath(t);
    await walkEveryCustomPath(t);

    expect(await exposuresOf(t, "U_DANA")).toEqual([true]);
    expect(await exposuresOf(t, "U_ALICE")).toEqual([false]);
    expect(await exposuresOf(t, "U_BOB")).toEqual([]);
    expect(await exposuresOf(t, "U_ERIN")).toEqual([]);

    await flagsLoaded(t, ...[...storeOnFor(danasEmail, "alice@example.com"), onForEmails(customKudosEmoji, danasEmail, "alice@example.com")]);
    // Today's `vi.setSystemTime(tuesday + dayMs)`; the app's clock only moves forward.
    moveTo(t, tuesday + dayMs);
    await walkEveryCustomPath(t);
    await walkEveryCustomPath(t);

    expect(await exposuresOf(t, "U_DANA")).toEqual([true]);
    expect(await exposuresOf(t, "U_ALICE")).toEqual([false, true]);
    expect(await exposuresOf(t, "U_BOB")).toEqual([]);
    expect(await exposuresOf(t, "U_ERIN")).toEqual([]);
  }, 120_000);
});

async function danaPicksAndAliceBuysShipit(t: TestBackend) {
  await opensCoinsWith(t, "U_ALICE", 100);
  await opensCoinsWith(t, "U_BOB", 100);
  await openAdmin(t, "U_DANA");
  await send(t, blockActions("U_DANA", stalePicksOf(picker, "shipit", "partyparrot")));
  await openInventory(t, "U_ALICE");
  await click(t, "U_ALICE", { type: "buyItem", item: shipit });
  moveTo(t, t.clock.now() + dayMs);
}

async function danaPicksAndBuys(t: TestBackend) {
  await opensCoinsWith(t, "U_DANA", savedUp);
  await openAdmin(t, "U_DANA");
  await send(t, blockActions("U_DANA", stalePicksOf(picker, "shipit", "partyparrot")));
  await openInventory(t, "U_DANA");
  await click(t, "U_DANA", { type: "buyItem", item: shipit });
  moveTo(t, t.clock.now() + dayMs);
}

async function walkEveryCustomPath(t: TestBackend) {
  await openAdmin(t, "U_DANA");
  await openAdmin(t, "U_ERIN");
  const searched = { U_DANA: await suggested(t, "U_DANA", "ship"), U_ERIN: await suggested(t, "U_ERIN", "ship") };
  await send(t, blockActions("U_ERIN", stalePicksOf(picker, "shipit")));
  for (const user of ["U_ALICE", "U_BOB"]) {
    await openInventory(t, user);
    await click(t, user, { type: "buyItem", item: partyparrot });
  }
  const before = (await kudosGivenEvents(t)).length;
  await giveKudos(t, "U_ALICE", [friendOf.U_ALICE!], saysWhy, ["shipit"]);
  await giveKudos(t, "U_BOB", [friendOf.U_BOB!], saysWhy, ["shipit"]);
  await openInventory(t, "U_ALICE");
  return { searched, claimed: (await kudosGivenEvents(t)).slice(before) };
}

async function othersSideOfDanasWalk(definitions: FlagDefinition[]) {
  const t = await workspaceDeciding(...definitions);
  await opensCoinsWith(t, "U_ALICE", 100);
  await danaPicksAndBuys(t);
  await walkEveryCustomPath(t);
  const before = (await kudosGivenEvents(t)).length;
  await giveKudos(t, "U_DANA", [friendOf.U_DANA!], saysWhy, ["shipit"]);
  const calls = ["U_ALICE", "U_BOB", "U_ERIN"].flatMap((user) => slackCallsAbout(user));
  return {
    calls: [...new Set(calls.map((call) => JSON.stringify(withoutTimestamps(call))))].sort(),
    told: calls.flatMap(readCall),
    saidInPublic: slack.calls.filter(({ method, args }) => method !== "chat.postEphemeral" && String(args.channel).startsWith("C")).flatMap(readCall),
    kudos: [...(await kudosMessagesOf(t, "U_ALICE")), ...(await kudosMessagesOf(t, "U_BOB"))],
    aliceInventory: await inventoryOf(t, await memberOf(t, "U_ALICE")),
    danaThanked: (await kudosGivenEvents(t)).slice(before).at(0),
    danaBought: (await storeStateOf(t)).bought.map(({ outcome }) => outcome),
  };
}

async function customSideOf(t: TestBackend, user: string) {
  await openInventory(t, user);
  return { home: publishedHome(slack, user).filter(namesCustomEmoji), inventory: await customItemsInInventoryOf(t, user) };
}

async function workspaceDeciding(...definitions: FlagDefinition[]) {
  const t = backend();
  // One test walks two workspaces, each on an empty database as today's `testBackend()` started.
  await startedOver(t);
  slack = t.slack
    .withMember("U_DANA", { is_admin: true, profile: { email: danasEmail } })
    .withMember("U_ERIN", { is_admin: true, profile: { email: "erin@example.com" } })
    .withMember("U_ALICE", { profile: { email: "alice@example.com" } })
    .withMember("U_BOB", { profile: { email: "bob@example.com" } })
    .withMember("U_FRANK", { profile: { email: "frank@example.com" } })
    .withCustomEmoji("shipit", "https://emoji.slack-edge.com/T1/shipit/0a1b2c.png")
    .withCustomEmoji("ship", "alias:shipit")
    .withCustomEmoji("partyparrot", "https://emoji.slack-edge.com/T1/partyparrot/3c4d5e.gif");
  postHog = t.postHog;
  sentMessages = 0;
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 10 });
  await syncCustomEmojiNow(t);
  return unlocksShippedBeforeAnyoneJoined(await flagsLoaded(t, ...definitions));
}

async function opensCoinsWith(t: TestBackend, user: string, coins: number) {
  await giveKudos(t, user, [friendOf[user]!], saysWhy);
  await xpOf(t, user, xpBelowLevelSix);
  await giveKudos(t, user, [friendOf[user]!], saysWhy);
  await click(t, user, { type: "openUnlock", feature: "coins" });
  const member = await memberOf(t, user);
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
  if (publishedHomeBlocks(slack, user).length > 0) await click(t, user, { type: "showHomeTab", tab: "admin" });
}

async function openInventory(t: TestBackend, user: string) {
  await homeOpened(t, user);
  await settle(t);
  await click(t, user, { type: "showHomeTab", tab: "inventory" });
}

async function click(t: TestBackend, user: string, command: unknown) {
  await send(t, blockActions(user, staleButtonOf(command)));
}

async function send(t: TestBackend, interaction: string) {
  const response = await clicked(t, interaction);
  expect(response.status).toBe(200);
  await settle(t);
}

async function suggested(t: TestBackend, user: string, typed: string): Promise<string[]> {
  const response = await searched(t, user, typed);
  expect(response.status).toBe(200);
  const { options } = (await response.json()) as { options: Array<{ text: { text: string } }> };
  return options.map(({ text }) => text.text);
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

/** Today's `internal.store.inventory.inventoryOf`, which answered `visibleInventoryOf`. */
function inventoryOf(t: TestBackend, member: MemberId) {
  return t.query((ctx) => visibleInventoryOf(ctx, member));
}

async function customItemsInInventoryOf(t: TestBackend, user: string) {
  const inventory = await inventoryOf(t, await memberOf(t, user));
  if (inventory === null) return null;
  const custom = (item: string | null) => item?.startsWith("custom:") === true;
  return [...inventory.owned.map(({ item }) => item), ...inventory.catalogue.map(({ item }) => item)].filter(custom);
}

async function storeStateOf(t: TestBackend) {
  return {
    customKudosEmoji: await t.seed.all("customKudosEmoji"),
    collection: await t.seed.all("collection"),
    bought: (await t.seed.all("itemPurchases")).filter(({ outcome }) => outcome.kind === "bought"),
    wallets: await t.seed.all("wallets"),
    coinSpends: await t.seed.all("coinSpends"),
  };
}

function withoutBalances({ wallets: _, ...state }: Awaited<ReturnType<typeof storeStateOf>>) {
  return state;
}

/** Today's read of the scheduled `recordKudosGiven` jobs: the `kudosGiven` events committed operations published. */
async function kudosGivenEvents(t: TestBackend): Promise<Array<Omit<KudosGivenEvent, "fact">>> {
  return factsOf(t, "kudosGiven");
}

async function kudosMessagesOf(t: TestBackend, user: string) {
  const member = await memberOf(t, user);
  const awards = (await t.seed.all("awards")).filter(({ giver }) => giver === member);
  return [...new Set(awards.map(({ message }) => message))].sort();
}

async function exposuresOf(t: TestBackend, user: string) {
  const member = await memberOf(t, user);
  const analyticsIds = (await t.seed.all("analyticsIds")).filter((row) => row.member === member);
  if (analyticsIds.length > 1) throw new Error("unique() query returned more than one result from table analyticsIds:");
  const analyticsId = analyticsIds[0]?.analyticsId;
  const sent = postHog.events().filter(({ event, distinct_id, properties }) => event === "$feature_flag_called" && distinct_id === analyticsId && properties.$feature_flag === customKudosEmoji);
  const once = [...new Map(sent.map((event) => [event.uuid, event])).values()];
  return once.map(({ properties }) => properties.$feature_flag_response);
}

function slackCallsAbout(user: string, from = 0) {
  return slack.calls.slice(from).filter(({ args }) => [args.channel, args.user, args.user_id].includes(user));
}

function readCall({ args }: SlackCall): string[] {
  const texts = [args.text, args.name, ...(Array.isArray(args.blocks) ? readBlocks(args.blocks as Block[]) : [])];
  const view = args.view as { blocks?: Block[] } | undefined;
  return [...texts, ...(view?.blocks === undefined ? [] : readBlocks(view.blocks))].filter((line): line is string => typeof line === "string");
}

function withoutTimestamps(call: SlackCall) {
  return JSON.parse(JSON.stringify(call).replace(/\d{10}\.\d{6}/g, "<ts>"));
}

function namesTheSource(line: string) {
  return /store|inventory|slot|bought|custom kudos emoji|🪙/i.test(line);
}

function namesCustomEmoji(line: string) {
  return /shipit|partyparrot|custom kudos emoji|custom emoji/i.test(line);
}
