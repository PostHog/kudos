import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, routedFetch } from "../../testing/fakePostHog";
import { FakeSlack } from "../../testing/fakeSlack";
import { deliverAgain, post, react, settle, type Backend } from "../../testing/slackBackend";
import { emoji, mention, section, text } from "../../testing/slackMessages";
import { aDeploymentForWorkspace, switchWebsite } from "../../testing/website";
import { testBackend } from "../../testing/slackBackend";
import type { MemberId } from "../workspace/directory";
import { recognitionsOf } from "./recognitions";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const week = "2026-10-12";
const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const carol = { user: "U_CAROL", name: "Carol Lindqvist" };
const todaysFlags = ["xp-levels", "album", "collection", "packs", "hidden-items", "onboarding", "hugs"];
const mondayPath = [...todaysFlags, "monday-quest"];

type Person = { user: string; name: string };

let postHog: FakePostHog;
let t: Backend;
let messages = 0;

beforeEach(async () => {
  vi.useFakeTimers({ now: tuesday });
  aDeploymentForWorkspace();
  postHog = new FakePostHog();
  const slack = new FakeSlack();
  for (const person of [alice, bob, carol]) slack.withMember(person.user, { real_name: person.name });
  vi.stubGlobal("fetch", routedFetch(postHog, slack.fetch));
  t = testBackend();
  await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("HH52: Quests counts recognition facts, one for each kudos and each hug", { timeout: 60_000 }, () => {
  test("a kudos to two people is one recognition naming both and its award count, and a hug on a message names its author with no kudos", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);

    const kudos = await thanks(bob, alice, carol);
    const hugged = await hugs(bob, alice);

    expect(await recognitionsBy(bob)).toEqual([
      { source: "kudos", workspace: "T1", giver: await memberOf(bob), people: [await memberOf(alice), await memberOf(carol)], kudos: 2, message: messageOf(kudos), day: "2026-10-13", at: atOf(kudos) },
      { source: "hug", workspace: "T1", giver: await memberOf(bob), people: [await memberOf(alice)], kudos: 0, message: messageOf(hugged), day: "2026-10-13", at: expect.any(Number) },
    ]);
  });

  test("a hug on a kudos message names nobody, since its people were already counted", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await thanks(carol, bob);

    const kudos = await thanks(alice, carol);
    await hugs(bob, alice, kudos);

    expect((await recognitionsBy(bob)).filter(({ source }) => source === "hug")).toEqual([
      { source: "hug", workspace: "T1", giver: await memberOf(bob), people: [], kudos: 0, message: messageOf(kudos), day: "2026-10-13", at: expect.any(Number) },
    ]);
  });

  test("HH18: each fact delivered twice is one recognition", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await thanks(bob, alice);
    await hugs(bob, alice);

    await deliverAgain(t, "quests/quests:followKudosGiven");
    await deliverAgain(t, "quests/quests:followHugGiven");

    expect((await recognitionsBy(bob)).map(({ source }) => source)).toEqual(["kudos", "hug"]);
  });

  test("off the Monday path Quests records no recognition", async () => {
    await switchWebsite(t, postHog, true, ...todaysFlags);

    await thanks(bob, alice);
    await hugs(bob, alice);

    expect(await recognitionsBy(bob)).toEqual([]);
  });

  test("a hug by a member whose quests haven't started records nothing, and the kudos that starts them is the first recognition", async () => {
    await switchWebsite(t, postHog, true, ...todaysFlags);
    await hugs(bob, alice);
    await switchWebsite(t, postHog, true, ...mondayPath);

    await hugs(bob, alice);
    await thanks(bob, alice);

    expect((await recognitionsBy(bob)).map(({ source }) => source)).toEqual(["kudos"]);
  });
});

async function thanks(giver: Person, ...recipients: Person[]) {
  vi.setSystemTime(Date.now() + minuteMs);
  const ts = tsOf(Date.now());
  await post(t, [section(text("thanks "), ...recipients.flatMap(({ user }) => [mention(user), text(" ")]), emoji("taco"))], { user: giver.user, ts });
  await settle(t);
  return ts;
}

async function hugs(giver: Person, author: Person, ts?: string) {
  vi.setSystemTime(Date.now() + minuteMs);
  const message = ts ?? tsOf(Date.now() - minuteMs / 2);
  await react(t, { user: giver.user, itemUser: author.user, ts: message });
  await settle(t);
  return message;
}

function tsOf(at: number) {
  messages += 1;
  return `${Math.floor(at / 1000)}.${String(messages).padStart(6, "0")}`;
}

function atOf(ts: string) {
  return Number(ts.split(".")[0]) * 1000;
}

function messageOf(ts: string) {
  return { workspace: "T1", conversation: "C1", message: ts };
}

async function recognitionsBy(person: Person) {
  const member = await memberOf(person);
  return t.run((ctx) => recognitionsOf(ctx, member, week));
}

async function memberOf(person: Person): Promise<MemberId> {
  const row = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("workspace", "T1").eq("user", person.user))
      .unique(),
  );
  return row!._id;
}
