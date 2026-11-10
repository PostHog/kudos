// Where items come from and what waits on them, on the service's transaction: the paths of items/ that reach no other
// stack. A hug find and a quest hoggie that pass their checks reach S3's directory and S10's draws and rarity caps, the
// loop lesson S3's settings, the milestone unlocks S9's milestones, and a turned find S10's drops; their tests are in
// the ported files beside this one.
import { afterEach, describe, expect, test, vi } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { definitionsStored, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { Log } from "../log.ts";
import { createOperations, type MutationContext, type QueryContext } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import type { MemberId } from "../workspace/directory.ts";
import { turnedFindOf } from "./items/finds.ts";
import { findOnHug } from "./items/hugFinds.ts";
import { hypeWaitsForItsItem } from "./items/hypes.ts";
import { earnItem, markTurned } from "./items/ledger.ts";
import { earnQuestHoggie } from "./items/questHoggies.ts";
import type { Turned } from "./items/turn.ts";
import { earnWelcomeItemOnGreeting, lessonAfter, shownWaitingHoggiesAtTheWelcomeOf, welcomeCrateKey, welcomeItemOwedTo } from "./items/welcome.ts";
import { crateKeyOf, thanksEarningOf } from "./packs.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const at = new Date("2026-10-13T10:00:00Z").getTime();
const ref: MessageRef = { workspace: "T1", conversation: "C1", message: "1760000000.000001" };
const links = { album: "https://kudos.example/album", book: "https://kudos.example/book" } as never;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The one setup of this file: the operation runner on the test database and the seeder. S4's in-process backend
// replaces it.
function backend() {
  const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => at }), log: quiet, retryDelayMs: () => 1 });
  const seed = seeder(operations);
  return {
    seed,
    // Flags decide only with the flags key set and a subject: the workspace's key stands in for every member.
    flagsOn: async (...keys: string[]) => {
      postHogDeciding("sandbox");
      if ((await seed.all("workspaceKeys")).length === 0) await seed.insert("workspaceKeys", { workspace: "T1", workspaceKey: "workspace-key-T1" });
      await definitionsStored(operations, ...keys.map(onForEveryone));
    },
    mutation: <T>(handler: (ctx: MutationContext) => Promise<T>) => operations.mutation("test.mutation", handler),
    query: <T>(handler: (ctx: QueryContext) => Promise<T>) => operations.query("test.query", handler),
    member: (user: string) => seed.insert("members", { workspace: "T1", user, kind: "member" }) as Promise<MemberId>,
    pack: (giver: MemberId, recipient: MemberId, holdsSticker = true) =>
      seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week: "2026-10-12", message: ref, holdsSticker, at }) as Promise<Id<"thoughtfulPacks">>,
    welcomeItem: (member: MemberId) => earnItemFor(member, { source: "hoggie", key: welcomeCrateKey, reason: { kind: "welcome" } }),
  };
  function earnItemFor(member: MemberId, item: { source: "hoggie" | "sticker"; key: string; reason: { kind: "welcome" } }) {
    return operations.mutation("test.mutation", (ctx) => earnItem(ctx, { workspace: "T1", member, ...item, earnedAt: at }));
  }
}

describe("a source that owes no item earns none", () => {
  test("a hug without rewards, a quest without a reward key and a greeting that owes no welcome item earn nothing", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");
    const hug = { type: "hugGiven" as const, workspace: "T1", giver: alice, message: ref, onKudos: false, at, day: "2026-10-13" };
    const quest = { type: "questFinished" as const, workspace: "T1", member: alice, quest: { kind: "journey" as const, step: "first-thanks" as const }, at };

    await t.mutation((ctx) => findOnHug(ctx, { event: hug }));
    await t.mutation((ctx) => findOnHug(ctx, { event: { ...hug, rewards: false } }));
    await t.mutation((ctx) => earnQuestHoggie(ctx, { event: quest }));
    await t.mutation((ctx) => earnWelcomeItemOnGreeting(ctx, { event: { type: "memberGreeted", workspace: "T1", member: alice, owesTheWelcomeItem: false, at } }));

    expect(await t.seed.all("items")).toEqual([]);
  });

  test("the album subscribes its item jobs to hugs, finished quests and greetings", () => {
    const subscribed = (event: string) => serviceRegistry.subscribers.get(event as never)?.map(({ job }) => job.name);
    expect(subscribed("hugGiven")).toContain("album.items.hugFinds.findOnHug");
    expect(subscribed("questFinished")).toContain("album.items.questHoggies.earnQuestHoggie");
    expect(subscribed("memberGreeted")).toContain("album.items.welcome.earnWelcomeItemOnGreeting");
  });
});

