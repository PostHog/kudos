// The engine, from outside: a message event observed, what it gives and spends, and the events it publishes. Today's
// convex/engine/engine.test.ts over the service. Every message the engine reads goes through the parser's hooks, owned
// store emoji (S7) and earned album emoji (S9), so every test here waits on S7 and S9. An outcome the engine tells its
// giver about replies privately (S5's replies), and a message that gives is placed in the spotlight among members on
// the boards (S11's visibility), so those paths wait on S5 and S11 too.
import { describe, expect } from "vitest";
import { useTestBackend, type PublishedEvent } from "../../testing/backend.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { DomainEvent } from "../bus/events.ts";
import { NotPortedError } from "../notPorted.ts";
import type { MutationContext } from "../operations.ts";
import { observe, recheck } from "./engine.ts";
import type { Mention, MessageEvent } from "./messageEvent.ts";

const now = new Date("2026-10-13T10:00:00Z");
const backend = useTestBackend({ now: now.getTime() });
type Backend = ReturnType<typeof backend>;

describe("Given", () => {
  waitsOn(["S5", "S7", "S9", "S11"], "R4 R8 R11 R15 R18: one award per recipient with n kudos each, paid from the daily allowance", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC", U_CAROL: "UTC" });

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco"])));

    expect(observation).toMatchObject({ kind: "evaluated", outcome: { kind: "given", kudosEmoji: "taco", left: 1 } });
    expect(await awardsOf(t)).toEqual([
      { giver: "U_ALICE", recipient: "U_BOB", kudos: 1, day: "2026-10-13" },
      { giver: "U_ALICE", recipient: "U_CAROL", kudos: 1, day: "2026-10-13" },
    ]);
  });

  waitsOn(["S5", "S7", "S9", "S11"], "R4: every kudos emoji occurrence gives each recipient one more kudos, and the cost is recipients × n", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco", "taco", "taco"])));

    expect(observation).toMatchObject({ outcome: { kind: "given", left: 0 } });
    expect(await awardsOf(t)).toEqual([{ giver: "U_ALICE", recipient: "U_BOB", kudos: 3, day: "2026-10-13" }]);
  });

  waitsOn(["S5", "S7", "S9", "S11"], "R8: recipients are other members in the order they first appear, each receiving once", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC", U_CAROL: "UTC" });

    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_CAROL"), person("U_ALICE"), person("U_BOB"), person("U_CAROL")], ["taco"])));

    expect((await awardsOf(t)).map((award) => award.recipient)).toEqual(["U_CAROL", "U_BOB"]);
  });

  waitsOn(["S5", "S7", "S9", "S11"], "R15: a message costing more than the daily allowance left gives nothing and spends nothing", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC", U_CAROL: "UTC" });

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco", "taco"])));
    const after = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco", "taco", "taco"], { message: "2" })));

    expect(observation).toMatchObject({ outcome: { kind: "over-allowance", cost: 4, recipients: 2, perRecipient: 2, left: 3 } });
    expect(after).toMatchObject({ outcome: { kind: "given", left: 0 } });
    expect(await awardsOf(t)).toEqual([{ giver: "U_ALICE", recipient: "U_BOB", kudos: 3, day: "2026-10-13" }]);
  });

  waitsOn(["S5", "S7", "S9", "S11"], "R11: the daily allowance opens at the workspace base", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
    await t.seed.insert("workspaces", { workspace: "T1", baseAllowance: 5 });

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco", "taco", "taco", "taco"])));

    expect(observation).toMatchObject({ outcome: { kind: "given", left: 1 } });
  });

  waitsOn(["S5", "S7", "S9"], "R10: a kudos message whose mentions are all skipped gives nothing", async () => {
    const t = await withDirectory({ U_ALICE: "UTC" });

    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_ALICE"), { kind: "broadcast", range: "here" }], ["taco"])));

    expect(observation).toMatchObject({ outcome: { kind: "invalid" } });
    expect(await awardsOf(t)).toEqual([]);
  });
});

