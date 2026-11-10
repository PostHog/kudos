// The item ledger, the item flags and thoughtful packs on the service's transaction: the bodies S8 ports that reach no
// other stack. A pack's first grant reaches S9's album stickers and emoji names and S10's rarity caps; its tests are
// in the ported files beside this one.
import { asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { definitionsStored, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import type { KudosGivenEvent } from "../bus/events.ts";
import type { Id } from "../db/columns.ts";
import { toDocument } from "../db/documents.ts";
import { jobs } from "../db/schema/index.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import type { MemberId } from "../workspace/directory.ts";
import { achievementHoggiesShownTo } from "./items/achievementFlag.ts";
import { hiddenItemsShownTo, itemShareAppliesToWorkspace, teasersShownTo } from "./items/flag.ts";
import { boardOf, earnedItemOf, earnItem, isTurned, isWaiting, markTurned, newestTurnOf, shownWaitingHoggiesOf, stickerWaitsFor, waitingCountOf } from "./items/ledger.ts";
import { onboardingShownTo } from "./items/onboardingFlag.ts";
import type { Earning } from "./items/records.ts";
import { welcomeItemShownTo } from "./items/welcomeFlag.ts";
import {
  crateKeyOf,
  earnItemsOfAPackGivenBeforeTheLedger,
  firstPackGrantedFor,
  grantedKudosBetween,
  grantThoughtfulPacks,
  grantThoughtfulPacksArgs,
  isFirstPackFor,
  isFirstPackGrantedFor,
  packsEarnedBetween,
  waitingPacksOf,
} from "./packs.ts";

const at = new Date("2026-10-13T10:00:00Z").getTime();
const links = { album: "https://kudos.example/album", book: "https://kudos.example/book" } as never;
const startBackend = useTestBackend({ now: at });

afterEach(() => {
  vi.unstubAllEnvs();
});

// The one setup of this file, on S4's in-process backend: the operation runner, the seeder, the jobs queued, and the
// events the code under test published.
function backend() {
  const t = startBackend();
  const scheduled = (name?: string) =>
    t.query(async ({ tx }) => {
      const rows = await tx.select().from(jobs).where(name === undefined ? undefined : eq(jobs.name, name)).orderBy(asc(jobs._creationTime), asc(jobs._id));
      return rows.map((row) => toDocument<{ name: string; args: Record<string, unknown> }>(jobs, row));
    });
  return {
    seed: t.seed,
    // Flags decide only with the flags key set and a subject: the workspace's key stands in for every member.
    flagsOn: async (...keys: string[]) => {
      postHogDeciding("sandbox");
      if ((await t.seed.all("workspaceKeys")).length === 0) await t.seed.insert("workspaceKeys", { workspace: "T1", workspaceKey: "workspace-key-T1" });
      await definitionsStored(t.operations, ...keys.map(onForEveryone));
    },
    mutation: <T>(handler: (ctx: MutationContext) => Promise<T>) => t.run(handler),
    query: <T>(handler: (ctx: QueryContext) => Promise<T>) => t.query(handler),
    scheduled,
    published: () => t.published(),
    member: (user: string) => t.seed.insert("members", { workspace: "T1", user, kind: "member" }) as Promise<MemberId>,
  };
}

const message = (n: number): MessageRef => ({ workspace: "T1", conversation: "C1", message: `1760000000.00000${n}` });

function thanks(member: MemberId, person: MemberId, extra: Partial<Earning> = {}): Earning {
  return { workspace: "T1", member, source: "hoggie", key: `thoughtful:${person}`, reason: { kind: "thanks", person, message: message(1) }, earnedAt: at, ...extra };
}

describe("LP5: an item is earned once per member, source and key", () => {
  test("earning the same item again answers the first, and another member or source earns their own", async () => {
    const t = backend();
    const [alice, bob, carol] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL")];

    const first = await t.mutation((ctx) => earnItem(ctx, thanks(alice, bob)));
    expect(await t.mutation((ctx) => earnItem(ctx, thanks(alice, bob, { earnedAt: at + 1 })))).toBe(first);
    const carols = await t.mutation((ctx) => earnItem(ctx, thanks(carol, bob)));
    const sticker = await t.mutation((ctx) => earnItem(ctx, thanks(alice, bob, { source: "sticker" })));

    expect(new Set([first, carols, sticker]).size).toBe(3);
    expect((await t.seed.all("items")).map(({ member, source, earnedAt }) => ({ member, source, earnedAt }))).toEqual([
      { member: alice, source: "hoggie", earnedAt: at },
      { member: carol, source: "hoggie", earnedAt: at },
      { member: alice, source: "sticker", earnedAt: at },
    ]);
  });

  test("two items under one member, source and key fail every read, as unique() did", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    await t.seed.insert("items", thanks(alice, bob));
    await t.seed.insert("items", thanks(alice, bob));

    await expect(t.query((ctx) => earnedItemOf(ctx, alice, "hoggie", `thoughtful:${bob}`))).rejects.toThrow("unique() query returned more than one result from table items:");
  });
});

describe("LP8 LP9: the board of face-down items", () => {
  test("lists the waiting items by when each was earned, not when it was written, and a turned one leaves it", async () => {
    const t = backend();
    const [alice, bob, carol, dan] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL"), await t.member("U_DAN")];
    const late = await t.mutation((ctx) => earnItem(ctx, thanks(alice, bob, { earnedAt: at + 2 })));
    const early = await t.mutation((ctx) => earnItem(ctx, thanks(alice, carol, { earnedAt: at })));
    await t.mutation((ctx) => earnItem(ctx, thanks(alice, dan, { earnedAt: at + 1 })));

    await t.mutation((ctx) => markTurned(ctx, alice, "hoggie", `thoughtful:${dan}`, at + 5));

    expect(await t.query((ctx) => boardOf(ctx, alice))).toEqual({
      items: [
        { item: early, earnedAt: at, reason: { kind: "thanks", person: carol, message: message(1) } },
        { item: late, earnedAt: at + 2, reason: { kind: "thanks", person: bob, message: message(1) } },
      ],
      more: false,
    });
  });

  test("a board of 101 waiting items shows the oldest 100 with more, and the count says 50+", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    await t.mutation(async (ctx) => {
      for (let n = 0; n < 101; n++) await earnItem(ctx, thanks(alice, bob, { key: `quest:${n}`, earnedAt: at + n }));
    });

    const board = await t.query((ctx) => boardOf(ctx, alice));
    expect(board.items.map(({ earnedAt }) => earnedAt)).toEqual(Array.from({ length: 100 }, (_, n) => at + n));
    expect(board.more).toBe(true);
    expect(await t.query((ctx) => waitingCountOf(ctx, alice))).toBe("50+");
  });

  test("an achievement's item waits on the board only while achievement hoggies and hidden items are both on", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    await t.mutation((ctx) => earnItem(ctx, { ...thanks(alice, bob), key: "team:T_ONE", reason: { kind: "team", team: "T_ONE", name: "One" } }));
    await t.mutation((ctx) => earnItem(ctx, thanks(alice, bob, { earnedAt: at + 1 })));
    const kinds = async () => (await t.query((ctx) => boardOf(ctx, alice))).items.map(({ reason }) => reason.kind);

    expect(await kinds()).toEqual(["thanks"]);
    expect(await t.query((ctx) => waitingCountOf(ctx, alice))).toBe(1);

    await t.flagsOn("achievement-hoggies");
    expect(await kinds()).toEqual(["thanks"]);

    await t.flagsOn("achievement-hoggies", "hidden-items");
    expect(await kinds()).toEqual(["team", "thanks"]);
  });

  test("past 100 hidden achievements, the board still finds the waiting items behind them", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    await t.mutation(async (ctx) => {
      for (let n = 0; n < 120; n++) await earnItem(ctx, { ...thanks(alice, bob), key: `team:T${n}`, reason: { kind: "team", team: `T${n}`, name: `${n}` }, earnedAt: at + n });
      await earnItem(ctx, thanks(alice, bob, { earnedAt: at + 500 }));
    });

    expect((await t.query((ctx) => boardOf(ctx, alice))).items.map(({ earnedAt }) => earnedAt)).toEqual([at + 500]);
  });

  test("the waiting hoggies shown count hoggies and the ones not yet earned, only with links and hidden items on", async () => {
    const t = backend();
    const [alice, bob, carol] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL")];
    await t.mutation((ctx) => earnItem(ctx, thanks(alice, bob)));
    await t.mutation((ctx) => earnItem(ctx, thanks(alice, carol, { source: "sticker" })));

    expect(await t.query((ctx) => shownWaitingHoggiesOf(ctx, alice, links))).toBe(0);
    await t.flagsOn("hidden-items");
    expect(await t.query((ctx) => shownWaitingHoggiesOf(ctx, alice, null))).toBe(0);
    expect(await t.query((ctx) => shownWaitingHoggiesOf(ctx, alice, links))).toBe(1);
    expect(await t.query((ctx) => shownWaitingHoggiesOf(ctx, alice, links, { notYetEarned: 1 }))).toBe(2);
    expect(await t.query((ctx) => shownWaitingHoggiesOf(ctx, alice, links, { notYetEarned: 50 }))).toBe("50+");
  });

  test("a sticker waits for a person while its thanks item is face down, and not once it is turned", async () => {
    const t = backend();
    const [alice, bob, carol] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL")];
    await t.mutation((ctx) => earnItem(ctx, thanks(alice, bob, { source: "sticker", key: "pack-1" })));
    await t.mutation((ctx) => earnItem(ctx, thanks(alice, carol)));

    expect(await t.query((ctx) => stickerWaitsFor(ctx, alice, bob))).toBe(true);
    expect(await t.query((ctx) => stickerWaitsFor(ctx, alice, carol))).toBe(false);

    await t.mutation((ctx) => markTurned(ctx, alice, "sticker", "pack-1", at + 1));
    expect(await t.query((ctx) => stickerWaitsFor(ctx, alice, bob))).toBe(false);
  });
});