describe("the welcome item", () => {
  test("is owed while the welcome item and hidden items show and the member doesn't hold it", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    expect(await t.query((ctx) => welcomeItemOwedTo(ctx, alice))).toBe(false);

    await t.flagsOn("welcome-item", "hidden-items");
    await t.welcomeItem(bob);
    expect([await t.query((ctx) => welcomeItemOwedTo(ctx, alice)), await t.query((ctx) => welcomeItemOwedTo(ctx, bob))]).toEqual([true, false]);
  });

  test("counts once among the waiting hoggies at the welcome, whether it is owed or already earned", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");
    await t.flagsOn("hidden-items");
    const shown = (owed: boolean) => t.query((ctx) => shownWaitingHoggiesAtTheWelcomeOf(ctx, alice, links, owed));

    expect([await shown(false), await shown(true)]).toEqual([0, 1]);
    await t.welcomeItem(alice);
    expect([await shown(false), await shown(true)]).toEqual([1, 1]);
  });

  test("teaches no lesson when turned again, for another item, or while the welcome item is off", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const welcome = (await t.welcomeItem(alice)) as Id<"items">;
    const thanks = (await t.mutation((ctx) => earnItem(ctx, { workspace: "T1", member: alice, source: "hoggie", key: "thoughtful:x", reason: { kind: "thanks", person: bob, message: ref }, earnedAt: at }))) as Id<"items">;
    const owner = { workspace: "T1", member: alice };
    const lesson = (item: Id<"items">, again: boolean) => t.query((ctx) => lessonAfter(ctx, owner, item, { again } as Turned));

    expect(await lesson(welcome, false)).toEqual({});
    await t.flagsOn("welcome-item", "hidden-items");
    expect([await lesson(welcome, true), await lesson(thanks, false), await lesson("no-such-item" as Id<"items">, false)]).toEqual([{}, {}, {}]);
  });
});

describe("a hype waits for its item", () => {
  test("while hidden items show, until both the sticker and the crate of the first pack for its person are turned", async () => {
    const t = backend();
    const [alice, bob, carol] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL")];
    const pack = await t.pack(alice, bob);
    const earning = thanksEarningOf((await t.seed.get("thoughtfulPacks", pack))!);
    await t.mutation((ctx) => earnItem(ctx, { ...earning, source: "hoggie", key: crateKeyOf(pack) }));
    await t.mutation((ctx) => earnItem(ctx, { ...earning, source: "sticker", key: pack }));
    const waits = (person: MemberId) => t.query((ctx) => hypeWaitsForItsItem(ctx, alice, person));

    expect(await waits(bob)).toBe(false);
    await t.flagsOn("hidden-items");
    expect([await waits(bob), await waits(carol)]).toEqual([true, false]);

    await t.mutation((ctx) => markTurned(ctx, alice, "sticker", pack, at + 1));
    expect(await waits(bob)).toBe(true);
    await t.mutation((ctx) => markTurned(ctx, alice, "hoggie", crateKeyOf(pack), at + 2));
    expect(await waits(bob)).toBe(false);
  });
});

describe("a kudos's shared find", () => {
  test("is none while the crates of its packs are face down, or when it granted no pack", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const pack = await t.pack(alice, bob);
    const earning = thanksEarningOf((await t.seed.get("thoughtfulPacks", pack))!);
    await t.mutation((ctx) => earnItem(ctx, { ...earning, source: "hoggie", key: crateKeyOf(pack) }));

    expect(await t.query((ctx) => turnedFindOf(ctx, { giver: alice, message: ref, at }))).toBeNull();
    expect(await t.query((ctx) => turnedFindOf(ctx, { giver: bob, message: ref, at }))).toBeNull();
    expect(await t.query((ctx) => turnedFindOf(ctx, { giver: alice, message: ref, at: at + 1 }))).toBeNull();
  });
});
