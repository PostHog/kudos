// Opening a thoughtful pack and the tray, on the service's transaction: the bodies of opening.ts that reach no other
// stack. An open that passes its checks reaches S10's hoggie drops and S9's tallies and random emojis; its tests are in
// the ported files beside this one.
import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { Log } from "../log.ts";
import { createOperations, type MutationContext, type QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { earnItem, markTurned } from "./items/ledger.ts";
import { earnTrayItem, openThePackOnceAllTurned, openThoughtfulPack, trayItemKeyed, trayKeyOf, trayOf } from "./opening.ts";
import { crateKeyOf, thanksEarningOf } from "./packs.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const at = new Date("2026-10-13T10:00:00Z").getTime();
const ref: MessageRef = { workspace: "T1", conversation: "C1", message: "1760000000.000001" };

// The one setup of this file: the operation runner on the test database and the seeder. S4's in-process backend
// replaces it.
function backend() {
  const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => at }), log: quiet, retryDelayMs: () => 1 });
  const seed = seeder(operations);
  return {
    seed,
    mutation: <T>(handler: (ctx: MutationContext) => Promise<T>) => operations.mutation("test.mutation", handler),
    query: <T>(handler: (ctx: QueryContext) => Promise<T>) => operations.query("test.query", handler),
    member: (user: string) => seed.insert("members", { workspace: "T1", user, kind: "member" }) as Promise<MemberId>,
    pack: (giver: MemberId, recipient: MemberId, extra: { holdsSticker?: boolean; openedAt?: number } = {}) =>
      seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week: "2026-10-12", message: ref, holdsSticker: extra.holdsSticker ?? false, at, ...(extra.openedAt === undefined ? {} : { openedAt: extra.openedAt }) }),
    hoggieInTheTray: (member: MemberId, pack: Id<"thoughtfulPacks">, extra: { at?: number; putInAt?: number } = {}) =>
      seed.insert("trayItems", { member, pack, at: extra.at ?? at, kind: "hoggie", hoggie: "hoggie-1", rarity: "rare", isNew: true, ...(extra.putInAt === undefined ? {} : { putInAt: extra.putInAt }) }),
    stickerInTheTray: (member: MemberId, pack: Id<"thoughtfulPacks">, person: MemberId) => seed.insert("trayItems", { member, pack, at, kind: "sticker", person }),
  };
}

async function itemsOfThePack(t: ReturnType<typeof backend>, pack: Id<"thoughtfulPacks">) {
  const stored = (await t.seed.get("thoughtfulPacks", pack))!;
  const earning = thanksEarningOf(stored);
  const hoggie = await t.mutation((ctx) => earnItem(ctx, { ...earning, source: "hoggie", key: crateKeyOf(pack) }));
  const sticker = await t.mutation((ctx) => earnItem(ctx, { ...earning, source: "sticker", key: pack }));
  return { hoggie: (await t.seed.get("items", hoggie))!, sticker: (await t.seed.get("items", sticker))!, giver: stored.giver };
}

describe("an open refuses before it draws, and writes nothing", () => {
  test("another member's pack, an opened pack and a pack that doesn't exist answer null", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const bobs = await t.pack(bob, alice);
    const opened = await t.pack(alice, bob, { openedAt: at - 1 });

    expect(await t.mutation((ctx) => openThoughtfulPack(ctx, alice, bobs, at))).toBeNull();
    expect(await t.mutation((ctx) => openThoughtfulPack(ctx, alice, opened, at))).toBeNull();
    expect(await t.mutation((ctx) => openThoughtfulPack(ctx, alice, "no-such-pack" as Id<"thoughtfulPacks">, at))).toBeNull();

    expect((await t.seed.all("thoughtfulPacks")).map(({ openedAt }) => openedAt)).toEqual([undefined, at - 1]);
    expect(await t.seed.all("trayItems")).toEqual([]);
    expect(await t.seed.all("items")).toEqual([]);
  });
});

