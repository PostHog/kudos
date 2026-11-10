// Hoggie drops, the collection, avatars, bought crates and level-up finds on the service's transaction: the bodies of
// S10's first slice, driven through the operation runner on Postgres with flags from the fake PostHog. Tests that reach
// another stack's body (buying a crate spends from the wallet, earning level-up items writes the item ledger) follow in
// the ported files once those stacks merge.
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../../testing/database.ts";
import { definitionsStored, onForEveryone, postHogDeciding } from "../../../testing/flags.ts";
import { seeder } from "../../../testing/seed.ts";
import { subscribersOf, type Subscription } from "../../bus/publish.ts";
import { createClock } from "../../clock.ts";
import { toDocument } from "../../db/documents.ts";
import { flagExposures, jobs } from "../../db/schema/index.ts";
import { fromTheNewestDecided } from "../../engine/awards.ts";
import { mutationJob } from "../../jobs/define.ts";
import type { Log } from "../../log.ts";
import { createOperations, type MutationContext, type QueryContext } from "../../operations.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { albumHoggiesOf } from "../albumHoggies.ts";
import { levelUpCrateKeyOf, levelUpHoggiesOf, levelUpRevealOnFor } from "../levelUpHoggies.ts";
import { avatarChoiceOf, avatarOf, avatarShownOn, setAvatar } from "./avatar.ts";
import { boughtCrateOpened, boughtCratesWaitingFor, openCrate, openedCrateDropOf, waitingCratesOf } from "./boughtCrates.ts";
import { catalogue, crestWith, hoggieNamed, hoggiesOfRarity } from "./catalogue.ts";
import { collectionOf, crestsCollectedBy, hoggiesOf, hoggiesOwnedBy } from "./collection.ts";
import type { CrateKey } from "./crateKey.ts";
import { drawOf } from "./draw.ts";
import { dropFor, dropOf, droppedIn, dropsByDecision, foundIn, lastFoundBy, packOf, putDropIn, recordFind, tallyOf, type DroppedAt } from "./drops.ts";
import { highestForgedFor, rarityCapsShownTo, rarityRangeFor, welcomeRarities } from "./rarityCaps.ts";

// S3 ports the directory. Until it merges, `chatUserOf` reads the member's row as today's does; nothing else of the
// directory is stood in for.
vi.mock("../../workspace/directory.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../workspace/directory.ts")>();
  const { members } = await import("../../db/schema/index.ts");
  return {
    ...actual,
    chatUserOf: async ({ tx }: QueryContext, member: MemberId) => {
      const [row] = await tx.select({ workspace: members.workspace, user: members.user }).from(members).where(eq(members._id, member));
      if (row === undefined) throw new Error("no such member in the directory");
      return row;
    },
  };
});

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const at = Date.parse("2026-10-14T10:00:00Z");
const hour = 60 * 60 * 1000;
const secret = "draw-test";

// The events the code under test published, read back from the jobs a recording subscriber got.
const recorder = mutationJob("test.published", z.object({ event: z.looseObject({ type: z.string() }) }), async () => {});
const recorded = ["hoggieDropped", "crateBought"].map((event) => ({ event, job: recorder })) as Subscription<any>[];

function backend() {
  let offset = 0;
  const clock = createClock({ real: () => at + offset });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1, subscribers: subscribersOf(recorded) });
  const seed = seeder(operations);
  return {
    seed,
    later: (ms: number) => void (offset += ms),
    flagsOn: (...keys: string[]) => definitionsStored(operations, ...keys.map(onForEveryone)),
    mutation: <T>(handler: (ctx: MutationContext) => Promise<T>) => operations.mutation("test.mutation", handler),
    query: <T>(handler: (ctx: QueryContext) => Promise<T>) => operations.query("test.query", handler),
    published: () =>
      operations.query("test.published", async ({ tx }) => {
        const rows = await tx.select().from(jobs).where(eq(jobs.name, recorder.name)).orderBy(asc(jobs._creationTime), asc(jobs._id));
        return rows.map((row) => toDocument<{ args: { event: Record<string, unknown> } }>(jobs, row).args.event);
      }),
    exposures: () =>
      operations.query("test.exposures", async ({ tx }) => (await tx.select().from(flagExposures)).map(({ member, flag }) => ({ member, flag }))),
    member: (user: string) => seed.insert("members", { workspace: "T1", user, kind: "member" }) as Promise<MemberId>,
  };
}

type Backend = ReturnType<typeof backend>;

