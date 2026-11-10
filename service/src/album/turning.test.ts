// Putting tray items in and turning items, on the service's transaction: the paths of putIn.ts and items/turn.ts that
// reach no other stack. A put-in or turn that lands reaches S10's drops and team pages and S9's album stickers, tallies
// and emojis; its tests are in the ported files beside this one.
import { asc } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { subscribersOf, type Subscription } from "../bus/publish.ts";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import { jobs } from "../db/schema/index.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { mutationJob } from "../jobs/define.ts";
import type { Log } from "../log.ts";
import { createOperations, type MutationContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { turn } from "./items/turn.ts";
import { trayKeyOf } from "./opening.ts";
import { markTrayStickerPutIn, putItemIn } from "./putIn.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const at = new Date("2026-10-13T10:00:00Z").getTime();
const ref: MessageRef = { workspace: "T1", conversation: "C1", message: "1760000000.000001" };

// The one setup of this file: the operation runner on the test database and the seeder, with a recording subscriber
// on the events a put-in and a turn publish, so a refusal that publishes queues a job. S4's in-process backend
// replaces it.
const recorder = mutationJob("test.published", z.object({ event: z.looseObject({ type: z.string() }) }), async () => {});
function backend() {
  const subscriptions = [{ event: "itemTurned", job: recorder }, { event: "stickerPutIn", job: recorder }] as Subscription<any>[];
  const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => at }), log: quiet, retryDelayMs: () => 1, subscribers: subscribersOf(subscriptions) });
  const seed = seeder(operations);
  return {
    seed,
    mutation: <T>(handler: (ctx: MutationContext) => Promise<T>) => operations.mutation("test.mutation", handler),
    member: (user: string) => seed.insert("members", { workspace: "T1", user, kind: "member" }) as Promise<MemberId>,
    pack: (giver: MemberId, recipient: MemberId) => seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week: "2026-10-12", message: ref, holdsSticker: true, at }),
    hoggieInTheTray: (member: MemberId, pack: Id<"thoughtfulPacks">, putInAt?: number) =>
      seed.insert("trayItems", { member, pack, at, kind: "hoggie", hoggie: "hoggie-1", rarity: "rare", isNew: true, ...(putInAt === undefined ? {} : { putInAt }) }),
    stickerInTheTray: (member: MemberId, pack: Id<"thoughtfulPacks">, person: MemberId, putInAt?: number) =>
      seed.insert("trayItems", { member, pack, at, kind: "sticker", person, ...(putInAt === undefined ? {} : { putInAt }) }),
    item: (member: MemberId, fields: { source?: "hoggie" | "sticker"; key: string; reason?: Record<string, unknown>; turnedAt?: number }) =>
      seed.insert("items", { workspace: "T1", member, source: fields.source ?? "hoggie", key: fields.key, reason: (fields.reason ?? { kind: "welcome" }) as never, earnedAt: at, ...(fields.turnedAt === undefined ? {} : { turnedAt: fields.turnedAt }) }),
    scheduled: () => operations.query("test.scheduled", async ({ tx }) => (await tx.select({ name: jobs.name }).from(jobs).orderBy(asc(jobs._creationTime))).map(({ name }) => name)),
  };
}

const owner = (member: MemberId) => ({ workspace: "T1", member });

describe("a put-in refuses and writes nothing", () => {
  test("another member's tray item, one already put in and one that doesn't exist answer null", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const pack = await t.pack(alice, bob);
    const bobs = await t.hoggieInTheTray(bob, pack);
    const putIn = await t.hoggieInTheTray(alice, pack, at - 1);

    expect(await t.mutation((ctx) => putItemIn(ctx, owner(alice), bobs, at))).toBeNull();
    expect(await t.mutation((ctx) => putItemIn(ctx, owner(alice), putIn, at))).toBeNull();
    expect(await t.mutation((ctx) => putItemIn(ctx, owner(alice), "no-such-item" as Id<"trayItems">, at))).toBeNull();

    expect((await t.seed.all("trayItems")).map(({ putInAt }) => putInAt)).toEqual([undefined, at - 1]);
    expect(await t.scheduled()).toEqual([]);
  });
});

