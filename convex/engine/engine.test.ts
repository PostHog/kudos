import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DomainEvent } from "../bus/events";
import { publish } from "../bus/publish";
import { testBackend, type Backend } from "../../testing/slackBackend";
import { observe, recheck } from "./engine";
import type { Mention, MessageEvent } from "./messageEvent";

vi.mock("../bus/publish", () => ({ publish: vi.fn(async () => {}) }));

const now = new Date("2026-10-13T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.mocked(publish).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Given", () => {
  test("R4 R8 R11 R15 R18: one award per recipient with n kudos each, paid from the daily allowance", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC", U_CAROL: "UTC" });

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco"])));

    expect(observation).toMatchObject({ kind: "evaluated", outcome: { kind: "given", kudosEmoji: "taco", left: 1 } });
    expect(await awardsOf(t)).toEqual([
      { giver: "U_ALICE", recipient: "U_BOB", kudos: 1, day: "2026-10-13" },
      { giver: "U_ALICE", recipient: "U_CAROL", kudos: 1, day: "2026-10-13" },
    ]);
  });

  test("R4: every kudos emoji occurrence gives each recipient one more kudos, and the cost is recipients × n", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco", "taco", "taco"])));

    expect(observation).toMatchObject({ outcome: { kind: "given", left: 0 } });
    expect(await awardsOf(t)).toEqual([{ giver: "U_ALICE", recipient: "U_BOB", kudos: 3, day: "2026-10-13" }]);
  });

  test("R8: recipients are other members in the order they first appear, each receiving once", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC", U_CAROL: "UTC" });

    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_CAROL"), person("U_ALICE"), person("U_BOB"), person("U_CAROL")], ["taco"])));

    expect((await awardsOf(t)).map((award) => award.recipient)).toEqual(["U_CAROL", "U_BOB"]);
  });

  test("R15: a message costing more than the daily allowance left gives nothing and spends nothing", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC", U_CAROL: "UTC" });

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco", "taco"])));
    const after = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco", "taco", "taco"], { message: "2" })));

    expect(observation).toMatchObject({ outcome: { kind: "over-allowance", cost: 4, recipients: 2, perRecipient: 2, left: 3 } });
    expect(after).toMatchObject({ outcome: { kind: "given", left: 0 } });
    expect(await awardsOf(t)).toEqual([{ giver: "U_ALICE", recipient: "U_BOB", kudos: 3, day: "2026-10-13" }]);
  });

  test("R11: the daily allowance opens at the workspace base", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
    await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", baseAllowance: 5 }));

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco", "taco", "taco", "taco"])));

    expect(observation).toMatchObject({ outcome: { kind: "given", left: 1 } });
  });

  test("R10: a kudos message whose mentions are all skipped gives nothing", async () => {
    const t = await withDirectory({ U_ALICE: "UTC" });

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_ALICE"), { kind: "broadcast", range: "here" }], ["taco"])));

    expect(observation).toMatchObject({ outcome: { kind: "invalid" } });
    expect(await awardsOf(t)).toEqual([]);
  });
});

describe("R12 R13: the allowance day follows the giver's time zone", () => {
  test.each([
    ["east of UTC", "Asia/Tokyo", "2026-10-13T14:59:00Z", "2026-10-13"],
    ["east of UTC, after local midnight", "Asia/Tokyo", "2026-10-13T15:01:00Z", "2026-10-14"],
    ["west of UTC, before local midnight", "America/Los_Angeles", "2026-10-14T06:59:00Z", "2026-10-13"],
    ["without a time zone, in UTC", undefined, "2026-10-13T23:59:00Z", "2026-10-13"],
  ])("%s", async (_, timeZone, postedAt, day) => {
    const t = await withDirectory({ U_ALICE: timeZone, U_BOB: "UTC" });

    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco"], { at: Date.parse(postedAt) })));

    expect((await awardsOf(t)).map((award) => award.day)).toEqual([day]);
  });

  test("a new allowance day opens the full base again", async () => {
    const t = await withDirectory({ U_ALICE: "America/Los_Angeles", U_BOB: "UTC" });
    const threeTacos = ["taco", "taco", "taco"];

    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], threeTacos, { message: "1", at: Date.parse("2026-10-14T06:58:00Z") })));
    const nextDay = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], threeTacos, { message: "2", at: Date.parse("2026-10-14T07:01:00Z") })));

    expect(nextDay).toMatchObject({ outcome: { kind: "given", left: 0 } });
  });
});