describe("LP6: a pack opens once every item it held is turned", () => {
  test("turning its hoggie leaves it waiting while its sticker is face down, and turning the sticker opens it", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const pack = await t.pack(alice, bob, { holdsSticker: true });
    const { hoggie, sticker } = await itemsOfThePack(t, pack);
    const openedAt = async () => (await t.seed.get("thoughtfulPacks", pack))!.openedAt;

    await t.mutation((ctx) => markTurned(ctx, alice, "hoggie", hoggie.key, at + 1));
    await t.mutation((ctx) => openThePackOnceAllTurned(ctx, hoggie, at + 1));
    expect(await openedAt()).toBeUndefined();

    await t.mutation((ctx) => markTurned(ctx, alice, "sticker", sticker.key, at + 2));
    await t.mutation((ctx) => openThePackOnceAllTurned(ctx, sticker, at + 2));
    expect(await openedAt()).toBe(at + 2);

    await t.mutation((ctx) => openThePackOnceAllTurned(ctx, hoggie, at + 3));
    expect(await openedAt()).toBe(at + 2);
  });

  test("a pack without a sticker opens once its hoggie is turned", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const pack = await t.pack(alice, bob);
    const { hoggie } = await itemsOfThePack(t, pack);

    await t.mutation((ctx) => openThePackOnceAllTurned(ctx, hoggie, at + 1));
    expect((await t.seed.get("thoughtfulPacks", pack))!.openedAt).toBeUndefined();

    await t.mutation((ctx) => markTurned(ctx, alice, "hoggie", hoggie.key, at + 2));
    await t.mutation((ctx) => openThePackOnceAllTurned(ctx, hoggie, at + 2));
    expect((await t.seed.get("thoughtfulPacks", pack))!.openedAt).toBe(at + 2);
  });

  test("an item of no pack, a tray hoggie and a key naming no pack open nothing", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    await t.pack(alice, bob);
    const item = (key: string, source: "hoggie" | "sticker" = "hoggie"): Doc<"items"> =>
      ({ _id: "item", _creationTime: at, workspace: "T1", member: alice, source, key, reason: { kind: "welcome" }, earnedAt: at, turnedAt: at }) as Doc<"items">;

    for (const key of ["welcome:first", "tray:some-tray-item", "thoughtful:no-such-pack"]) await t.mutation((ctx) => openThePackOnceAllTurned(ctx, item(key), at));
    await t.mutation((ctx) => openThePackOnceAllTurned(ctx, item("no-such-pack", "sticker"), at));

    expect((await t.seed.all("thoughtfulPacks")).map(({ openedAt }) => openedAt)).toEqual([undefined]);
  });
});

describe("the tray", () => {
  test("lists what waits in the order it was opened, a sticker by its person and a hoggie by its face, and leaves out what is put in", async () => {
    const t = backend();
    const [alice, bob, carol] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL")];
    const pack = await t.pack(alice, bob);
    const sticker = await t.stickerInTheTray(alice, pack, bob);
    await t.hoggieInTheTray(alice, pack, { putInAt: at + 1 });
    const hoggie = await t.hoggieInTheTray(alice, pack);
    await t.hoggieInTheTray(carol, pack);

    expect(await t.query((ctx) => trayOf(ctx, alice))).toEqual({
      tray: [
        { item: sticker, kind: "sticker", person: bob },
        { item: hoggie, kind: "hoggie", hoggie: "hoggie-1", rarity: "rare", isNew: true },
      ],
      more: false,
    });
  });

  test("101 waiting show the first 100 opened, with more", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const pack = await t.pack(alice, bob);
    const ids: string[] = [];
    for (let n = 0; n < 101; n++) ids.push(await t.hoggieInTheTray(alice, pack, { at: at - n }));

    const { tray, more } = await t.query((ctx) => trayOf(ctx, alice));
    expect({ shown: tray.map(({ item }) => item), more }).toEqual({ shown: ids.slice(0, 100), more: true });
  });

  test("a tray item is found by its key, and a key of no tray item finds nothing", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const pack = await t.pack(alice, bob);
    const hoggie = await t.hoggieInTheTray(alice, pack);

    expect((await t.query((ctx) => trayItemKeyed(ctx, trayKeyOf(hoggie))))?._id).toBe(hoggie);
    expect(await t.query((ctx) => trayItemKeyed(ctx, hoggie))).toBeNull();
    expect(await t.query((ctx) => trayItemKeyed(ctx, trayKeyOf("no-such-item" as Id<"trayItems">)))).toBeNull();
  });

  test("a tray sticker earns the pack's sticker item and a tray hoggie an item keyed by the tray, each once", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const pack = await t.pack(alice, bob, { holdsSticker: true });
    const stored = (await t.seed.get("thoughtfulPacks", pack))!;
    const sticker = (await t.seed.get("trayItems", await t.stickerInTheTray(alice, pack, bob)))!;
    const hoggie = (await t.seed.get("trayItems", await t.hoggieInTheTray(alice, pack)))!;

    for (let again = 0; again < 2; again++) {
      await t.mutation((ctx) => earnTrayItem(ctx, sticker, stored));
      await t.mutation((ctx) => earnTrayItem(ctx, hoggie, stored));
    }

    const reason = { kind: "thanks", person: bob, message: ref };
    expect((await t.seed.all("items")).map(({ member, source, key, reason: why, earnedAt }) => ({ member, source, key, why, earnedAt }))).toEqual([
      { member: alice, source: "sticker", key: pack, why: reason, earnedAt: at },
      { member: alice, source: "hoggie", key: trayKeyOf(hoggie._id), why: reason, earnedAt: at },
    ]);
  });
});