describe("a sticker put in from the book leaves the tray", () => {
  test("its pack's waiting tray sticker is marked put in, a put-in one keeps its time, and a pack without one is left", async () => {
    const t = backend();
    const [alice, bob, carol] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL")];
    const [waiting, earlier, none] = [await t.pack(alice, bob), await t.pack(alice, carol), await t.pack(bob, carol)];
    const hoggie = await t.hoggieInTheTray(alice, waiting);
    const sticker = await t.stickerInTheTray(alice, waiting, bob);
    const earlierSticker = await t.stickerInTheTray(alice, earlier, carol, at - 5);

    for (const pack of [waiting, earlier, none]) await t.mutation((ctx) => markTrayStickerPutIn(ctx, pack, at));

    const putInAt = async (item: string) => (await t.seed.get("trayItems", item))!.putInAt;
    expect([await putInAt(sticker), await putInAt(earlierSticker), await putInAt(hoggie)]).toEqual([at, at - 5, undefined]);
  });
});

describe("LP10: turnItem refuses and writes nothing", () => {
  test("another member's item and a missing item are refused", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const bobs = await t.item(bob, { key: "welcome:first" });

    expect(await t.mutation((ctx) => turn(ctx, owner(alice), bobs as Id<"items">, at))).toBeNull();
    expect(await t.mutation((ctx) => turn(ctx, owner(alice), "no-such-item" as Id<"items">, at))).toBeNull();
    expect((await t.seed.all("items")).map(({ turnedAt }) => turnedAt)).toEqual([undefined]);
    expect(await t.scheduled()).toEqual([]);
  });

  test("an achievement's item is refused while achievement hoggies are off", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");
    const team = await t.item(alice, { key: "team:T_ONE", reason: { kind: "team", team: "T_ONE", name: "One" } });

    expect(await t.mutation((ctx) => turn(ctx, owner(alice), team as Id<"items">, at))).toBeNull();
    expect((await t.seed.all("items")).map(({ turnedAt }) => turnedAt)).toEqual([undefined]);
    expect(await t.scheduled()).toEqual([]);
  });

  test("a tray hoggie's item lands nothing when its tray item is gone, another member's or already put in", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const pack = await t.pack(alice, bob);
    const bobs = await t.hoggieInTheTray(bob, pack);
    const putIn = await t.hoggieInTheTray(alice, pack, at - 1);
    const keys = [trayKeyOf("no-such-item" as Id<"trayItems">), trayKeyOf(bobs as Id<"trayItems">), trayKeyOf(putIn as Id<"trayItems">)];
    const turning = [];
    for (const key of keys) turning.push(await t.item(alice, { key }));

    for (const item of turning) expect(await t.mutation((ctx) => turn(ctx, owner(alice), item as Id<"items">, at))).toBeNull();

    expect((await t.seed.all("items")).map(({ turnedAt }) => turnedAt)).toEqual([undefined, undefined, undefined]);
    expect((await t.seed.all("trayItems")).map(({ putInAt }) => putInAt)).toEqual([undefined, at - 1]);
    expect(await t.scheduled()).toEqual([]);
  });

  test("a sticker item for no thanks lands nothing", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");
    const sticker = await t.item(alice, { source: "sticker", key: "welcome:first" });

    expect(await t.mutation((ctx) => turn(ctx, owner(alice), sticker as Id<"items">, at))).toBeNull();
    expect((await t.seed.all("items")).map(({ turnedAt }) => turnedAt)).toEqual([undefined]);
    expect(await t.scheduled()).toEqual([]);
  });
});

describe("LP12: a turned tray hoggie whose tray item is gone answers nothing again", () => {
  test("turning it again answers null and changes nothing", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");
    const item = await t.item(alice, { key: trayKeyOf("no-such-item" as Id<"trayItems">), turnedAt: at - 1 });

    expect(await t.mutation((ctx) => turn(ctx, owner(alice), item as Id<"items">, at))).toBeNull();
    expect((await t.seed.get("items", item))!.turnedAt).toBe(at - 1);
    expect(await t.scheduled()).toEqual([]);
  });
});