describe("the turned ledger: a face-down item's missing turn orders before every turn", () => {
  test("marking an item turned keeps its first turn, and isWaiting and isTurned follow it", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const key = `thoughtful:${bob}`;
    await t.mutation((ctx) => earnItem(ctx, thanks(alice, bob)));

    expect(await t.query(async (ctx) => [await isWaiting(ctx, alice, "hoggie", key), await isTurned(ctx, alice, "hoggie", key)])).toEqual([true, false]);
    await t.mutation((ctx) => markTurned(ctx, alice, "hoggie", key, at + 1));
    await t.mutation((ctx) => markTurned(ctx, alice, "hoggie", key, at + 9));
    await t.mutation((ctx) => markTurned(ctx, alice, "hoggie", "never-earned", at + 9));

    expect(await t.query(async (ctx) => [await isWaiting(ctx, alice, "hoggie", key), await isTurned(ctx, alice, "hoggie", key)])).toEqual([false, true]);
    expect((await t.seed.all("items")).map(({ turnedAt }) => turnedAt)).toEqual([at + 1]);
    expect(await t.query(async (ctx) => [await isWaiting(ctx, alice, "hoggie", "never-earned"), await isTurned(ctx, alice, "hoggie", "never-earned")])).toEqual([false, false]);
  });

  test("the newest turn is the latest time turned, whatever face-down items wait, and null before any turn", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    expect(await t.query((ctx) => newestTurnOf(ctx, alice))).toBeNull();

    await t.mutation(async (ctx) => {
      for (const n of [1, 2, 3]) await earnItem(ctx, thanks(alice, bob, { key: `quest:${n}`, earnedAt: at + 10 * n }));
    });
    expect(await t.query((ctx) => newestTurnOf(ctx, alice))).toBeNull();

    await t.mutation((ctx) => markTurned(ctx, alice, "hoggie", "quest:3", at + 100));
    await t.mutation((ctx) => markTurned(ctx, alice, "hoggie", "quest:1", at + 200));
    expect(await t.query((ctx) => newestTurnOf(ctx, alice))).toBe(at + 200);
  });
});