test("R17: a giver's next message sees what the previous one spent", async () => {
  const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
  const twoTacos = ["taco", "taco"];

  const first = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], twoTacos, { message: "1" })));
  const second = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], twoTacos, { message: "2" })));

  expect(first).toMatchObject({ outcome: { kind: "given", left: 1 } });
  expect(second).toMatchObject({ outcome: { kind: "over-allowance", cost: 2, left: 1 } });
  expect((await awardsOf(t)).reduce((sum, award) => sum + award.kudos, 0)).toBe(2);
});

describe("R16: settings in force at evaluation", () => {
  test("a base lowered below what the giver already spent leaves 0", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
    const workspace = await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", baseAllowance: 5 }));
    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco", "taco", "taco"], { message: "1" })));

    await t.run((ctx) => ctx.db.patch(workspace, { baseAllowance: 2 }));
    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco"], { message: "2" })));

    expect(observation).toMatchObject({ outcome: { kind: "over-allowance", cost: 1, left: 0 } });
  });
});

describe("R9 R10: skipped mentions", () => {
  test("each skipped mention keeps its reason, once, in the order it first appears", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
    await t.run(async (ctx) => {
      await ctx.db.insert("members", { workspace: "T1", user: "U_HELPER", kind: "bot" });
      await ctx.db.insert("members", { workspace: "T1", user: "U_DAVE", kind: "not-a-member" });
    });
    const mentions: Mention[] = [person("U_DAVE"), { kind: "group", group: "S1" }, person("U_ALICE"), person("U_BOB"), person("U_HELPER"), person("U_DAVE")];

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", mentions, ["taco"])));

    expect(observation).toMatchObject({
      outcome: {
        kind: "given",
        recipients: [{ user: "U_BOB", kudos: 1 }],
        skipped: [
          { mention: person("U_DAVE"), reason: "not-a-member" },
          { mention: { kind: "group", group: "S1" }, reason: "group-or-broadcast" },
          { mention: person("U_ALICE"), reason: "self" },
          { mention: person("U_HELPER"), reason: "bot" },
        ],
      },
    });
  });
});