describe("R12 R13: the allowance day follows the giver's time zone", () => {
  const cases: Array<[string, string | undefined, string, string]> = [
    ["east of UTC", "Asia/Tokyo", "2026-10-13T14:59:00Z", "2026-10-13"],
    ["east of UTC, after local midnight", "Asia/Tokyo", "2026-10-13T15:01:00Z", "2026-10-14"],
    ["west of UTC, before local midnight", "America/Los_Angeles", "2026-10-14T06:59:00Z", "2026-10-13"],
    ["without a time zone, in UTC", undefined, "2026-10-13T23:59:00Z", "2026-10-13"],
  ];
  for (const [name, timeZone, postedAt, day] of cases) {
    waitsOn(["S5", "S7", "S9", "S11"], name, async () => {
      const t = await withDirectory({ U_ALICE: timeZone, U_BOB: "UTC" });

      await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco"], { at: Date.parse(postedAt) })));

      expect((await awardsOf(t)).map((award) => award.day)).toEqual([day]);
    });
  }

  waitsOn(["S5", "S7", "S9", "S11"], "a new allowance day opens the full base again", async () => {
    const t = await withDirectory({ U_ALICE: "America/Los_Angeles", U_BOB: "UTC" });
    const threeTacos = ["taco", "taco", "taco"];

    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], threeTacos, { message: "1", at: Date.parse("2026-10-14T06:58:00Z") })));
    const nextDay = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], threeTacos, { message: "2", at: Date.parse("2026-10-14T07:01:00Z") })));

    expect(nextDay).toMatchObject({ outcome: { kind: "given", left: 0 } });
  });
});

waitsOn(["S5", "S7", "S9", "S11"], "R17: a giver's next message sees what the previous one spent", async () => {
  const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
  const twoTacos = ["taco", "taco"];

  const first = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], twoTacos, { message: "1" })));
  const second = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], twoTacos, { message: "2" })));

  expect(first).toMatchObject({ outcome: { kind: "given", left: 1 } });
  expect(second).toMatchObject({ outcome: { kind: "over-allowance", cost: 2, left: 1 } });
  expect((await awardsOf(t)).reduce((sum, award) => sum + award.kudos, 0)).toBe(2);
});

describe("R16: settings in force at evaluation", () => {
  waitsOn(["S5", "S7", "S9", "S11"], "a base lowered below what the giver already spent leaves 0", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
    const workspace = await t.seed.insert("workspaces", { workspace: "T1", baseAllowance: 5 });
    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco", "taco", "taco"], { message: "1" })));

    await t.seed.patch("workspaces", workspace, { baseAllowance: 2 });
    const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco"], { message: "2" })));

    expect(observation).toMatchObject({ outcome: { kind: "over-allowance", cost: 1, left: 0 } });
  });
});

