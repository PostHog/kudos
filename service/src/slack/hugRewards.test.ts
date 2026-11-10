import { and, eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import type { TestBackend } from "../../testing/backend.ts";
import { offForEveryone, onForEmails, onForEveryone } from "../../testing/flags.ts";
import { emoji, mention, section } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { flagExposures, type Doc } from "../db/schema/index.ts";
import { flagsLoaded, flagsOn, hourMs, memberOf, moveTo, post, reachedByAHug, react, setWorkspaceSettings, settle, useHugsBackend, xpOf } from "./hugsTesting.ts";

const now = new Date("2026-10-13T09:00:00Z");
const carolsEmail = "carol@example.com";
const sundayEveningInKiritimati = new Date("2026-10-18T09:00:00Z").getTime();

const backend = useHugsBackend(now);

describe("HH32: the first hug given each day pays 10 XP in all", () => {
  waitsOn(reachedByAHug, "Bob's first hug today pays him 10 XP, and his second that day 1 XP more", async () => {
    const t = await workspace();

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts: messageAgo(1) });
    await hug(t, { user: "U_BOB", itemUser: "U_DANA", ts: messageAgo(2) });

    expect(await xpOf(t, "U_BOB")).toBe(11);
  });

  waitsOn(reachedByAHug, "the day is the giver's own: Carol's hugs either side of midnight in Kiritimati each pay the day bonus", async () => {
    const t = await workspace();

    await hug(t, { user: "U_CAROL", itemUser: "U_ALICE", ts: messageAgo(1) });
    moveTo(t, now.getTime() + 2 * hourMs);
    await hug(t, { user: "U_CAROL", itemUser: "U_DANA", ts: messageAgo(1) });

    expect(await xpOf(t, "U_CAROL")).toBe(20);
  });
});

describe("HH33: the first hug received each week pays 5 XP in all", () => {
  waitsOn(reachedByAHug, "Alice's first hug this week pays her 5 XP, and a second from someone else 1 XP more", async () => {
    const t = await workspace();
    const ts = messageAgo(1);

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts });
    await hug(t, { user: "U_DANA", itemUser: "U_ALICE", ts });

    expect(await xpOf(t, "U_ALICE")).toBe(6);
  });

  waitsOn(reachedByAHug, "the week is the person's own: Carol's first hug either side of Monday in Kiritimati each pay the week bonus", async () => {
    vi.setSystemTime(sundayEveningInKiritimati);
    const t = await workspace();

    await hug(t, { user: "U_BOB", itemUser: "U_CAROL", ts: messageAgo(1) });
    moveTo(t, sundayEveningInKiritimati + 2 * hourMs);
    await hug(t, { user: "U_DANA", itemUser: "U_CAROL", ts: messageAgo(1) });
    await hug(t, { user: "U_ALICE", itemUser: "U_CAROL", ts: messageAgo(1) });

    expect(await xpOf(t, "U_CAROL")).toBe(11);
  });
});

describe("HH34: the bonuses follow hug-rewards at the hug", () => {
  waitsOn(reachedByAHug, "while hug-rewards is off, every hug pays 1 XP to the giver and to the hugged, as before", async () => {
    const t = await workspace();
    await flagsLoaded(t, onForEveryone("hugs"), offForEveryone("hug-rewards"));
    const ts = messageAgo(1);

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts });
    await hug(t, { user: "U_BOB", itemUser: "U_DANA", ts: messageAgo(2) });
    await hug(t, { user: "U_DANA", itemUser: "U_ALICE", ts });

    expect({ bob: await xpOf(t, "U_BOB"), alice: await xpOf(t, "U_ALICE") }).toEqual({ bob: 2, alice: 2 });
  });

  waitsOn(reachedByAHug, "each member's own decision counts: with hug-rewards on for Carol alone, Bob's hug on Alice's kudos to Carol and Dana pays only Carol a bonus", async () => {
    const t = await workspace();
    await flagsLoaded(t, onForEveryone("hugs"), onForEmails("hug-rewards", carolsEmail));
    const ts = messageAgo(1);
    await post(t, [section(mention("U_CAROL"), mention("U_DANA"), emoji("taco"))], { user: "U_ALICE", ts });
    await settle(t);
    const before = { bob: await xpOf(t, "U_BOB"), carol: await xpOf(t, "U_CAROL"), dana: await xpOf(t, "U_DANA") };

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts });

    expect({ bob: (await xpOf(t, "U_BOB")) - before.bob, carol: (await xpOf(t, "U_CAROL")) - before.carol, dana: (await xpOf(t, "U_DANA")) - before.dana }).toEqual({ bob: 1, carol: 5, dana: 1 });
    expect({ bob: await hugRewardsExposuresOf(t, "U_BOB"), carol: await hugRewardsExposuresOf(t, "U_CAROL"), dana: await hugRewardsExposuresOf(t, "U_DANA") }).toEqual({
      bob: [false],
      carol: [true],
      dana: [false],
    });
  });

  waitsOn(reachedByAHug, "the giver and each hugged person are exposed to hug-rewards at the hug", async () => {
    const t = await workspace();

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts: messageAgo(1) });

    expect({ bob: await hugRewardsExposuresOf(t, "U_BOB"), alice: await hugRewardsExposuresOf(t, "U_ALICE") }).toEqual({ bob: [true], alice: [true] });
  });
});

async function workspace() {
  const t = backend();
  t.slack.withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL", { tz: "Pacific/Kiritimati", profile: { email: carolsEmail } }).withMember("U_DANA");
  await setWorkspaceSettings(t, { kudosEmoji: "taco" });
  return flagsOn(t, ["hugs", "hug-rewards"]);
}

async function hug(t: TestBackend, options: { user: string; itemUser: string; ts: string }) {
  await react(t, options);
  await settle(t);
}

function messageAgo(hours: number) {
  return `${Math.floor((Date.now() - hours * hourMs) / 1000)}.000100`;
}

const exposureByMemberFlagValue = indexOrder(flagExposures, ["member", "flag", "value"]);

async function hugRewardsExposuresOf(t: TestBackend, user: string) {
  const member = await memberOf(t, user);
  if (member === null) return [];
  const rows = await t.query(({ tx }) =>
    tx
      .select()
      .from(flagExposures)
      .where(and(eq(flagExposures.member, member), eq(flagExposures.flag, "hug-rewards")))
      .orderBy(...exposureByMemberFlagValue.orderBy())
      .limit(2),
  );
  return rows.map((row) => toDocument<Doc<"flagExposures">>(flagExposures, row).value);
}