describe("the item flags", () => {
  test("onboarding, the welcome item and achievement hoggies show only beside hidden items; teasers and the share stand alone", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");
    const shown = () =>
      t.query(async (ctx) => ({
        hidden: await hiddenItemsShownTo(ctx, alice),
        teasers: await teasersShownTo(ctx, alice),
        share: await itemShareAppliesToWorkspace(ctx, "T1"),
        onboarding: await onboardingShownTo(ctx, alice),
        welcome: await welcomeItemShownTo(ctx, alice),
        achievements: await achievementHoggiesShownTo(ctx, alice),
      }));

    expect(await shown()).toEqual({ hidden: false, teasers: false, share: false, onboarding: false, welcome: false, achievements: false });

    await t.flagsOn("teasers", "item-share", "onboarding", "welcome-item", "achievement-hoggies");
    expect(await shown()).toEqual({ hidden: false, teasers: true, share: true, onboarding: false, welcome: false, achievements: false });

    await t.flagsOn("hidden-items", "onboarding", "welcome-item", "achievement-hoggies");
    expect(await shown()).toEqual({ hidden: true, teasers: false, share: false, onboarding: true, welcome: true, achievements: true });
  });
});

type PackFields = { giver: MemberId; recipient: MemberId; at?: number; week?: string; message?: MessageRef; holdsSticker?: boolean; openedAt?: number };

