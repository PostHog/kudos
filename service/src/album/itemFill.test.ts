// The item fill and the paged ledger read, on S11's shared paginate: the fill walks every member in the order they
// joined, page by page through its own jobs, and earns the items of what came before the item ledger. Its level-up step
// reaches S10's drops.
import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { stillWaiting } from "../../testing/waiting.ts";
import type { Id } from "../db/columns.ts";
import { toDocument } from "../db/documents.ts";
import { jobs } from "../db/schema/index.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { fillItemsJob, mostFilledOfAKind } from "./items/fill.ts";
import { waitingPageOf } from "./items/ledger.ts";
import { trayKeyOf } from "./opening.ts";
import { crateKeyOf } from "./packs.ts";

const at = new Date("2026-10-13T10:00:00Z").getTime();
const ref: MessageRef = { workspace: "T1", conversation: "C1", message: "1760000000.000001" };
const startBackend = useTestBackend({ now: at });

function backend() {
  const t = startBackend();
  return {
    ...t,
    member: (user: string) => t.seed.insert("members", { workspace: "T1", user, kind: "member" }) as Promise<MemberId>,
    pack: (giver: MemberId, recipient: MemberId, extra: { holdsSticker?: boolean; openedAt?: number } = {}) =>
      t.seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week: "2026-10-12", message: ref, holdsSticker: extra.holdsSticker ?? false, at, ...(extra.openedAt === undefined ? {} : { openedAt: extra.openedAt }) }),
    hoggieInTheTray: (member: MemberId, pack: Id<"thoughtfulPacks">, putInAt?: number) =>
      t.seed.insert("trayItems", { member, pack, at, kind: "hoggie", hoggie: "hoggie-1", rarity: "rare", isNew: true, ...(putInAt === undefined ? {} : { putInAt }) }),
    faceDown: (member: MemberId, key: string, reason: Record<string, unknown>, earnedAt: number, turnedAt?: number) =>
      t.seed.insert("items", { workspace: "T1", member, source: "hoggie", key, reason: reason as never, earnedAt, ...(turnedAt === undefined ? {} : { turnedAt }) }) as Promise<Id<"items">>,
    // Starts the fill as an operator would, with no step, and runs every page it schedules.
    fill: async () => {
      await t.run((ctx) => ctx.jobs.enqueue(fillItemsJob, {}));
      expect((await t.settle()).done).toBe(true);
    },
    earned: async () => (await t.seed.all("items")).map(({ member, source, key }) => ({ member, source, key })),
    fillSteps: () =>
      t.query(async ({ tx }) => (await tx.select().from(jobs).where(eq(jobs.name, fillItemsJob.name)).orderBy(asc(jobs._creationTime), asc(jobs._id))).map((row) => fillItemsJob.args.parse(toDocument<{ args: unknown }>(jobs, row).args).step)),
  };
}

describe("the item fill", () => {
  test("earns the items of every member's unopened packs and waiting tray hoggies, and nothing for opened packs or what is put in", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const unopened = await t.pack(alice, bob, { holdsSticker: true });
    await t.pack(alice, bob, { openedAt: at });
    const bobsPack = await t.pack(bob, alice, { openedAt: at });
    const waiting = await t.hoggieInTheTray(bob, bobsPack);
    await t.hoggieInTheTray(bob, bobsPack, at);

    await t.fill();

    expect(await t.earned()).toEqual([
      { member: alice, source: "hoggie", key: crateKeyOf(unopened) },
      { member: alice, source: "sticker", key: unopened },
      { member: bob, source: "hoggie", key: trayKeyOf(waiting) },
    ]);
    expect((await t.fillSteps()).map((step) => step && { member: step.member, kind: step.kind })).toEqual([
      undefined,
      { member: alice, kind: "tray" },
      { member: alice, kind: "levels" },
      { member: bob, kind: "packs" },
      { member: bob, kind: "tray" },
      { member: bob, kind: "levels" },
    ]);
  });

  test("walks more than a page from the cursor its job carries, and a walk started again from the start earns nothing more", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const packs: Id<"thoughtfulPacks">[] = [];
    for (let n = 0; n <= mostFilledOfAKind; n++) packs.push(await t.pack(alice, bob));

    await t.fill();
    const firstWalk = await t.earned();
    expect(firstWalk.map(({ key }) => key).sort()).toEqual(packs.map(crateKeyOf).sort());
    expect((await t.fillSteps()).filter((step) => step?.kind === "packs" && step.cursor !== undefined)).toHaveLength(1);

    await t.fill();
    expect(await t.earned()).toEqual(firstWalk);
  });

  test("drops a member's face-down level-up hoggies once per level (waits on S10)", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");
    await t.faceDown(alice, "level-up:2:a", { kind: "levelUp", level: 2 }, at);

    expect(await stillWaiting(["S10"], () => t.fill())).toBe("album.levelUpHoggies.dropLevelUpHoggies");
  });
});

describe("a member's face-down items, a page at a time", () => {
  test("come in the board's order, by when each was earned, and the cursor continues after the page", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const third = await t.faceDown(alice, "c", { kind: "welcome" }, at + 3);
    const first = await t.faceDown(alice, "a", { kind: "welcome" }, at + 1);
    await t.faceDown(alice, "turned", { kind: "welcome" }, at, at + 5);
    await t.faceDown(bob, "bobs", { kind: "welcome" }, at);
    const second = await t.faceDown(alice, "b", { kind: "welcome" }, at + 2);

    const one = await t.query((ctx) => waitingPageOf(ctx, alice, null, 2));
    const two = await t.query((ctx) => waitingPageOf(ctx, alice, one.continueCursor, 2));

    expect([one.page.map(({ _id }) => _id), one.isDone]).toEqual([[first, second], false]);
    expect([two.page.map(({ _id }) => _id), two.isDone]).toEqual([[third], true]);
  });
});
