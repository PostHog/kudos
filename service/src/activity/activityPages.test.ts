// A member's activity as the website reads it: entries newest decided first, the received and given filters, pages
// that repeat and skip nothing, a kudos taken back in Slack leaving while it keeps its place, the last few kudos read
// on past it, and a page's mention lookups bounded. Run through the app's query runner on a real database.
//
// What the activity reads from other stacks isn't ported yet (S6's awards and kudos text, S3's directory, S11's user
// groups, the progression's gains views and effects): each answers here at its seam from the rows the test sets, so
// this file proves the activity's own rules. S16's ports of today's convex/website/activity*.test.ts and
// spotlight.test.ts prove it through the website once those bodies land (ticket's Still owed).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import type { DecidedBelow, GivenMessageAwards, ReceivedAward } from "../engine/awards.ts";
import type { MessageRef, WordSegment } from "../engine/messageEvent.ts";
import type { DrawPoint, DrawWalk } from "../engine/spotlightDraws.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { activityOf, recentKudosOf, type Filter } from "./activity.ts";
import { activityShownTo } from "./activityFlag.ts";
import { spotlightOf } from "./spotlight.ts";

const standIn = vi.hoisted(() => ({
  received: [] as Array<ReceivedAward & { recipient: string }>,
  given: [] as Array<GivenMessageAwards & { giver: string }>,
  takenBack: new Set<string>(),
  words: new Map<string, WordSegment[]>(),
  names: new Map<string, string>(),
  draws: [] as Array<{ position: number; created: number; drawable: boolean }>,
}));

const messageKey = ({ conversation, message }: MessageRef) => `${conversation}/${message}`;
const byPoint = (one: DrawPoint, other: DrawPoint) => one.position - other.position || one.created - other.created;

/** The awards seam's order: newest decided first, below the cursor's position, as S6's indexes answer. */
function below<T extends { created: number }>(rows: T[], { decided, inclusive }: DecidedBelow): T[] {
  return rows.filter(({ created }) => (inclusive ? created <= decided : created < decided)).sort((one, other) => other.created - one.created);
}

vi.mock("../engine/awards.ts", async (original) => ({
  ...(await original<object>()),
  awardsReceivedByDecision: async function* (_ctx: unknown, recipient: string, decided: DecidedBelow) {
    yield* below(standIn.received.filter((award) => award.recipient === recipient), decided);
  },
  messagesGivenByDecision: async function* (_ctx: unknown, giver: string, decided: DecidedBelow) {
    yield* below(standIn.given.filter((given) => given.giver === giver), decided);
  },
}));
vi.mock("../engine/kudosText.ts", async (original) => ({
  ...(await original<object>()),
  wordsOf: async (_ctx: unknown, ref: MessageRef) => ({ kind: "text", visibility: "public", edited: false, segments: standIn.words.get(messageKey(ref)) ?? [{ kind: "text", text: "Thank you!" }] }),
  takenBackInSlack: async (_ctx: unknown, ref: MessageRef) => standIn.takenBack.has(messageKey(ref)),
}));
vi.mock("../engine/engine.ts", async (original) => ({ ...(await original<object>()), threadRootOf: async () => undefined }));
// S6's draw, over the draws the test sets: once around the circle from just after `after` through `through`, by position
// then creation; a draw it turns away answers as skipped there, a drawable one as that kudos.
vi.mock("../engine/spotlight.ts", async (original) => ({
  ...(await original<object>()),
  drawFrom: async (_ctx: unknown, workspace: string, { after, through }: DrawWalk) => {
    const along = [...standIn.draws].sort(byPoint);
    const wraps = byPoint(after, through) >= 0;
    const walked = wraps ? [...along.filter((draw) => byPoint(draw, after) > 0), ...along.filter((draw) => byPoint(draw, through) <= 0)] : along.filter((draw) => byPoint(draw, after) > 0 && byPoint(draw, through) <= 0);
    const [next] = walked;
    if (next === undefined) return { kind: "empty" };
    const at = { position: next.position, created: next.created };
    if (!next.drawable) return { kind: "skipped", at };
    const ref = { workspace, conversation: "C_KUDOS", message: `draw-${next.created}` };
    return { kind: "kudos", drawn: { ...at, ref }, kudos: { at: next.created, giver: "m-ben", recipients: ["m-ann"], segments: [{ kind: "text", text: "Thank you!" }], edited: false }, mentionLookups: 10 };
  },
}));
vi.mock("../progression/effects.ts", async (original) => ({ ...(await original<object>()), gateRecordedWith: async () => ({ thoughtful: true }), xpRecordedFor: async () => 0, bonusRecordedWith: async () => [] }));
vi.mock("../progression/gainsView.ts", async (original) => ({ ...(await original<object>()), xpGainsShownTo: async () => false, questGainsShownTo: async () => false, bonusGainsShownTo: async () => false }));
vi.mock("../hugs/flag.ts", async (original) => ({ ...(await original<object>()), hugsShownTo: async () => false }));
vi.mock("../album/hoggies/flag.ts", async (original) => ({ ...(await original<object>()), hoggiesShownTo: async () => false, crestsShownTo: async () => false }));
vi.mock("../workspace/url.ts", async (original) => ({ ...(await original<object>()), workspaceUrlOf: async () => null }));
vi.mock("../workspace/userGroups.ts", async (original) => ({ ...(await original<object>()), userGroupHandleOf: async () => "design" }));
vi.mock("../workspace/customEmoji.ts", async (original) => ({ ...(await original<object>()), customEmojiImageOf: async () => undefined }));
vi.mock("../workspace/directory.ts", async (original) => ({
  ...(await original<object>()),
  chatUserOf: async (_ctx: unknown, member: string) => ({ workspace: "T1", user: member }),
  timeZoneOf: async () => "Europe/Berlin",
  nameAndPictureOf: async (_ctx: unknown, member: string) => ({ name: standIn.names.get(member), picture: null }),
  currentMemberOfUser: async (_ctx: unknown, _workspace: string, user: string) => (standIn.names.has(user) ? { member: user, name: standIn.names.get(user) } : undefined),
}));

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const operations = createOperations({ pool: database.pool, clock: createClock(), log: quiet });
const seed = seeder(operations);

