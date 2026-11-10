// The album's history over the service: awards given before it began put their recipients in the giver's album, those
// given after collect only through packs, every award and hug person is tallied once, page by page, and the history
// hands over to the workspace's milestones when done.
//
// The awards and hugs it pages, and their words and hugs, are the engine's (S4) and the hugs' (S13) reads, still stubs
// in the module map. Here they read a world the test gives, through the map's own signatures and the paging contracts
// of convex/hugs/records.ts, so this file proves the album's side today. The history runs through the test backend's
// worker and the registered jobs, each job enqueueing the next. The faithful port of convex/album/history.test.ts,
// through Slack, waits on those stacks.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import type { Id } from "../db/columns.ts";
import { toDocument } from "../db/documents.ts";
import { type Doc } from "../db/schema/index.ts";
import { jobs } from "../db/schema/service.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MutationContext } from "../operations.ts";
import type { Registry } from "../registration.ts";
import { serviceRegistry } from "../registry.ts";
import type { MemberId } from "../workspace/directory.ts";
import { albumHistoryOf, awardsPerHistoryPage, hugPeoplePerHistoryPage, recordAlbumHistory, recordAlbumHistoryJob, startAlbumHistory } from "./history.ts";
import { recordPackSticker } from "./stickers.ts";

// What S4's and S13's reads would find: the awards and hugs given, and each message's words.
const world = vi.hoisted(() => ({
  awards: [] as Array<{ giver: string; recipient: string; kudos: number; message: { workspace: string; conversation: string; message: string }; day: string; at: number; created: number; award: string }>,
  hugs: [] as Array<{ hug: Record<string, unknown> & { _id: string; giver: string; workspace: string; conversation: string; message: string; author?: string }; people: string[] }>,
  words: new Map<string, number>(),
}));

const pageOf = <T,>(rows: T[], { cursor, numItems }: { cursor: string | null; numItems: number }) => {
  const from = cursor === null ? 0 : Number(cursor);
  const next = from + numItems;
  return { page: rows.slice(from, next), isDone: next >= rows.length, continueCursor: String(Math.min(next, rows.length)) };
};
const keyOfMessage = ({ workspace, conversation, message }: { workspace: string; conversation: string; message: string }) => `${workspace}/${conversation}/${message}`;

vi.mock("../engine/awards.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/awards.ts")>()),
  awardsInWorkspace: async (_ctx: unknown, workspace: string, page: { cursor: string | null; numItems: number }) =>
    pageOf(world.awards.filter((award) => award.message.workspace === workspace), page),
  storedAnnotationsOf: async (_ctx: unknown, message: MessageRef) => {
    const words = world.words.get(keyOfMessage(message));
    return words === undefined ? {} : { gate: { version: 1, thoughtful: words >= 5, words } };
  },
  givenFactsOf: async (_ctx: unknown, message: MessageRef) => {
    const award = world.awards.find((each) => keyOfMessage(each.message) === keyOfMessage(message));
    return award === undefined ? null : { giver: award.giver, day: award.day, at: award.at };
  },
}));

vi.mock("../hugs/records.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hugs/records.ts")>()),
  hugsInWorkspace: async (_ctx: unknown, workspace: string, page: { cursor: string | null; numItems: number }) =>
    pageOf(world.hugs.filter(({ hug }) => hug.workspace === workspace).map(({ hug }) => hug), page),
  hugWithId: async (_ctx: unknown, id: string) => world.hugs.find(({ hug }) => hug._id === id)?.hug ?? null,
  // convex/hugs/records.ts's contract: a hug on a message that is no kudos hugs its author alone, and a full page of
  // recipients names its last person, so only the next read finds out that none are left.
  hugPeopleAfter: async (_ctx: unknown, hug: { _id: string; author?: string }, after: string | null, atMost: number) => {
    if (hug.author !== undefined) return { people: after === null ? [hug.author] : [], last: null };
    const people = world.hugs.find((each) => each.hug._id === hug._id)!.people.toSorted();
    const taken = (after === null ? people : people.filter((person) => person > after)).slice(0, atMost);
    return { people: taken, last: taken.length < atMost ? null : taken.at(-1)! };
  },
}));

vi.mock("../hugs/weeks.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hugs/weeks.ts")>()),
  hugsOnTheMessage: async (_ctx: unknown, message: MessageRef) => world.hugs.filter(({ hug }) => keyOfMessage(hug) === keyOfMessage(message)).length,
}));

const start = Date.parse("2026-10-13T10:00:00Z");
const tuesday = "2026-10-13";
const theWeek = "2026-10-12";
const minute = 60_000;
const alice = "m_alice" as MemberId;
const bob = "m_bob" as MemberId;
const carol = "m_carol" as MemberId;
const dana = "m_dana" as MemberId;