describe("R20: kudosGiven", () => {
  test("exactly one kudosGiven per Given outcome, with the awards and the allowance facts", async () => {
    const t = await withDirectory({ U_ALICE: "Asia/Tokyo", U_BOB: "UTC", U_CAROL: "UTC" });
    const at = Date.parse("2026-10-13T15:30:00Z");

    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco"], { at })));

    expect(published("kudosGiven")).toHaveLength(1);
    const [event] = published("kudosGiven");
    const ids = await memberIds(t);
    const [toBob, toCarol] = await t.run((ctx) => ctx.db.query("awards").collect());
    expect(event).toEqual({
      type: "kudosGiven",
      workspace: "T1",
      message: { workspace: "T1", conversation: "C1", message: "1" },
      giver: ids.U_ALICE,
      awards: [
        { award: toBob!._id, giver: ids.U_ALICE, recipient: ids.U_BOB, kudos: 1 },
        { award: toCarol!._id, giver: ids.U_ALICE, recipient: ids.U_CAROL, kudos: 1 },
      ],
      via: "message",
      kudosEmoji: "taco",
      annotations: { gate: { version: 1, thoughtful: false, words: 1 } },
      allowance: { dailyOpening: 3, dailyLeft: 1 },
      skippedMentions: 0,
      retry: false,
      inThread: false,
      day: "2026-10-14",
      at,
    });
  });

  describe("O3: retry, skipped mentions and thread", () => {
    const minute = 60_000;
    const later = (minutes: number) => now.getTime() + minutes * minute;
    const tooMany = [person("U_BOB")];
    const tacos = (count: number) => Array.from({ length: count }, () => "taco");

    test.each<[string, Array<{ mentions: Mention[]; emoji: string[] }>, boolean]>([
      ["a first attempt that gives", [{ mentions: tooMany, emoji: tacos(1) }], false],
      ["an Over allowance message edited to give", [{ mentions: tooMany, emoji: tacos(4) }, { mentions: tooMany, emoji: tacos(1) }], true],
      ["an Invalid message edited to give", [{ mentions: [person("U_ALICE")], emoji: tacos(1) }, { mentions: tooMany, emoji: tacos(1) }], true],
      ["a withdrawn attempt edited back into a kudos message", [{ mentions: tooMany, emoji: tacos(4) }, { mentions: tooMany, emoji: [] }, { mentions: tooMany, emoji: tacos(1) }], true],
      [
        "a withdrawn attempt edited again before it gives",
        [{ mentions: tooMany, emoji: tacos(4) }, { mentions: tooMany, emoji: [] }, { mentions: [person("U_ALICE")], emoji: [] }, { mentions: tooMany, emoji: tacos(1) }],
        true,
      ],
    ])("retry for %s", async (_, revisions, retry) => {
      const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });

      for (const [index, { mentions, emoji }] of revisions.entries()) {
        const posted = kudosMessage("U_ALICE", mentions, emoji);
        await t.run((ctx) => observe(ctx, index === 0 ? posted : editOf(posted, later(index))));
      }

      expect(published("kudosGiven")).toHaveLength(1);
      expect(published("kudosGiven")[0]).toMatchObject({ retry });
    });

    test("a retry that waits on the directory is still a retry when it gives", async () => {
      const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
      await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", tooMany, tacos(4))));
      const edited = editOf(kudosMessage("U_ALICE", [person("U_BOB"), person("U_DAVE")], tacos(1)), later(1));
      await t.run((ctx) => observe(ctx, edited));

      await t.run((ctx) => ctx.db.insert("members", { workspace: "T1", user: "U_DAVE", kind: "member" }));
      await t.run((ctx) => recheck(ctx, edited.ref, edited.revision));

      expect(published("kudosGiven")[0]).toMatchObject({ retry: true });
    });

    test("skippedMentions counts the mentions that receive nothing, and inThread a thread reply", async () => {
      const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
      const reply = { ...kudosMessage("U_ALICE", [person("U_BOB"), person("U_ALICE"), { kind: "broadcast", range: "here" }], tacos(1)), threadRoot: "1760349000.000100" };

      await t.run((ctx) => observe(ctx, reply));

      expect(published("kudosGiven")[0]).toMatchObject({ skippedMentions: 2, inThread: true });
    });
  });

  test("no kudosGiven for an outcome that is not Given", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });

    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco", "taco", "taco", "taco"])));

    expect(published("kudosGiven")).toEqual([]);
  });

  test.each([
    ["Over allowance", [person("U_BOB"), person("U_CAROL")], ["taco", "taco"], { outcome: "over-allowance", recipients: 2, perRecipient: 2, cost: 4, skippedMentions: 0 }],
    ["Invalid", [person("U_ALICE"), { kind: "broadcast", range: "here" }], ["taco"], { outcome: "invalid", recipients: 0, perRecipient: 1, cost: 0, skippedMentions: 2 }],
  ] as const)("an %s attempt publishes attemptFailed with its outcome and the allowance left", async (_, mentions, emoji, failure) => {
    const t = await withDirectory({ U_ALICE: "Asia/Tokyo", U_BOB: "UTC", U_CAROL: "UTC" });
    const at = Date.parse("2026-10-13T15:30:00Z");

    await t.run((ctx) => observe(ctx, { ...kudosMessage("U_ALICE", [...mentions], [...emoji], { at }), threadRoot: "1760349000.000100" }));

    const ids = await memberIds(t);
    expect(vi.mocked(publish).mock.calls.map(([, event]) => event)).toEqual([
      {
        type: "attemptFailed",
        workspace: "T1",
        message: { workspace: "T1", conversation: "C1", message: "1" },
        giver: ids.U_ALICE,
        ...failure,
        retry: false,
        inThread: true,
        allowance: { dailyLeft: 3 },
        day: "2026-10-14",
        at,
      },
    ]);
  });

  test("kudosGiven is published in the awards' transaction", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
    vi.mocked(publish).mockRejectedValueOnce(new Error("publishing failed"));

    await expect(t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco"])))).rejects.toThrow("publishing failed");

    expect(await awardsOf(t)).toEqual([]);
  });
});

test("R29: a message whose author or recipients the directory doesn't know waits for a lookup and spends nothing", async () => {
  const t = await withDirectory({ U_ALICE: "UTC" });

  const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco"])));

  expect(observation).toEqual({ kind: "awaiting-directory", users: ["U_BOB", "U_CAROL"], retryInMs: 0, attempt: BigInt(now.getTime()) * 1000n });
  expect(await awardsOf(t)).toEqual([]);
});