function pack(t: ReturnType<typeof backend>, { giver, recipient, at: earnedAt = at, week = "2026-10-12", message: ref = message(1), holdsSticker = false, openedAt }: PackFields) {
  return t.seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week, message: ref, holdsSticker, at: earnedAt, ...(openedAt === undefined ? {} : { openedAt }) });
}

describe("waiting packs and the packs a giver earned", () => {
  test("the unopened packs wait oldest earned first, and an opened one leaves them", async () => {
    const t = backend();
    const [alice, bob, carol, dan] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL"), await t.member("U_DAN")];
    const late = await pack(t, { giver: alice, recipient: bob, at: at + 2 });
    const early = await pack(t, { giver: alice, recipient: carol, at });
    await pack(t, { giver: alice, recipient: dan, at: at + 1, openedAt: at + 3 });
    await pack(t, { giver: bob, recipient: alice });

    expect(await t.query((ctx) => waitingPacksOf(ctx, alice))).toEqual({
      packs: [
        { pack: early, person: carol, earnedAt: at },
        { pack: late, person: bob, earnedAt: at + 2 },
      ],
      more: false,
    });
  });

  test("51 waiting packs list 50 with more", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    for (let n = 0; n < 51; n++) await pack(t, { giver: alice, recipient: bob, at: at + n });

    const { packs, more } = await t.query((ctx) => waitingPacksOf(ctx, alice));
    expect([packs.length, packs.at(-1)?.earnedAt, more]).toEqual([50, at + 49, true]);
  });

  test("the packs earned in an interval include its start and leave out its end, at most as many as asked", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    for (const n of [0, 1, 2, 3]) await pack(t, { giver: alice, recipient: bob, at: at + n });

    expect((await t.query((ctx) => packsEarnedBetween(ctx, alice, { from: at + 1, to: at + 3 }, 10))).map(({ at: earned }) => earned)).toEqual([at + 1, at + 2]);
    expect((await t.query((ctx) => packsEarnedBetween(ctx, alice, { from: at, to: at + 4 }, 1))).map(({ at: earned }) => earned)).toEqual([at]);
  });

  test("the first pack for a person is the first one written, not the one earned first, and only its message is the first granted", async () => {
    const t = backend();
    const [alice, bob, carol] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL")];
    const first = await pack(t, { giver: alice, recipient: bob, message: message(1), week: "2026-10-19", at: at + 1 });
    const second = await pack(t, { giver: alice, recipient: bob, message: message(2), week: "2026-10-12", at });

    expect((await t.query((ctx) => firstPackGrantedFor(ctx, alice, bob)))?._id).toBe(first);
    expect(await t.query((ctx) => firstPackGrantedFor(ctx, alice, carol))).toBeNull();
    const [firstDoc, secondDoc] = [(await t.seed.get("thoughtfulPacks", first))!, (await t.seed.get("thoughtfulPacks", second))!];
    expect(await t.query(async (ctx) => [await isFirstPackFor(ctx, firstDoc), await isFirstPackFor(ctx, secondDoc)])).toEqual([true, false]);
    expect(await t.query(async (ctx) => [await isFirstPackGrantedFor(ctx, alice, bob, message(1)), await isFirstPackGrantedFor(ctx, alice, bob, message(2)), await isFirstPackGrantedFor(ctx, alice, carol, message(1))])).toEqual([true, false, false]);
  });

  test("the granted kudos of an interval are the told ones of the workspace, with a missing count read as 0", async () => {
    const t = backend();
    await t.seed.insert("grantsTold", { message: message(1), at, recipients: 3 });
    await t.seed.insert("grantsTold", { message: message(2), at: at + 1 });
    await t.seed.insert("grantsTold", { message: message(3), at: at + 2, recipients: 1 });
    await t.seed.insert("grantsTold", { message: { ...message(4), workspace: "T2" }, at, recipients: 1 });
    await t.seed.insert("grantsTold", { message: message(5) });

    expect(await t.query((ctx) => grantedKudosBetween(ctx, "T1", { from: at, to: at + 2 }, 10))).toEqual([
      { message: message(1), at, recipients: 3 },
      { message: message(2), at: at + 1, recipients: 0 },
    ]);
  });
});