// The milestones the history hands over to are proven in milestones.test.ts; run here, the workspace's walk would reach
// S3's directory, still a stub. So this backend leaves their jobs out, and the handover stays a recorded job.
const withoutMilestones: Registry = { ...serviceRegistry, jobs: new Map([...serviceRegistry.jobs].filter(([name]) => !name.startsWith("album.milestones."))) };
const backend = useTestBackend({ now: start, registry: withoutMilestones });
let t: TestBackend;
const historyJob = recordAlbumHistoryJob.name;
let messages = 0;

beforeEach(() => {
  t = backend();
  messages = 0;
  world.awards.length = 0;
  world.hugs.length = 0;
  world.words.clear();
});

describe("people join the album only by giving", () => {
  test("a member who gave before the history began finds those people in their album, and people who only thanked them are not there", async () => {
    thanks(alice, 7, bob, carol);
    thanks(bob, 2, alice);
    thanks(dana, 1, alice);

    await runTheHistory();

    expect(await peopleOf(alice), "alice's album holds only the people she gave to").toEqual([bob, carol]);
    expect(await peopleOf(bob)).toEqual([alice]);
    expect(await peopleOf(carol), "carol only received").toEqual([]);
  });

  test("an award created after the history's row is tallied but puts nobody in the album: it collects through its pack", async () => {
    thanks(alice, 2, bob);
    await mutation((ctx) => startAlbumHistory(ctx, { workspace: "T1" }));
    thanks(alice, 9, carol, { created: (await historyRow())._creationTime + 1 });

    await runTheHistory();

    expect(await peopleOf(alice)).toEqual([bob]);
    expect(await pairOf(alice, carol), "carol's kudos is tallied all the same").toMatchObject({ kudosGiven: 1, best: { words: 9 } });
  });

  test("a member is never in their own album, and a pair a pack already put in is recorded once", async () => {
    thanks(alice, 7, bob);
    thanks(alice, 7, alice);
    await mutation((ctx) => recordPackSticker(ctx, alice, bob, "p1" as Id<"thoughtfulPacks">, start - minute));

    await runTheHistory();

    expect(await t.seed.all("albumStickers")).toEqual([expect.objectContaining({ member: alice, person: bob, from: "pack" })]);
  });
});