const ann = "m-ann" as MemberId;
const ben = "m-ben" as MemberId;
const cat = "m-cat" as MemberId;

beforeEach(() => {
  Object.assign(standIn, { received: [], given: [], takenBack: new Set(), words: new Map(), names: new Map([[ann, "Ann"], [ben, "Ben"], [cat, "Cat"]]), draws: [] });
});

let messages = 0;
/**
 * A kudos from `from` to each of `to` at the instant `at`: one award to each recipient, one given message. Its records
 * are created in the order the test gives them, as rows are, so of two at one instant the later is decided later.
 */
function kudos(from: MemberId, to: MemberId[], at: number) {
  const created = at * 1_000 + messages + 1;
  const message = { workspace: "T1", conversation: "C_KUDOS", message: `1760000000.${String(++messages).padStart(6, "0")}` };
  const awards = to.map((recipient, i) => ({ award: `award-${messages}-${i}`, recipient, kudos: 1 }));
  standIn.given.push({ giver: from, first: awards[0]!.award as GivenMessageAwards["first"], message, awards: awards as GivenMessageAwards["awards"], at, created });
  for (const { award, recipient } of awards) standIn.received.push({ recipient, award: award as ReceivedAward["award"], message, giver: from, kudos: 1, at, created });
  return message;
}

const read = (member: MemberId, filter: Filter, cursor: string | null = null, limit?: number) => operations.query("website.activity.activityOf", (ctx) => activityOf(ctx, member, { filter, cursor, limit }));

/** Every page of the member's activity, `limit` entries at a time, until the cursor ends. */
async function allPages(member: MemberId, filter: Filter, limit: number) {
  const pages = [];
  let cursor: string | null = null;
  do {
    const page = await read(member, filter, cursor, limit);
    pages.push(page.entries.map(shown));
    cursor = page.cursor;
  } while (cursor !== null && pages.length < 20);
  return pages;
}

function shown(entry: Awaited<ReturnType<typeof read>>["entries"][number]) {
  if (entry.kind === "kudosReceived") return `received from ${entry.giver.name} at ${entry.at}`;
  if (entry.kind === "kudosGiven") return `given to ${entry.recipients.map(({ name }) => name).join(" and ")} at ${entry.at}`;
  return entry.kind;
}

