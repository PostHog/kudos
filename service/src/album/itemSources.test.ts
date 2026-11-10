// Where items come from and what waits on them, on the service's transaction: the paths of items/ that reach no other
// stack. A hug find and a quest hoggie that pass their checks reach S3's directory and S10's draws and rarity caps, the
// loop lesson S3's settings, the milestone unlocks S9's milestones, and a turned find S10's drops; their tests are in
// the ported files beside this one.
import { asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { definitionsStored, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { stillWaiting } from "../../testing/waiting.ts";
import type { DomainEvent } from "../bus/events.ts";
import type { Id } from "../db/columns.ts";
import { jobs } from "../db/schema/index.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { turnedFindOf } from "./items/finds.ts";
import { hypeWaitsForItsItem } from "./items/hypes.ts";
import { earnItem, markTurned } from "./items/ledger.ts";
import type { Turned } from "./items/turn.ts";
import { lessonAfter, shownWaitingHoggiesAtTheWelcomeOf, welcomeCrateKey, welcomeItemOwedTo } from "./items/welcome.ts";
import { crateKeyOf, thanksEarningOf } from "./packs.ts";

const at = new Date("2026-10-13T10:00:00Z").getTime();
const ref: MessageRef = { workspace: "T1", conversation: "C1", message: "1760000000.000001" };
const links = { album: "https://kudos.example/album", book: "https://kudos.example/book" } as never;
const startBackend = useTestBackend({ now: at });

afterEach(() => {
  vi.unstubAllEnvs();
});

// The one setup of this file, on S4's in-process backend: the operation runner with the service's own subscribers, the
// worker over the service's jobs, and the seeder.
function backend() {
  const t = startBackend();
  const seed = t.seed;
  return {
    seed,
    // Publishes the event on the bus and runs every job it queued, as the worker runs them; a job that reached a stub
    // throws its `NotPortedError` from here.
    published: async (event: DomainEvent) => {
      await t.run((ctx) => ctx.publish(event));
      expect((await t.settle()).done).toBe(true);
    },
    ran: (name: string) => t.query(async ({ tx }) => tx.select({ state: jobs.state, error: jobs.error }).from(jobs).where(eq(jobs.name, name)).orderBy(asc(jobs._creationTime), asc(jobs._id))),
    // Flags decide only with the flags key set and a subject: the workspace's key stands in for every member.
    flagsOn: async (...keys: string[]) => {
      postHogDeciding("sandbox");
      if ((await seed.all("workspaceKeys")).length === 0) await seed.insert("workspaceKeys", { workspace: "T1", workspaceKey: "workspace-key-T1" });
      await definitionsStored(t.operations, ...keys.map(onForEveryone));
    },
    mutation: <T>(handler: (ctx: MutationContext) => Promise<T>) => t.run(handler),
    query: <T>(handler: (ctx: QueryContext) => Promise<T>) => t.query(handler),
    member: (user: string) => seed.insert("members", { workspace: "T1", user, kind: "member" }) as Promise<MemberId>,
    pack: (giver: MemberId, recipient: MemberId, holdsSticker = true) =>
      seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week: "2026-10-12", message: ref, holdsSticker, at }) as Promise<Id<"thoughtfulPacks">>,
    welcomeItem: (member: MemberId) => t.run((ctx) => earnItem(ctx, { workspace: "T1", member, source: "hoggie", key: welcomeCrateKey, reason: { kind: "welcome" }, earnedAt: at })),
  };
}