describe("R9 R10: skipped mentions", () => {
  waitsOn(["S5", "S7", "S9", "S11"], "each skipped mention keeps its reason, once, in the order it first appears", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
    await t.seed.insert("members", { workspace: "T1", user: "U_HELPER", kind: "bot" });
    await t.seed.insert("members", { workspace: "T1", user: "U_DAVE", kind: "not-a-member" });
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
  waitsOn(["S5", "S7", "S9", "S11"], "exactly one kudosGiven per Given outcome, with the awards and the allowance facts", async () => {
    const t = await withDirectory({ U_ALICE: "Asia/Tokyo", U_BOB: "UTC", U_CAROL: "UTC" });
    const at = Date.parse("2026-10-13T15:30:00Z");

    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco"], { at })));

    expect(await published(t, "kudosGiven")).toHaveLength(1);
    const [event] = await published(t, "kudosGiven");
    const ids = await memberIds(t);
    const [toBob, toCarol] = await t.seed.all("awards");
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

    const cases: Array<[string, Array<{ mentions: Mention[]; emoji: string[] }>, boolean]> = [
      ["a first attempt that gives", [{ mentions: tooMany, emoji: tacos(1) }], false],
      ["an Over allowance message edited to give", [{ mentions: tooMany, emoji: tacos(4) }, { mentions: tooMany, emoji: tacos(1) }], true],
      ["an Invalid message edited to give", [{ mentions: [person("U_ALICE")], emoji: tacos(1) }, { mentions: tooMany, emoji: tacos(1) }], true],
      ["a withdrawn attempt edited back into a kudos message", [{ mentions: tooMany, emoji: tacos(4) }, { mentions: tooMany, emoji: [] }, { mentions: tooMany, emoji: tacos(1) }], true],
      [
        "a withdrawn attempt edited again before it gives",
        [{ mentions: tooMany, emoji: tacos(4) }, { mentions: tooMany, emoji: [] }, { mentions: [person("U_ALICE")], emoji: [] }, { mentions: tooMany, emoji: tacos(1) }],
        true,
      ],
    ];
    for (const [name, revisions, retry] of cases) {
      waitsOn(["S5", "S7", "S9", "S11"], `retry for ${name}`, async () => {
        const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });

        for (const [index, { mentions, emoji }] of revisions.entries()) {
          const posted = kudosMessage("U_ALICE", mentions, emoji);
          await t.run((ctx) => observe(ctx, index === 0 ? posted : editOf(posted, later(index))));
        }

        expect(await published(t, "kudosGiven")).toHaveLength(1);
        expect((await published(t, "kudosGiven"))[0]).toMatchObject({ retry });
      });
    }

    waitsOn(["S5", "S7", "S9", "S11"], "a retry that waits on the directory is still a retry when it gives", async () => {
      const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
      await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", tooMany, tacos(4))));
      const edited = editOf(kudosMessage("U_ALICE", [person("U_BOB"), person("U_DAVE")], tacos(1)), later(1));
      await t.run((ctx) => observe(ctx, edited));

      await t.seed.insert("members", { workspace: "T1", user: "U_DAVE", kind: "member" });
      await t.run((ctx) => recheck(ctx, edited.ref, edited.revision));

      expect((await published(t, "kudosGiven"))[0]).toMatchObject({ retry: true });
    });

    waitsOn(["S5", "S7", "S9", "S11"], "skippedMentions counts the mentions that receive nothing, and inThread a thread reply", async () => {
      const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
      const reply = { ...kudosMessage("U_ALICE", [person("U_BOB"), person("U_ALICE"), { kind: "broadcast", range: "here" }], tacos(1)), threadRoot: "1760349000.000100" };

      await t.run((ctx) => observe(ctx, reply));

      expect((await published(t, "kudosGiven"))[0]).toMatchObject({ skippedMentions: 2, inThread: true });
    });
  });

  waitsOn(["S5", "S7", "S9"], "no kudosGiven for an outcome that is not Given", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });

    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], ["taco", "taco", "taco", "taco"])));

    expect(await published(t, "kudosGiven")).toEqual([]);
  });

  const failures = [
    ["Over allowance", [person("U_BOB"), person("U_CAROL")], ["taco", "taco"], { outcome: "over-allowance", recipients: 2, perRecipient: 2, cost: 4, skippedMentions: 0 }],
    ["Invalid", [person("U_ALICE"), { kind: "broadcast", range: "here" }], ["taco"], { outcome: "invalid", recipients: 0, perRecipient: 1, cost: 0, skippedMentions: 2 }],
  ] as const;
  for (const [name, mentions, emoji, failure] of failures) {
    waitsOn(["S5", "S7", "S9"], `an ${name} attempt publishes attemptFailed with its outcome and the allowance left`, async () => {
      const t = await withDirectory({ U_ALICE: "Asia/Tokyo", U_BOB: "UTC", U_CAROL: "UTC" });
      const at = Date.parse("2026-10-13T15:30:00Z");

      await t.run((ctx) => observe(ctx, { ...kudosMessage("U_ALICE", [...mentions], [...emoji], { at }), threadRoot: "1760349000.000100" }));

      const ids = await memberIds(t);
      expect(withoutFacts(await t.published())).toEqual([
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
  }

  waitsOn(["S7", "S9"], "kudosGiven is published in the awards' transaction", async () => {
    const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
    const failingToPublish = (ctx: MutationContext): MutationContext => ({
      ...ctx,
      publish: async () => {
        throw new Error("publishing failed");
      },
    });

    const failure = await t.run((ctx) => observe(failingToPublish(ctx), kudosMessage("U_ALICE", [person("U_BOB")], ["taco"]))).then(() => null, (error: unknown) => error);
    if (failure instanceof NotPortedError) throw failure;

    expect(failure).toEqual(new Error("publishing failed"));

    expect(await awardsOf(t)).toEqual([]);
  });
});

waitsOn(["S7", "S9"], "R29: a message whose author or recipients the directory doesn't know waits for a lookup and spends nothing", async () => {
  const t = await withDirectory({ U_ALICE: "UTC" });

  const observation = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco"])));

  expect(observation).toEqual({ kind: "awaiting-directory", users: ["U_BOB", "U_CAROL"], retryInMs: 0, attempt: BigInt(now.getTime()) * 1000n });
  expect(await awardsOf(t)).toEqual([]);
});

waitsOn(["S7", "S9"], "R29 R30: each failed check waits 1, 5, 30, 120 and 360 minutes for the next, and the last abandons the message", async () => {
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

waitsOn(["S7", "S9"], "R21 R24 R31: an edit seen while its author is deactivated still supersedes the waiting attempt", async () => {
  const t = await withDirectory({ U_ALICE: "UTC" });
  const message = kudosMessage("U_ALICE", [person("U_BOB")], ["taco"]);
  const withdrawal = { ...editOf(message, now.getTime() + 60_000), content: { mentions: [person("U_BOB")], emoji: [], text: "thanks" } };

  await t.run((ctx) => observe(ctx, message));
  await setDirectoryKind(t, "U_ALICE", "not-a-member");
  await t.run((ctx) => observe(ctx, withdrawal));
  await setDirectoryKind(t, "U_ALICE", "member");
  await t.seed.insert("members", { workspace: "T1", user: "U_BOB", kind: "member", timeZone: "UTC" });
  await t.run((ctx) => recheck(ctx, message.ref, message.revision));

  expect(await awardsOf(t)).toEqual([]);
});

waitsOn(["S7", "S9"], "R21: an edit seen before its original while the author is deactivated keeps the late original from giving", async () => {
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

waitsOn(["S5", "S7", "S9", "S11"], "R22 R29: a prose-only edit while the author is deactivated leaves the waiting attempt standing", async () => {
  const t = await withDirectory({ U_ALICE: "UTC" });
  const message = kudosMessage("U_ALICE", [person("U_BOB")], ["taco"]);
  const typoFix = { ...editOf(message, now.getTime() + 60_000), content: { ...message.content, text: "thanks!" } };

  await t.run((ctx) => observe(ctx, message));
  await setDirectoryKind(t, "U_ALICE", "not-a-member");
  await t.run((ctx) => observe(ctx, typoFix));
  await setDirectoryKind(t, "U_ALICE", "member");
  await t.seed.insert("members", { workspace: "T1", user: "U_BOB", kind: "member", timeZone: "UTC" });
  await t.run((ctx) => recheck(ctx, message.ref, message.revision));

  expect(await awardsOf(t)).toEqual([{ giver: "U_ALICE", recipient: "U_BOB", kudos: 1, day: "2026-10-13" }]);
});

waitsOn(["S5", "S7", "S9", "S11"], "R19: a message gives at most once", async () => {
  const t = await withDirectory({ U_ALICE: "UTC", U_BOB: "UTC" });
  const message = kudosMessage("U_ALICE", [person("U_BOB")], ["taco"]);

  await t.run((ctx) => observe(ctx, message));
  const again = await t.run((ctx) => observe(ctx, message));

  expect(again).toEqual({ kind: "ignored", why: "unchanged" });
  expect(await awardsOf(t)).toHaveLength(1);
});

describe("R13 R23: a retry spends from the day of its edit", () => {
  const threeTacos = ["taco", "taco", "taco"];

  waitsOn(["S5", "S7", "S9", "S11"], "a message Over allowance yesterday, edited after midnight, spends from the new day, whatever its age", async () => {
    const t = await withDirectory({ U_ALICE: "Asia/Tokyo", U_BOB: "UTC", U_CAROL: "UTC" });
    const yesterday = Date.parse("2026-10-13T14:00:00Z");
    await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB")], threeTacos, { message: "1", at: yesterday })));
    const overAllowance = await t.run((ctx) => observe(ctx, kudosMessage("U_ALICE", [person("U_BOB"), person("U_CAROL")], ["taco"], { message: "2", at: yesterday })));

    const tenDaysLater = Date.parse("2026-10-23T15:30:00Z");
    const retry = await t.run((ctx) => observe(ctx, editOf(kudosMessage("U_ALICE", [person("U_CAROL")], threeTacos, { message: "2", at: yesterday }), tenDaysLater)));

    expect(overAllowance).toMatchObject({ outcome: { kind: "over-allowance", left: 0 } });
    expect(retry).toMatchObject({ kind: "evaluated", outcome: { kind: "given", left: 0 } });
    expect((await awardsOf(t)).map((award) => award.day)).toEqual(["2026-10-13", "2026-10-24"]);
    expect((await t.published()).at(-1)).toMatchObject({ day: "2026-10-24", at: tenDaysLater });
  });

  waitsOn(["S5", "S7", "S9", "S11"], "an edit seen before anything else of its message spends from its own day", async () => {
    const t = await withDirectory({ U_ALICE: "America/Los_Angeles", U_BOB: "UTC" });
    const postedBeforeMidnight = Date.parse("2026-10-14T06:50:00Z");
    const editedAfterMidnight = Date.parse("2026-10-14T07:10:00Z");

    await t.run((ctx) => observe(ctx, editOf(kudosMessage("U_ALICE", [person("U_BOB")], ["taco"], { at: postedBeforeMidnight }), editedAfterMidnight)));

    expect((await awardsOf(t)).map((award) => award.day)).toEqual(["2026-10-14"]);
  });
});

waitsOn(["S5", "S7", "S9", "S11"], "R26: an edit to a message that gave kudos changes no award and spends nothing", async () => {
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

/** The events of this type committed operations published, without the fact the bus adds to each. */
async function published<T extends DomainEvent["type"]>(t: Backend, type: T) {
  return withoutFacts(await t.published()).filter((event) => event.type === type);
}

function withoutFacts(events: PublishedEvent[]) {
  return events.map(({ fact: _, ...event }) => event);
}

async function withDirectory(people: Record<string, string | undefined>) {
  const t = backend();
  for (const [user, timeZone] of Object.entries(people)) {
    await t.seed.insert("members", { workspace: "T1", user, kind: "member", ...(timeZone && { timeZone }) });
  }
  return t;
}

async function setDirectoryKind(t: Backend, user: string, kind: "member" | "not-a-member") {
  const row = (await t.seed.all("members")).find((member) => member.workspace === "T1" && member.user === user);
  await t.seed.patch("members", row!._id, { kind });
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
  const members = await t.seed.all("members");
  return Object.fromEntries(members.map((member) => [member.user, member._id]));
}

async function awardsOf(t: Backend) {
  const userOf = new Map((await t.seed.all("members")).map((member) => [member._id as string, member.user]));
  return (await t.seed.all("awards")).map((award) => ({ giver: userOf.get(award.giver), recipient: userOf.get(award.recipient), kudos: award.kudos, day: award.day }));
}