describe("packs given before the ledger earn their items", () => {
  test("a pack earns its hoggie at today's rarities and, when it holds one, the person's sticker; again earns nothing", async () => {
    const t = backend();
    const [alice, bob, carol] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL")];
    const withSticker = await pack(t, { giver: alice, recipient: bob, holdsSticker: true });
    const without = await pack(t, { giver: alice, recipient: carol, message: message(2) });

    for (let again = 0; again < 2; again++) {
      for (const id of [withSticker, without]) {
        const stored = (await t.seed.get("thoughtfulPacks", id))!;
        await t.mutation((ctx) => earnItemsOfAPackGivenBeforeTheLedger(ctx, stored));
      }
    }

    expect((await t.seed.all("items")).map(({ _id, _creationTime, ...item }) => item)).toEqual([
      { workspace: "T1", member: alice, source: "hoggie", key: crateKeyOf(withSticker), reason: { kind: "thanks", person: bob, message: message(1) }, earnedAt: at },
      { workspace: "T1", member: alice, source: "sticker", key: withSticker, reason: { kind: "thanks", person: bob, message: message(1) }, earnedAt: at },
      { workspace: "T1", member: alice, source: "hoggie", key: crateKeyOf(without), reason: { kind: "thanks", person: carol, message: message(2) }, earnedAt: at },
    ]);
  });
});

function kudosGiven(giver: MemberId, recipients: MemberId[], ref: MessageRef = message(9)): KudosGivenEvent {
  return {
    type: "kudosGiven",
    workspace: "T1",
    message: ref,
    giver,
    awards: recipients.map((recipient, n) => ({ award: `award-${n}` as Id<"awards">, giver, recipient, kudos: 1 })),
    via: "message",
    kudosEmoji: "taco",
    annotations: {},
    allowance: { dailyOpening: 5, dailyLeft: 4 },
    skippedMentions: 0,
    retry: false,
    inThread: false,
    day: "2026-10-14",
    at,
  };
}