test("R29 R30: each failed check waits 1, 5, 30, 120 and 360 minutes for the next, and the last abandons the message", async () => {
  const t = await withDirectory({ U_ALICE: "UTC" });
  const message = kudosMessage("U_ALICE", [person("U_DAVE")], ["taco"]);

  const first = await t.run((ctx) => observe(ctx, message));
  const rechecks = [];
  for (let check = 0; check < 6; check += 1) rechecks.push(await t.run((ctx) => recheck(ctx, message.ref, message.revision)));

  expect(first).toMatchObject({ kind: "awaiting-directory", users: ["U_DAVE"], retryInMs: 0 });
  expect(rechecks.map((observation) => (observation.kind === "awaiting-directory" ? observation.retryInMs / 60_000 : observation.kind))).toEqual([
    1,
    5,
    30,
    120,
    360,
    "abandoned",
  ]);
  expect(await awardsOf(t)).toEqual([]);
});

test("R21 R24 R31: an edit seen while its author is deactivated still supersedes the waiting attempt", async () => {
  const t = await withDirectory({ U_ALICE: "UTC" });
  const message = kudosMessage("U_ALICE", [person("U_BOB")], ["taco"]);
  const withdrawal = { ...editOf(message, now.getTime() + 60_000), content: { mentions: [person("U_BOB")], emoji: [], text: "thanks" } };

  await t.run((ctx) => observe(ctx, message));
  await setDirectoryKind(t, "U_ALICE", "not-a-member");
  await t.run((ctx) => observe(ctx, withdrawal));
  await setDirectoryKind(t, "U_ALICE", "member");
  await t.run((ctx) => ctx.db.insert("members", { workspace: "T1", user: "U_BOB", kind: "member", timeZone: "UTC" }));
  await t.run((ctx) => recheck(ctx, message.ref, message.revision));

  expect(await awardsOf(t)).toEqual([]);
});

test("R21: an edit seen before its original while the author is deactivated keeps the late original from giving", async () => {
  const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
  const message = kudosMessage("U_ALICE", [person("U_BOB")], ["taco"]);
  const withdrawal = { ...editOf(message, now.getTime() + 60_000), content: { mentions: [person("U_BOB")], emoji: [], text: "thanks" } };

  await setDirectoryKind(t, "U_ALICE", "not-a-member");
  await t.run((ctx) => observe(ctx, withdrawal));
  await setDirectoryKind(t, "U_ALICE", "member");
  const late = await t.run((ctx) => observe(ctx, message));

  expect(late).toEqual({ kind: "ignored", why: "stale-revision" });
  expect(await awardsOf(t)).toEqual([]);
});

test("R22 R29: a prose-only edit while the author is deactivated leaves the waiting attempt standing", async () => {
  const t = await withDirectory({ U_ALICE: "UTC" });
  const message = kudosMessage("U_ALICE", [person("U_BOB")], ["taco"]);
  const typoFix = { ...editOf(message, now.getTime() + 60_000), content: { ...message.content, text: "thanks!" } };

  await t.run((ctx) => observe(ctx, message));
  await setDirectoryKind(t, "U_ALICE", "not-a-member");
  await t.run((ctx) => observe(ctx, typoFix));
  await setDirectoryKind(t, "U_ALICE", "member");
  await t.run((ctx) => ctx.db.insert("members", { workspace: "T1", user: "U_BOB", kind: "member", timeZone: "UTC" }));
  await t.run((ctx) => recheck(ctx, message.ref, message.revision));

  expect(await awardsOf(t)).toEqual([{ giver: "U_ALICE", recipient: "U_BOB", kudos: 1, day: "2026-10-13" }]);
});

test("R19: a message gives at most once", async () => {
  const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
  const message = kudosMessage("U_ALICE", [person("U_BOB")], ["taco"]);

  await t.run((ctx) => observe(ctx, message));
  const again = await t.run((ctx) => observe(ctx, message));

  expect(again).toEqual({ kind: "ignored", why: "unchanged" });
  expect(await awardsOf(t)).toHaveLength(1);
});