describe("the history pages and resumes", () => {
  test(`awards go ${awardsPerHistoryPage} a job, each job enqueueing the next with the cursor, then the hugs, then the milestones`, async () => {
    const crowd = Array.from({ length: awardsPerHistoryPage + 10 }, (_, index) => `m_person${String(index).padStart(2, "0")}` as MemberId);
    for (const person of crowd) thanks(alice, 3, person);

    const ran = await runTheHistory();

    expect(ran.filter((name) => name === historyJob), "two pages of awards, then a page of hugs that finds none").toHaveLength(3);
    expect(await albumHistoryOf2()).toEqual({ startedAt: start, done: true });
    expect(await t.seed.all("talliedAwards")).toHaveLength(crowd.length);
    expect((await peopleOf(alice)).toSorted()).toEqual(crowd);
    expect(await argsOfJobs("album.milestones.recordMilestonesInWorkspace"), "the milestones follow, once").toEqual([{ workspace: "T1", cursor: null }]);
  });

  test(`a hug's people go ${hugPeoplePerHistoryPage} a job: the history keeps the hug and the last person, then lets them go`, async () => {
    const people = Array.from({ length: hugPeoplePerHistoryPage + 20 }, (_, index) => `m_hugged${String(index).padStart(3, "0")}` as MemberId);
    hug(alice, people);
    await mutation((ctx) => startAlbumHistory(ctx, { workspace: "T1" }));

    await recordOnce();
    await recordOnce();
    expect(await historyRow(), "between jobs, the row holds the hug and its last person").toMatchObject({ phase: "hugs", hug: "h1", hugPeopleAfter: people[hugPeoplePerHistoryPage - 1], done: false });
    await clearJobs();
    await mutation((ctx) => ctx.jobs.enqueue(recordAlbumHistoryJob, { workspace: "T1" }));

    const ran = await settle();

    expect(ran.filter((name) => name === historyJob), "the hug's last people, then a page that finds no more hugs").toHaveLength(2);
    const after = await historyRow();
    expect(after.done).toBe(true);
    expect("hug" in after || "hugPeopleAfter" in after, "both fields are removed, as Convex's patch removed them").toBe(false);
    expect(await t.seed.all("talliedHugs")).toHaveLength(people.length + 1);
    expect(await weekOf(alice)).toMatchObject({ hugsGiven: 1, hugged: { people: people.slice(0, 12), more: people.length - 12 } });
  });

  test(`a hug of exactly ${hugPeoplePerHistoryPage} people takes one more read to find that none are left`, async () => {
    const people = Array.from({ length: hugPeoplePerHistoryPage }, (_, index) => `m_hugged${String(index).padStart(3, "0")}` as MemberId);
    hug(alice, people);

    const ran = await runTheHistory();

    expect(ran.filter((name) => name === historyJob), "the empty awards page, the full page of people, the read that finds none, then the end of the hugs").toHaveLength(4);
    const after = await historyRow();
    expect("hug" in after || "hugPeopleAfter" in after).toBe(false);
    expect(await t.seed.all("talliedHugs")).toHaveLength(people.length + 1);
  });

  test("a hug on a message that is no kudos hugs its author alone, whoever else the message names", async () => {
    hug(carol, [bob, dana], { author: alice });

    await runTheHistory();

    expect((await t.seed.all("talliedHugs")).map(({ person }) => person).toSorted()).toEqual([alice, carol]);
    expect(await pairOf(carol, alice)).toMatchObject({ hugsGiven: 1 });
    expect(await pairOf(alice, carol)).toMatchObject({ hugsReceived: 1 });
    expect(await pairOf(carol, bob)).toBeNull();
  });

  test("starting twice keeps one history, and a history page run twice tallies each award once", async () => {
    thanks(alice, 7, bob);
    thanks(alice, 3, bob);

    await mutation((ctx) => startAlbumHistory(ctx, { workspace: "T1" }));
    await mutation((ctx) => startAlbumHistory(ctx, { workspace: "T1" }));
    expect(await t.seed.all("albumHistory")).toHaveLength(1);
    expect(await pendingJobs()).toEqual([{ name: "album.history.recordAlbumHistory", args: { workspace: "T1" } }]);

    await recordOnce();
    await t.seed.patch("albumHistory", (await historyRow())._id, { phase: "kudos", cursor: null });
    await runTheHistory();

    expect(await pairOf(alice, bob)).toMatchObject({ kudosGiven: 2, best: { words: 7 } });
    expect(await pairOf(bob, alice)).toMatchObject({ kudosReceived: 2 });
  });
});

describe("what the history tallies", () => {
  test("pairs keep the first thanks and the wordiest kudos; weeks count each side and the days given on", async () => {
    thanks(alice, 4, bob, { at: start - 2 * minute });
    thanks(alice, 9, bob, { at: start - minute });
    thanks(alice, 9, bob, { at: start, day: "2026-10-14" });

    await runTheHistory();

    const pair = await pairOf(alice, bob);
    expect(pair).toMatchObject({ kudosGiven: 3, kudosReceived: 0, firstThankedAt: start - 2 * minute, best: { words: 9, at: start } });
    expect(await weekOf(alice)).toMatchObject({ kudosGiven: 3, thoughtfulGiven: 3, thanked: { people: [bob], more: 0 }, days: [0, 2, 1, 0, 0, 0, 0] });
    expect(await weekOf(bob)).toMatchObject({ kudosReceived: 3, thoughtfulReceived: 3, thankedBy: { people: [alice], more: 0 } });
  });

  test("the thoughtful boards count each award in its week, month and all time, and the week's givers once each", async () => {
    thanks(alice, 7, bob);
    thanks(alice, 7, carol);
    thanks(dana, 7, bob);

    await runTheHistory();

    const boards = (await t.seed.all("thoughtfulBoardTallies")).map(({ period, giver, awards }) => ({ period, giver, awards }));
    expect(boards.toSorted((a, b) => `${a.giver}${a.period}`.localeCompare(`${b.giver}${b.period}`))).toEqual([
      { period: "all", giver: alice, awards: 2 },
      { period: "month:2026-10", giver: alice, awards: 2 },
      { period: `week:${theWeek}`, giver: alice, awards: 2 },
      { period: "all", giver: dana, awards: 1 },
      { period: "month:2026-10", giver: dana, awards: 1 },
      { period: `week:${theWeek}`, giver: dana, awards: 1 },
    ]);
    expect(await t.seed.all("thoughtfulGiverCounts")).toEqual([expect.objectContaining({ workspace: "T1", week: `week:${theWeek}`, givers: 2 })]);
  });

  test("a hug on a kudos makes it the kudos of the week for its giver and each hugged person", async () => {
    const kudos = thanks(alice, 3, bob);
    hug(carol, [bob, dana], kudos);

    await runTheHistory();

    const pick = { message: kudos, hugs: 1, words: 3, at: start };
    expect((await weekOf(alice)).kudosOfWeek).toEqual(pick);
    expect((await weekOf(dana)).kudosOfWeek).toEqual(pick);
    expect(await pairOf(carol, dana)).toMatchObject({ hugsGiven: 1 });
    expect(await pairOf(dana, carol)).toMatchObject({ hugsReceived: 1 });
  });
});