describe("AL4 AL5: a grant in a week that already earned the pack", () => {
  test("records nextWeek for each recipient, tells the message once with its recipients, and a redelivery writes nothing more", async () => {
    const t = backend();
    const [alice, bob, carol] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL")];
    for (const recipient of [bob, carol]) await pack(t, { giver: alice, recipient, week: "2026-10-12" });
    const event = kudosGiven(alice, [bob, carol, bob, alice]);

    await t.mutation((ctx) => grantThoughtfulPacks(ctx, { event }));
    await t.mutation((ctx) => grantThoughtfulPacks(ctx, { event }));

    expect((await t.seed.all("thoughtfulPacks")).length).toBe(2);
    expect((await t.seed.all("grantRecords")).map(({ recipient, outcome, message: ref }) => ({ recipient, outcome, ref }))).toEqual([
      { recipient: bob, outcome: "nextWeek", ref: message(9) },
      { recipient: carol, outcome: "nextWeek", ref: message(9) },
    ]);
    expect((await t.seed.all("grantsTold")).map(({ message: ref, at: told, recipients }) => ({ ref, told, recipients }))).toEqual([{ ref: message(9), told: at, recipients: 2 }]);
    expect(await t.published()).toEqual([
      {
        type: "thoughtfulPacksGranted",
        workspace: "T1",
        giver: alice,
        message: message(9),
        outcomes: [
          { recipient: bob, outcome: "nextWeek" },
          { recipient: carol, outcome: "nextWeek" },
        ],
        at,
        fact: expect.any(String),
      },
    ]);
  });

  test("a message to 120 people grants 50 a job, schedules the rest, and is told once, after its last page", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");
    const recipients: MemberId[] = [];
    for (let n = 0; n < 120; n++) recipients.push(await t.member(`U_${n}`));
    for (const recipient of recipients) await pack(t, { giver: alice, recipient });
    const event = kudosGiven(alice, recipients);

    // Each later page runs from the args its job was queued with, as the worker runs them.
    const queued = async () => (await t.scheduled("album.packs.grantThoughtfulPacks")).map(({ args }) => grantThoughtfulPacksArgs.parse(args));
    const told = async () => ({ records: (await t.seed.all("grantRecords")).length, told: (await t.seed.all("grantsTold")).length, published: (await t.published()).length });

    await t.mutation((ctx) => grantThoughtfulPacks(ctx, { event }));
    expect(await queued()).toEqual([{ event, from: 50 }]);
    expect(await told()).toEqual({ records: 50, told: 0, published: 0 });

    const [second] = await queued();
    await t.mutation((ctx) => grantThoughtfulPacks(ctx, second!));
    expect(await queued()).toEqual([{ event, from: 50 }, { event, from: 100 }]);
    expect(await told()).toEqual({ records: 100, told: 0, published: 0 });

    const third = (await queued())[1]!;
    await t.mutation((ctx) => grantThoughtfulPacks(ctx, third));
    await t.mutation((ctx) => grantThoughtfulPacks(ctx, third));

    expect((await t.seed.all("grantRecords")).length).toBe(120);
    expect((await queued()).map(({ from }) => from)).toEqual([50, 100]);
    expect((await t.published()).map(({ outcomes }) => (outcomes as unknown[]).length)).toEqual([120]);
    expect((await t.seed.all("grantsTold")).map(({ recipients: told }) => told)).toEqual([120]);
  });

  test("the album subscribes the grant to kudosGiven", () => {
    expect(serviceRegistry.subscribers.get("kudosGiven")?.map(({ job }) => job.name)).toContain("album.packs.grantThoughtfulPacks");
  });
});

describe("a grant's records and its telling are read as unique() read them", () => {
  test("two records for one recipient, or two tellings of one message, fail the grant with Convex's refusal", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    for (let again = 0; again < 2; again++) await t.seed.insert("grantRecords", { giver: alice, message: message(8), recipient: bob, outcome: "nextWeek" });
    await expect(t.mutation((ctx) => grantThoughtfulPacks(ctx, { event: kudosGiven(alice, [bob], message(8)) }))).rejects.toThrow("unique() query returned more than one result from table grantRecords:");

    await t.seed.insert("grantRecords", { giver: alice, message: message(7), recipient: bob, outcome: "nextWeek" });
    for (let again = 0; again < 2; again++) await t.seed.insert("grantsTold", { message: message(7), at, recipients: 1 });
    await expect(t.mutation((ctx) => grantThoughtfulPacks(ctx, { event: kudosGiven(alice, [bob], message(7)) }))).rejects.toThrow("unique() query returned more than one result from table grantsTold:");
  });
});