describe("R13 R23: a retry spends from the day of its edit", () => {
  const threeTacos = ["taco", "taco", "taco"];

  test("a message Over allowance yesterday, edited after midnight, spends from the new day, whatever its age", async () => {
    const t = await withDirectory({ U_ALICE: "Asia/Tokyo", U_BOB: "UTC", U_CAROL: "UTC" });
    const yesterday = Date.parse("2026-10-13T14:00:00Z");
    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], threeTacos, { message: "1", at: yesterday })));
    const overAllowance = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco"], { message: "2", at: yesterday })));

    const tenDaysLater = Date.parse("2026-10-23T15:30:00Z");
    const retry = await t.run((ctx) => observe(ctx, editOf(kudosMessage("U_ALICE", [person("U_CAROL")], threeTacos, { message: "2", at: yesterday }), tenDaysLater)));

    expect(overAllowance).toMatchObject({ outcome: { kind: "over-allowance", left: 0 } });
    expect(retry).toMatchObject({ kind: "evaluated", outcome: { kind: "given", left: 0 } });
    expect((await awardsOf(t)).map((award) => award.day)).toEqual(["2026-10-13", "2026-10-24"]);
    expect(vi.mocked(publish).mock.calls.at(-1)?.[1]).toMatchObject({ day: "2026-10-24", at: tenDaysLater });
  });

  test("an edit seen before anything else of its message spends from its own day", async () => {
    const t = await withDirectory({ U_ALICE: "America/Los_Angeles", U_BOB: "UTC" });
    const postedBeforeMidnight = Date.parse("2026-10-14T06:50:00Z");
    const editedAfterMidnight = Date.parse("2026-10-14T07:10:00Z");

    await t.run((ctx) => observe(ctx, editOf(kudosMessage("U_ALICE", [person("U_BOB")], ["taco"], { at: postedBeforeMidnight }), editedAfterMidnight)));

    expect((await awardsOf(t)).map((award) => award.day)).toEqual(["2026-10-14"]);
  });
});

test("R26: an edit to a message that gave kudos changes no award and spends nothing", async () => {
  const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC", U_CAROL: "UTC" });
  const posted = kudosMessage("U_ALICE", [person("U_BOB")], ["taco"]);
  await t.run((ctx) => observe(ctx, posted));

  const edited = await t.run((ctx) => observe(ctx, editOf(kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco", "taco"]), now.getTime() + 60_000)));
  const next = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_CAROL")], ["taco", "taco"], { message: "2" })));

  expect(edited).toEqual({ kind: "already-given", toldGiver: true });
  expect(next).toMatchObject({ outcome: { kind: "given", left: 0 } });
  expect(await awardsOf(t)).toEqual([
    { giver: "U_ALICE", recipient: "U_BOB", kudos: 1, day: "2026-10-13" },
    { giver: "U_ALICE", recipient: "U_CAROL", kudos: 2, day: "2026-10-13" },
  ]);
});

function published<T extends DomainEvent["type"]>(type: T) {
  return vi
    .mocked(publish)
    .mock.calls.map(([, event]) => event)
    .filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type);
}

async function withDirectory(people: Record<string, string | undefined>) {
  const t = testBackend();
  await t.run(async (ctx) => {
    for (const [user, timeZone] of Object.entries(people)) {
      await ctx.db.insert("members", { workspace: "T1", user, kind: "member", ...(timeZone && { timeZone }) });
    }
  });
  return t;
}

async function setDirectoryKind(t: Backend, user: string, kind: "member" | "not-a-member") {
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("workspace", "T1").eq("user", user))
      .unique();
    await ctx.db.patch(row!._id, { kind });
  });
}

function person(user: string): Mention {
  return { kind: "person", user };
}

function kudosMessage(author: string, mentions: Mention[], emoji: string[], options: { message?: string; at?: number } = {}): MessageEvent {
  const at = options.at ?? now.getTime();
  return {
    kind: "posted",
    ref: { workspace: "T1", conversation: "C1", message: options.message ?? "1" },
    author,
    revision: BigInt(at) * 1000n,
    at,
    content: { mentions, emoji, text: "thanks" },
    words: { segments: [{ kind: "text", text: "thanks" }], visibility: "public" },
  };
}

function editOf(event: MessageEvent, at: number): MessageEvent {
  return { ...event, kind: "edited", revision: BigInt(at) * 1000n, at };
}

async function memberIds(t: Backend) {
  const members = await t.run((ctx) => ctx.db.query("members").collect());
  return Object.fromEntries(members.map((member) => [member.user, member._id]));
}

async function awardsOf(t: Backend) {
  return t.run(async (ctx) => {
    const awards = await ctx.db.query("awards").collect();
    const userOf = async (id: (typeof awards)[number]["giver"]) => (await ctx.db.get(id))?.user;
    return Promise.all(
      awards.map(async (award) => ({ giver: await userOf(award.giver), recipient: await userOf(award.recipient), kudos: award.kudos, day: award.day })),
    );
  });
}