describe("a member's activity", () => {
  test("answers each kudos received as its own entry and each message given as one entry with every recipient, newest decided first", async () => {
    kudos(ben, [ann], 30);
    kudos(ann, [ben, cat], 20);
    kudos(cat, [ann], 10);

    const page = await read(ann, "all");
    expect(page.entries.map(shown)).toEqual(["received from Ben at 30", "given to Ben and Cat at 20", "received from Cat at 10"]);
    expect(page).toMatchObject({ cursor: null, timeZone: "Europe/Berlin" });
    expect(page.entries[1]).toMatchObject({ kind: "kudosGiven", saidWhy: true, permalink: null, channel: { visibility: "public" }, message: { kind: "text", segments: [{ kind: "text", text: "Thank you!" }] }, earned: null });
    expect((await read(ann, "received")).entries.map(shown)).toEqual(["received from Ben at 30", "received from Cat at 10"]);
    expect((await read(ann, "given")).entries.map(shown)).toEqual(["given to Ben and Cat at 20"]);
  });

  test("pages one entry at a time through one instant, the later decided first, repeating and skipping none, and ends with no cursor", async () => {
    kudos(ann, [ben], 20);
    kudos(ben, [ann], 20);
    kudos(cat, [ann], 20);
    kudos(ann, [cat], 10);

    expect(await allPages(ann, "all", 1)).toEqual([["received from Cat at 20"], ["received from Ben at 20"], ["given to Ben at 20"], ["given to Cat at 10"]]);
  });

  test("a page holds at most 50 entries and at least 1, 20 unless asked", async () => {
    for (let at = 1; at <= 60; at++) kudos(ben, [ann], at);

    expect((await read(ann, "all")).entries).toHaveLength(20);
    expect((await read(ann, "all", null, 500)).entries).toHaveLength(50);
    expect((await read(ann, "all", null, 0)).entries).toHaveLength(1);
  });

  test("a kudos taken back in Slack leaves its giver's and recipient's activity, keeping its place, so a page may hold none and still read on", async () => {
    kudos(ben, [ann], 30);
    const takenBack = kudos(ben, [ann], 20);
    kudos(cat, [ann], 10);
    standIn.takenBack.add(messageKey(takenBack));

    expect(await allPages(ann, "all", 1)).toEqual([["received from Ben at 30"], [], ["received from Cat at 10"]]);
    expect((await read(ben, "given")).entries.map(shown)).toEqual(["given to Ann at 30"]);
  });

  test("the last few kudos of one direction read on past kudos taken back in Slack, 5 unless asked and at most 10", async () => {
    for (let at = 1; at <= 15; at++) {
      const message = kudos(ben, [ann], at);
      if (at > 12) standIn.takenBack.add(messageKey(message));
    }

    const recent = (limit?: number) => operations.query("website.activity.recentKudosOf", (ctx) => recentKudosOf(ctx, ann, { direction: "received", limit }));
    expect((await recent()).entries.map(shown)).toEqual([12, 11, 10, 9, 8].map((at) => `received from Ben at ${at}`));
    expect((await recent(50)).entries.map(shown)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((at) => `received from Ben at ${at}`));
  });

  test("mentions read as names and group handles, and a page resolves at most 2,000 mentions before the rest read as a teammate", async () => {
    const people = Array.from({ length: 2_001 }, (_, i) => `U${i}`);
    for (const user of people) standIn.names.set(user, `Person ${user}`);
    const message = kudos(ben, [ann], 10);
    standIn.words.set(messageKey(message), [...people.map((user): WordSegment => ({ kind: "person", user })), { kind: "group", group: "S_DESIGN" }]);

    const [entry] = (await read(ann, "all")).entries;
    const segments = entry?.kind === "kudosReceived" && entry.message.kind === "text" ? entry.message.segments : [];
    expect(segments.slice(0, 2)).toEqual([{ kind: "person", name: "Person U0" }, { kind: "person", name: "Person U1" }]);
    expect(segments.slice(1_999, 2_001)).toEqual([{ kind: "person", name: "Person U1999" }, { kind: "person", name: "A teammate" }]);
    expect(segments.at(-1)).toEqual({ kind: "group", handle: "group" });
  });

  test("a cursor the activity never gave is refused", async () => {
    await expect(read(ann, "all", "not-a-cursor")).rejects.toThrow("unreadable activity cursor");
  });
});

describe("behind the activity flag", () => {
  test("the activity shows to a member, by their analytics ID, while the activity flag is on for them", async () => {
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "phx-test");
    const member = await seed.insert("members", { workspace: "T1", user: "U_ANN", kind: "member" });
    await seed.insert("analyticsIds", { member, analyticsId: "analytics-ann" });
    const shown = () => operations.query("website.activity.shown", (ctx) => activityShownTo(ctx, member));

    await definitionsStored(operations, onForEveryone("activity"));
    expect(await shown()).toBe(true);
    await definitionsStored(operations, offForEveryone("activity"));
    expect(await shown()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("the workspace's spotlight", () => {
  const spotlight = (from: { seed: number } | { after: string }) => operations.query("website.spotlight.spotlightOf", (ctx) => spotlightOf(ctx, "T1", from));

  /** The spotlight's answers from `seed`, each read from the cursor the one before it gave, until one ends the walk. */
  async function walk(seed: number, most: number) {
    const answers = [];
    let next = await spotlight({ seed });
    for (;;) {
      answers.push(next.kind === "kudos" ? `kudos at ${next.at}` : next.kind);
      if (next.kind === "empty" || answers.length === most) return answers;
      next = await spotlight({ after: next.after });
    }
  }

  test("each cursor reads on from the draw it answered: past every skipped draw, and around the circle after a kudos", async () => {
    standIn.draws = [
      { position: 0.1, created: 1, drawable: true },
      { position: 0.3, created: 2, drawable: false },
      { position: 0.3, created: 3, drawable: false },
      { position: 0.6, created: 4, drawable: true },
    ];

    expect(await walk(0.2, 6)).toEqual(["skipped", "skipped", "kudos at 4", "kudos at 1", "skipped", "skipped"]);
  });

  test("a walk of skipped draws ends once it is back where it began", async () => {
    standIn.draws = [
      { position: 0.1, created: 1, drawable: false },
      { position: 0.3, created: 2, drawable: false },
      { position: 0.6, created: 3, drawable: false },
    ];

    expect(await walk(0.2, 10)).toEqual(["skipped", "skipped", "skipped", "empty"]);
  });

  test("a cursor the spotlight never gave is refused", async () => {
    await expect(spotlight({ after: "0.25_1000~not-a-point" })).rejects.toThrow("unreadable spotlight cursor");
    await expect(spotlight({ after: "2_1000" })).rejects.toThrow("unreadable spotlight cursor");
  });
});