describe("the album's item jobs run on their events", () => {
  const hug = (giver: MemberId, rewards?: boolean): DomainEvent => ({ type: "hugGiven", workspace: "T1", giver, message: ref, onKudos: false, at, day: "2026-10-13", ...(rewards === undefined ? {} : { rewards }) });
  const quest = (member: MemberId, rewardKey?: string): DomainEvent => ({ type: "questFinished", workspace: "T1", member, quest: { kind: "journey", step: "first-thanks" }, at, ...(rewardKey === undefined ? {} : { rewardKey }) });
  const greeting = (member: MemberId, owesTheWelcomeItem: boolean): DomainEvent => ({ type: "memberGreeted", workspace: "T1", member, owesTheWelcomeItem, at });

  test("a hug without rewards, a quest without a reward key and a greeting that owes no welcome item run their job and earn nothing", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");

    for (const event of [hug(alice), hug(alice, false), quest(alice), greeting(alice, false)]) await t.published(event);

    expect(await t.ran("album.items.hugFinds.findOnHug")).toEqual([{ state: "success", error: null }, { state: "success", error: null }]);
    expect(await t.ran("album.items.questHoggies.earnQuestHoggie")).toEqual([{ state: "success", error: null }]);
    expect(await t.ran("album.items.welcome.earnWelcomeItemOnGreeting")).toEqual([{ state: "success", error: null }]);
    expect(await t.seed.all("items")).toEqual([]);
  });

  // A rewarding hug and a rewarded quest check membership in S3's directory first, and a greeting that owes the welcome
  // item earns it through S10's rarity caps. Each job ends in that body's stub, which proves the event reached the job
  // that owes the item; once that stack lands, the job earns and its test fails, to be turned into the earning tests of
  // the ported ledger files.
  const reaching = [
    { name: "a rewarding hug reaches the find that pays it", stacks: ["S3"], event: (alice: MemberId) => hug(alice, true), stub: "workspace.directory.isMember" },
    { name: "a rewarded quest reaches the hoggie it pays", stacks: ["S3"], event: (alice: MemberId) => quest(alice, "journey:first-thanks"), stub: "workspace.directory.isMember" },
    { name: "a greeting that owes the welcome item reaches the body that earns it", stacks: ["S10"], event: (alice: MemberId) => greeting(alice, true), stub: "album.hoggies.rarityCaps.earnHoggieItem" },
  ] as const;
  for (const { name, stacks, event, stub } of reaching) {
    test(`${name} (waits on ${stacks.join(" ")})`, async () => {
      const t = backend();
      const alice = await t.member("U_ALICE");
      expect(await stillWaiting(stacks, () => t.published(event(alice)))).toBe(stub);
    });
  }
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
  async function packWithItems(t: ReturnType<typeof backend>, giver: MemberId, recipient: MemberId) {
    const pack = await t.pack(giver, recipient);
    const earning = thanksEarningOf((await t.seed.get("thoughtfulPacks", pack))!);
    await t.mutation((ctx) => earnItem(ctx, { ...earning, source: "hoggie", key: crateKeyOf(pack) }));
    await t.mutation((ctx) => earnItem(ctx, { ...earning, source: "sticker", key: pack }));
    return pack;
  }

  for (const [first, second] of [["sticker", "hoggie"], ["hoggie", "sticker"]] as const) {
    test(`while hidden items show, until the first pack's ${first} and then its ${second} are both turned, whatever a later pack holds`, async () => {
      const t = backend();
      const [alice, bob, carol] = [await t.member("U_ALICE"), await t.member("U_BOB"), await t.member("U_CAROL")];
      const pack = await packWithItems(t, alice, bob);
      await packWithItems(t, alice, bob);
      const keyOf = { sticker: pack, hoggie: crateKeyOf(pack) };
      const waits = (person: MemberId) => t.query((ctx) => hypeWaitsForItsItem(ctx, alice, person));

      expect(await waits(bob)).toBe(false);
      await t.flagsOn("hidden-items");
      expect([await waits(bob), await waits(carol)]).toEqual([true, false]);

      await t.mutation((ctx) => markTurned(ctx, alice, first, keyOf[first], at + 1));
      expect(await waits(bob)).toBe(true);
      await t.mutation((ctx) => markTurned(ctx, alice, second, keyOf[second], at + 2));
      expect(await waits(bob)).toBe(false);
    });
  }
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