test("a pair held twice fails the history's page with Convex's own unique() error, as today", async () => {
  thanks(alice, 7, bob);
  await t.seed.insert("albumStickers", { member: alice, person: bob, from: "history", at: start });
  await t.seed.insert("albumStickers", { member: alice, person: bob, from: "pack", at: start });
  await mutation((ctx) => startAlbumHistory(ctx, { workspace: "T1" }));

  await expect(recordOnce()).rejects.toThrow("unique() query returned more than one result from table albumStickers:");
});

function thanks(giver: MemberId, words: number, ...recipients: Array<MemberId | { created?: number; at?: number; day?: string }>): MessageRef {
  const options = typeof recipients.at(-1) === "object" ? (recipients.pop() as { created?: number; at?: number; day?: string }) : {};
  const message = { workspace: "T1", conversation: "C1", message: `${++messages}.000` };
  world.words.set(keyOfMessage(message), words);
  for (const recipient of recipients as MemberId[]) {
    world.awards.push({ award: `a${world.awards.length + 1}`, giver, recipient, kudos: 1, message, day: options.day ?? tuesday, at: options.at ?? start, created: options.created ?? start - minute });
  }
  return message;
}

// A hug on a kudos hugs the people it thanked; one on any other message carries that message's author.
function hug(giver: MemberId, people: MemberId[], on?: MessageRef | { author: MemberId }) {
  const kudos = on !== undefined && !("author" in on) ? on : undefined;
  const message = kudos ?? { workspace: "T1", conversation: "C1", message: `${++messages}.000` };
  const _id = `h${world.hugs.length + 1}`;
  const hugFor = kudos !== undefined ? { onKudos: true } : on !== undefined && "author" in on ? { onKudos: false, author: on.author } : { onKudos: false };
  world.hugs.push({ hug: { _id, _creationTime: start - minute, ...message, giver, ...hugFor, emoji: "hugging_face", at: start, day: tuesday }, people });
}

function mutation<T>(handler: (ctx: MutationContext) => Promise<T>): Promise<T> {
  return t.run(handler);
}

function recordOnce() {
  return mutation((ctx) => recordAlbumHistory(ctx, { workspace: "T1" }));
}

// Starts the history and lets the worker run what it enqueues: each job must enqueue the next for the history to end.
async function runTheHistory(): Promise<string[]> {
  await mutation((ctx) => startAlbumHistory(ctx, { workspace: "T1" }));
  return settle();
}

async function settle(): Promise<string[]> {
  const { ran, done } = await t.settle();
  expect(done, "the worker ran every job due").toBe(true);
  expect(await albumHistoryOf2(), "the history finished through its own jobs").toMatchObject({ done: true });
  return ran;
}

function albumHistoryOf2() {
  return t.query((ctx) => albumHistoryOf(ctx, "T1"));
}

async function historyRow(): Promise<Doc<"albumHistory">> {
  const [row] = await t.seed.all("albumHistory");
  return row!;
}

async function peopleOf(member: MemberId) {
  return (await t.seed.all("albumStickers")).filter((sticker) => sticker.member === member).map(({ person }) => person);
}

async function pairOf(member: MemberId, person: MemberId) {
  return (await t.seed.all("pairTallies")).find((pair) => pair.member === member && pair.person === person) ?? null;
}

async function weekOf(member: MemberId): Promise<Doc<"weekTallies">> {
  const week = (await t.seed.all("weekTallies")).find((tally) => tally.member === member && tally.week === theWeek);
  if (!week) throw new Error(`No week tally for ${member}`);
  return week;
}

async function argsOfJobs(name: string) {
  return t.query(async ({ tx }) => {
    const rows = await tx.select().from(jobs).where(eq(jobs.name, name));
    return rows.map((row) => toDocument<{ args: unknown }>(jobs, row).args);
  });
}

function clearJobs() {
  return mutation(async ({ tx }) => {
    await tx.delete(jobs);
  });
}

async function pendingJobs() {
  return t.query(async ({ tx }) => {
    const rows = await tx.select().from(jobs).where(eq(jobs.state, "pending"));
    return rows.map((row) => toDocument<{ name: string; args: unknown }>(jobs, row)).map(({ name, args }) => ({ name, args }));
  });
}