async function collecting(...alsoOn: string[]) {
  const t = backend();
  await t.seed.insert("workspaceKeys", { workspace: "T1", workspaceKey: "workspace-key" });
  await t.flagsOn("collection", ...alsoOn);
  return { t, alice: await t.member("U_ALICE") };
}

const drawn = (hoggie: string) => ({ hoggie, rarity: hoggieNamed(hoggie)!.rarity });

function find(t: Backend, member: MemberId, crate: CrateKey, hoggie: string, waits = false) {
  return t.mutation((ctx) => recordFind(ctx, member, crate, drawn(hoggie), ctx.now, { waits }));
}

async function walk(t: Backend, member: MemberId, below = fromTheNewestDecided): Promise<DroppedAt[]> {
  return t.query(async (ctx) => {
    const walked: DroppedAt[] = [];
    for await (const dropped of dropsByDecision(ctx, member, below, { crests: false })) walked.push(dropped);
    return walked;
  });
}

beforeEach(() => {
  vi.stubEnv("HOGGIE_DRAW_SECRET", secret);
  postHogDeciding("sandbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a drop", () => {
  test("a member's first drop in a crate records the hoggie their draw names as a first copy, tallies it and publishes it; the crate never drops again", async () => {
    const { t, alice } = await collecting();
    const expected = await drawOf({ secret, member: alice, crate: "quest:week-1", version: catalogue.version });

    await t.mutation((ctx) => dropFor(ctx, alice, "quest:week-1", at, { surface: "website" }));
    await t.mutation((ctx) => dropFor(ctx, alice, "quest:week-1", at + hour, {}));

    expect(await t.seed.all("drops")).toEqual([expect.objectContaining({ member: alice, crate: "quest:week-1", ...expected, n: 1, copy: 1, catalogueVersion: catalogue.version, at, crest: null })]);
    expect(await t.seed.all("hoggieTallies")).toEqual([expect.objectContaining({ member: alice, hoggie: expected.hoggie, count: 1, firstAt: at, firstN: 1 })]);
    expect(await t.seed.all("dropTallies")).toEqual([expect.objectContaining({ member: alice, drops: 1 })]);
    expect(await t.published()).toEqual([{ type: "hoggieDropped", workspace: "T1", member: alice, crate: "quest:week-1", ...expected, copy: 1, at, surface: "website", fact: expect.any(String) }]);
    expect(await t.exposures()).toContainEqual({ member: alice, flag: "collection" });
  });

  test("with the collection flag off, nothing drops and nothing is published", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");

    await t.mutation((ctx) => dropFor(ctx, alice, "quest:week-1", at, {}));

    expect(await t.seed.all("drops")).toEqual([]);
    expect(await t.seed.all("hoggieTallies")).toEqual([]);
    expect(await t.published()).toEqual([]);
  });

  test("a drop that asks for an unowned hoggie draws among those the member doesn't hold", async () => {
    const { t, alice } = await collecting();
    const [unowned, ...rest] = hoggiesOfRarity("rare").map(({ hoggie }) => hoggie);
    for (const [n, hoggie] of rest.entries()) await find(t, alice, `quest:week-${n}`, hoggie);

    await t.mutation((ctx) => dropFor(ctx, alice, "welcome:1", at, { floor: "rare", cap: "rare", weights: "base", unowned: true }));

    expect((await t.query((ctx) => foundIn(ctx, alice, "welcome:1", { crests: false })))?.hoggie).toBe(unowned);
  });

  test("a drop from a source with rarity caps draws today's range while the member is out of the flag, and the capped one in it", async () => {
    const { t, alice } = await collecting();

    expect(await t.mutation((ctx) => rarityRangeFor(ctx, alice, welcomeRarities))).toEqual(welcomeRarities.today);
    expect(await t.query((ctx) => rarityCapsShownTo(ctx, alice))).toBe(false);
    expect(await t.query((ctx) => highestForgedFor(ctx, alice))).toBe("legendary");

    await t.flagsOn("collection", "rarity-caps");
    expect(await t.mutation((ctx) => rarityRangeFor(ctx, alice, welcomeRarities))).toEqual(welcomeRarities.capped);
    expect(await t.query((ctx) => highestForgedFor(ctx, alice))).toBe("rare");
    expect(await t.exposures()).toContainEqual({ member: alice, flag: "rarity-caps" });
  });

  test("finding a hoggie again is its next copy: the tally counts it and keeps when and at which drop it was first found", async () => {
    const { t, alice } = await collecting();
    await find(t, alice, "quest:week-1", "ball");
    t.later(hour);
    await find(t, alice, "quest:week-2", "banana");
    t.later(hour);
    await find(t, alice, "quest:week-3", "ball");

    expect((await t.seed.all("drops")).map(({ hoggie, n, copy }) => ({ hoggie, n, copy }))).toEqual([
      { hoggie: "ball", n: 1, copy: 1 },
      { hoggie: "banana", n: 2, copy: 1 },
      { hoggie: "ball", n: 3, copy: 2 },
    ]);
    expect(await t.query((ctx) => tallyOf(ctx, alice, "ball"))).toEqual(expect.objectContaining({ count: 2, firstAt: at, firstN: 1 }));
    expect(await t.query((ctx) => foundIn(ctx, alice, "quest:week-3", { crests: false }))).toEqual({ hoggie: "ball", name: "Ball", rarity: "common", art: { kind: "hoggie", slug: "ball" }, copy: 2, isNew: false });
  });

  test("the find that completes a crest's roster records the crest; the other finds record none", async () => {
    const { t, alice } = await collecting("crests");
    const team = catalogue.crests[0]!;
    for (const [n, hoggie] of team.roster.entries()) await find(t, alice, `quest:week-${n}`, hoggie);

    expect((await t.seed.all("drops")).map(({ hoggie, crest }) => ({ hoggie, crest }))).toEqual(team.roster.map((hoggie, n) => ({ hoggie, crest: n === team.roster.length - 1 ? team.crest : null })));
    expect(await t.mutation((ctx) => dropOf(ctx, alice, `quest:week-${team.roster.length - 1}`))).toEqual(expect.objectContaining({ crest: { crest: team.crest, name: team.name, art: { kind: "crest", slug: team.crest } } }));
    expect(await t.exposures()).toContainEqual({ member: alice, flag: "crests" });
  });

  test("a drop's reads: whether one dropped, what it paid, and nothing for a crate that dropped nothing", async () => {
    const { t, alice } = await collecting();
    await find(t, alice, "quest:week-1", "ball");

    expect(await t.query((ctx) => droppedIn(ctx, alice, "quest:week-1"))).toBe(true);
    expect(await t.query((ctx) => droppedIn(ctx, alice, "quest:week-2"))).toBe(false);
    expect(await t.query((ctx) => packOf(ctx, alice, "quest:week-1"))).toBeNull();
    expect(await t.query((ctx) => foundIn(ctx, alice, "quest:week-2", { crests: true }))).toBeNull();
    expect(await t.mutation((ctx) => dropOf(ctx, alice, "quest:week-1"))).toEqual({ hoggie: "ball", name: "Ball", rarity: "common", art: { kind: "hoggie", slug: "ball" }, copy: 1, isNew: true });
  });
});

describe("the tray", () => {
  test("a thoughtful crate's drop waits in the tray uncounted and out of the walk, then counts, with its crest, once it is put in", async () => {
    const { t, alice } = await collecting("crests");
    const team = crestWith("cursor")!;
    const [first, second, last] = team.roster;
    await find(t, alice, "quest:week-1", first!);
    await find(t, alice, "quest:week-2", second!);
    t.later(hour);
    await find(t, alice, "thoughtful:pack-1", last!, true);

    expect((await t.seed.all("drops")).at(-1)).toEqual(expect.objectContaining({ hoggie: last, copy: 1, crest: null }));
    expect(await t.query((ctx) => tallyOf(ctx, alice, last!))).toBeNull();
    expect((await walk(t, alice)).map(({ drop }) => drop.hoggie)).toEqual([second, first]);
    expect((await t.query((ctx) => lastFoundBy(ctx, alice)))?.hoggie).toBe(second);

    t.later(hour);
    await t.mutation((ctx) => putDropIn(ctx, alice, "thoughtful:pack-1", ctx.now));
    await t.mutation((ctx) => putDropIn(ctx, alice, "thoughtful:pack-1", ctx.now + hour));

    expect(await t.seed.all("trayDrops")).toEqual([expect.objectContaining({ crate: "thoughtful:pack-1", putInAt: at + 2 * hour, crest: team.crest })]);
    expect(await t.query((ctx) => tallyOf(ctx, alice, last!))).toEqual(expect.objectContaining({ count: 1, firstAt: at + 2 * hour, firstN: 4 }));
    expect((await walk(t, alice)).map(({ drop }) => drop.hoggie)).toEqual([last, second, first]);
    expect(await t.query(async (ctx) => (await dropsByDecision(ctx, alice, fromTheNewestDecided, { crests: true }).next()).value?.drop.crest)).toEqual(expect.objectContaining({ crest: team.crest }));
    expect((await t.query((ctx) => lastFoundBy(ctx, alice)))?.hoggie).toBe(last);
  });
});

describe("the walk by decision", () => {
  test("walks every drop newest decided first, past one read's batch, within the bounds it is given", async () => {
    const { t, alice } = await collecting();
    const commons = hoggiesOfRarity("common").map(({ hoggie }) => hoggie);
    for (let n = 0; n < 60; n++) await find(t, alice, `quest:week-${n}`, commons[n % commons.length]!);
    const all = await walk(t, alice);
    const decided = all.map(({ decided }) => decided);

    expect(all.map(({ n }) => n)).toEqual(Array.from({ length: 60 }, (_, n) => 60 - n));
    expect(decided).toEqual(decided.toSorted((one, other) => other - one));
    expect((await walk(t, alice, { decided: decided[10]!, inclusive: true })).map(({ n }) => n)).toEqual(all.slice(10).map(({ n }) => n));
    expect((await walk(t, alice, { decided: decided[10]!, inclusive: false })).map(({ n }) => n)).toEqual(all.slice(11).map(({ n }) => n));
    expect((await walk(t, alice, { decided: Infinity, inclusive: true, above: decided[5]! })).map(({ n }) => n)).toEqual(all.slice(0, 5).map(({ n }) => n));
  });
});

describe("the collection", () => {
  test("shows every catalogue hoggie with the member's count, each rarity's share, and the crests only when shown", async () => {
    const { t, alice } = await collecting();
    const team = catalogue.crests[0]!;
    for (const [n, hoggie] of team.roster.entries()) await find(t, alice, `quest:week-${n}`, hoggie);
    await find(t, alice, "quest:week-9", team.roster[0]!);

    const shown = await t.query((ctx) => collectionOf(ctx, alice, { crests: true }));
    const hidden = await t.query((ctx) => collectionOf(ctx, alice, { crests: false }));

    expect(shown.owned).toBe(team.roster.length);
    expect(shown.total).toBe(catalogue.hoggies.length);
    expect(shown.hoggies.find(({ hoggie }) => hoggie === team.roster[0])).toEqual(expect.objectContaining({ count: 2, firstAt: at }));
    expect(shown.rarities.reduce((sum, { owned }) => sum + owned, 0)).toBe(team.roster.length);
    expect(shown.crests?.find(({ crest }) => crest === team.crest)).toEqual({ crest: team.crest, name: team.name, art: { kind: "crest", slug: team.crest }, roster: [...team.roster], held: team.roster.length, collectedAt: at });
    expect(hidden.crests).toBeUndefined();
    expect(await t.query((ctx) => crestsCollectedBy(ctx, alice))).toEqual([{ crest: team.crest, collectedAt: at }]);
    expect(await t.query((ctx) => hoggiesOwnedBy(ctx, alice))).toBe(team.roster.length);
    expect(await t.query((ctx) => hoggiesOf(ctx, alice, { crests: true }, ["another-crest"]))).toEqual({ owned: team.roster.length, total: catalogue.hoggies.length, lastFound: expect.objectContaining({ hoggie: team.roster[0], copy: 2 }), crests: 2 });
    expect(await t.query((ctx) => hoggiesOf(ctx, alice, { crests: false }))).toEqual(expect.objectContaining({ crests: null }));
  });

  test("the album's hoggies mark each found with its spares and list the rarest finds first, the newest first within a rarity", async () => {
    const { t, alice } = await collecting();
    const [rare] = hoggiesOfRarity("rare");
    const [common, otherCommon] = hoggiesOfRarity("common");
    await find(t, alice, "quest:week-1", common!.hoggie);
    t.later(hour);
    await find(t, alice, "quest:week-2", otherCommon!.hoggie);
    await find(t, alice, "quest:week-3", rare!.hoggie);
    await find(t, alice, "quest:week-4", common!.hoggie);

    const album = await t.query((ctx) => albumHoggiesOf(ctx, alice));

    expect(album.found).toBe(3);
    expect(album.hoggies.find(({ hoggie }) => hoggie === common!.hoggie)).toEqual(expect.objectContaining({ found: true, count: 2, spares: 1 }));
    expect(album.rarest.map(({ hoggie }) => hoggie)).toEqual([rare!.hoggie, otherCommon!.hoggie, common!.hoggie]);
  });
});

describe("the avatar", () => {
  test("a member sets a hoggie they hold as their avatar, can't set one they don't, changes it and clears it", async () => {
    const { t, alice } = await collecting("hoggie-avatar");
    await find(t, alice, "quest:week-1", "ball");
    await find(t, alice, "quest:week-2", "banana");

    await t.mutation((ctx) => setAvatar(ctx, alice, "asleep"));
    expect(await t.query((ctx) => avatarOf(ctx, alice))).toBeNull();

    await t.mutation((ctx) => setAvatar(ctx, alice, "ball"));
    await t.mutation((ctx) => setAvatar(ctx, alice, "banana"));
    expect(await t.seed.all("hoggieAvatars")).toEqual([expect.objectContaining({ member: alice, hoggie: "banana" })]);
    expect(await t.query((ctx) => avatarChoiceOf(ctx, alice))).toEqual({
      avatar: { hoggie: "banana", name: "Banana", rarity: "common", art: { kind: "hoggie", slug: "banana" } },
      held: ["ball", "banana"].map((hoggie) => ({ hoggie, name: hoggieNamed(hoggie)!.name, rarity: "common", art: { kind: "hoggie", slug: hoggie } })),
    });

    await t.mutation((ctx) => setAvatar(ctx, alice, null));
    expect(await t.seed.all("hoggieAvatars")).toEqual([]);
  });

  test("an avatar shows only where the viewer and the member both see avatars, and can't be set while avatars are off", async () => {
    const { t, alice } = await collecting();
    const bob = await t.member("U_BOB");
    await find(t, alice, "quest:week-1", "ball");
    await t.seed.insert("hoggieAvatars", { member: alice, hoggie: "ball" });

    await t.mutation((ctx) => setAvatar(ctx, alice, null));
    expect(await t.query((ctx) => avatarShownOn(ctx, bob, alice))).toEqual({});
    expect(await t.query((ctx) => avatarChoiceOf(ctx, alice))).toBeNull();
    expect(await t.seed.all("hoggieAvatars")).toHaveLength(1);

    await t.flagsOn("collection", "hoggie-avatar");
    expect(await t.query((ctx) => avatarShownOn(ctx, bob, alice))).toEqual({ avatar: expect.objectContaining({ hoggie: "ball" }) });
  });
});

describe("bought crates", () => {
  test("opening a bought crate drops a hoggie under its number's key, once; the crates still closed wait in number order", async () => {
    const { t, alice } = await collecting();
    for (const n of [2, 1, 3]) await t.seed.insert("boughtCrates", { member: alice, crate: `bought:${n}`, n, boughtAt: at + n });

    expect(await t.query((ctx) => waitingCratesOf(ctx, alice))).toEqual(["bought:1", "bought:2", "bought:3"]);
    await t.mutation((ctx) => openCrate(ctx, alice, "bought:2", at + hour, "website"));
    await t.mutation((ctx) => openCrate(ctx, alice, "bought:2", at + 2 * hour, "website"));

    expect(await t.seed.all("drops")).toEqual([expect.objectContaining({ crate: "bought:2", at: at + hour })]);
    expect(await t.query((ctx) => boughtCrateOpened(ctx, alice, "bought:2"))).toBe(true);
    expect(await t.query((ctx) => boughtCratesWaitingFor(ctx, alice, 1))).toEqual([{ crate: "bought:1", at: at + 1 }]);
    expect(await t.mutation((ctx) => openedCrateDropOf(ctx, alice, "bought:2"))).toEqual(expect.objectContaining({ copy: 1 }));
    expect(await t.mutation((ctx) => openedCrateDropOf(ctx, alice, "bought:3"))).toBeNull();
    expect((await t.published()).map(({ type, crate, surface }) => ({ type, crate, surface }))).toEqual([{ type: "hoggieDropped", crate: "bought:2", surface: "website" }]);
  });
});

describe("level-up hoggies", () => {
  test("a level's finds are those dropped in its three slots, in slot order", async () => {
    const { t, alice } = await collecting();
    await find(t, alice, levelUpCrateKeyOf(3, 2), "banana");
    await find(t, alice, levelUpCrateKeyOf(3, 1), "ball");
    await find(t, alice, levelUpCrateKeyOf(4, 1), "asleep");

    expect((await t.query((ctx) => levelUpHoggiesOf(ctx, alice, 3))).map(({ hoggie }) => hoggie)).toEqual(["ball", "banana"]);
    expect(await t.query((ctx) => levelUpRevealOnFor(ctx, alice))).toBe(false);
  });
});
