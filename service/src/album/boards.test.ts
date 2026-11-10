// The thoughtful boards' reads over the service: people and company teams ranked by the kudos awards given in the
// period the reader asks, ties sharing a rank, the reader's own row and teams pinned, and a member's place in their
// week. The tallies are the boards' own rows, as the counting (countOnTheBoards) keeps them; today's
// convex/website/thoughtfulBoards.test.ts reads them through getThoughtfulBoards after kudos posted in Slack, which is
// S16's port. Who shows on the leaderboards is S11's visibility.ts, stood in by its map signature.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { allTimeKey, keyOf, wholeWeekBefore } from "../leaderboard/periods.ts";
import type { MemberId } from "../workspace/directory.ts";
import { allTimeBoardsIn, countOnTheBoards, thoughtfulBoardsOf, weekPlaceOf, type BoardPeriod } from "./boards.ts";
import { earnedWorld } from "./testing/earnedWorld.ts";

vi.mock("../leaderboard/visibility.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "visibility"));

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const today = "2026-10-13";
const thisWeek = keyOf("week", today);
const lastWeek = wholeWeekBefore("2026-10-12").now;

const backend = useTestBackend({ now: tuesday });
let t: TestBackend;
let alice: MemberId;
let bruno: MemberId;
let carol: MemberId;
let dana: MemberId;

beforeEach(async () => {
  t = backend();
  earnedWorld.reset();
  alice = await aMember("U_ALICE", "Alice", 1);
  bruno = await aMember("U_BRUNO", "Bruno", 2);
  carol = await aMember("U_CAROL", "Carol", 3);
  dana = await aMember("U_DANA", "Dana", null);
  await t.seed.insert("companyTeams", { team: "otters", name: "Otters", leads: [], people: [1, 2], asOf: tuesday });
  await t.seed.insert("companyTeams", { team: "lanterns", name: "Lanterns", leads: [], people: [3], asOf: tuesday });
  await t.seed.insert("companyTeams", { team: "quiet", name: "Quiet", leads: [], people: [9], asOf: tuesday });
});

describe("AL49: the boards rank kudos awards given in the period asked", () => {
  test("the people board ranks each giver by the kudos awards they gave this week, ties sharing a rank, and marks the reader", async () => {
    await gave(alice, 3);
    await gave(bruno, 5);
    await gave(carol, 3);

    const { people } = await boardsOf(alice, "week");

    expect(people.map(({ member, thoughtful, rank, tied, viewer }) => ({ member, thoughtful, rank, tied, viewer }))).toEqual([
      { member: bruno, thoughtful: 5, rank: 1, tied: false, viewer: false },
      { member: alice, thoughtful: 3, rank: 2, tied: true, viewer: true },
      { member: carol, thoughtful: 3, rank: 2, tied: true, viewer: false },
    ]);
    expect(people[0]).toMatchObject({ name: "Bruno", picture: "https://avatars.example/U_BRUNO.png", teams: ["otters"], face: { image: "https://faces.example/U_BRUNO.png", colour: "teal" } });
  });

  test("the team board sums its matched members' kudos awards, ties sharing a rank, and a team nobody gave for is off it", async () => {
    await gave(alice, 1);
    await gave(bruno, 2);
    await gave(carol, 3);
    await gave(dana, 7);

    const { teams } = await boardsOf(alice, "week");

    expect(teams.map(({ team, thoughtful, rank, tied, mine }) => ({ team, thoughtful, rank, tied, mine }))).toEqual([
      { team: "lanterns", thoughtful: 3, rank: 1, tied: true, mine: false },
      { team: "otters", thoughtful: 3, rank: 1, tied: true, mine: true },
    ]);
  });

  test("the member's own row and team are pinned, and with nothing given this week they are pinned unranked", async () => {
    await gave(bruno, 2);

    const boards = await boardsOf(alice, "week");

    expect(boards.onTheBoards).toBe(true);
    expect(boards.pinned.me).toMatchObject({ member: alice, thoughtful: 0, rank: null, tied: false, viewer: true });
    expect(boards.pinned.teams).toEqual([expect.objectContaining({ team: "otters", thoughtful: 2, rank: 1, mine: true })]);
    expect((await boardsOf(carol, "week")).pinned.teams, "a team of nothing given is pinned unranked").toEqual([expect.objectContaining({ team: "lanterns", thoughtful: 0, rank: null, tied: false })]);
    expect((await boardsOf(bruno, "week")).pinned.me).toMatchObject({ member: bruno, rank: 1 });
  });

  test("a kudos given last week is off this week's boards and on last week's; the month and all-time boards count theirs", async () => {
    await gave(alice, 2, lastWeek);
    await gave(bruno, 1, keyOf("month", today));
    await gave(carol, 4, allTimeKey);

    expect(await giversOn(alice, "week")).toEqual([]);
    expect(await giversOn(alice, "last-week")).toEqual([alice]);
    expect(await giversOn(alice, "month")).toEqual([bruno]);
    expect(await giversOn(alice, "all")).toEqual([carol]);
  });

  test("each reader reads their own week, so a reader ahead of UTC sees the new week while UTC is still on the old one", async () => {
    t.clock.advance(Date.parse("2026-10-18T20:00:00Z") - tuesday);
    await t.seed.patch("members", carol, { timeZone: "Pacific/Auckland" });
    await gave(bruno, 1, keyOf("week", "2026-10-19"));
    await gave(alice, 1, thisWeek);

    expect(await giversOn(carol, "week"), "Monday in Auckland").toEqual([bruno]);
    expect(await giversOn(alice, "week"), "still Sunday in UTC").toEqual([alice]);
  });

  test("Who gave narrows the people board to one team's givers, each keeping their rank", async () => {
    await gave(alice, 1);
    await gave(bruno, 2);
    await gave(carol, 3);

    const { people, teams } = await thoughtfulBoardsIn(alice, { whoGave: "otters", period: "week" });

    expect(people.map(({ member, rank }) => ({ member, rank }))).toEqual([
      { member: bruno, rank: 2 },
      { member: alice, rank: 3 },
    ]);
    expect(teams, "the team board is whole").toHaveLength(2);
  });

  test("a giver shows their stored company face, else their Slack picture, and without a profile no team", async () => {
    await gave(dana, 1);

    expect((await boardsOf(alice, "week")).people).toEqual([expect.objectContaining({ member: dana, face: null, picture: "https://avatars.example/U_DANA.png", teams: [] })]);
  });
});

describe("AL49: a member who left the boards is on neither thoughtful board", () => {
  test("a member whose Show me on the leaderboards is off is off the people board, their awards leave their team's sum, and they are pinned off the boards", async () => {
    await gave(alice, 2);
    await gave(bruno, 3);
    earnedWorld.offTheBoards.add(alice);

    const boards = await boardsOf(alice, "week");

    expect(boards.people.map(({ member }) => member)).toEqual([bruno]);
    expect(boards.teams).toEqual([expect.objectContaining({ team: "otters", thoughtful: 3 })]);
    expect(boards.onTheBoards).toBe(false);
    expect(boards.pinned.me).toBeNull();
  });

  test("a member who left the workspace is on neither board", async () => {
    await gave(alice, 2);
    await t.seed.patch("members", alice, { kind: "not-a-member" });

    expect((await boardsOf(bruno, "week")).people).toEqual([]);
    expect((await t.query((ctx) => allTimeBoardsIn(ctx, "T1"))).people).toEqual([]);
  });
});

describe("a member's place in their week", () => {
  test("the place counts the ranked givers ahead, and a tie with anyone ranked", async () => {
    await gave(alice, 3);
    await gave(bruno, 5);
    await gave(carol, 3);
    await gave(dana, 1);

    expect(await placeOf(alice)).toEqual({ rank: 2, tied: true, thoughtful: 3 });
    expect(await placeOf(bruno)).toEqual({ rank: 1, tied: false, thoughtful: 5 });
    expect(await placeOf(dana)).toEqual({ rank: 4, tied: false, thoughtful: 1 });
  });

  test("a giver off the boards or gone is passed over, and a member who gave nothing, or is off the boards, has no place", async () => {
    await gave(alice, 3);
    await gave(bruno, 5);
    await gave(carol, 3);
    earnedWorld.offTheBoards.add(bruno);
    await t.seed.patch("members", carol, { kind: "not-a-member" });

    expect(await placeOf(alice)).toEqual({ rank: 1, tied: false, thoughtful: 3 });
    expect(await placeOf(dana), "nothing given").toBeNull();
    expect(await placeOf(bruno), "off the boards").toBeNull();
    expect(await placeOf(carol), "gone").toBeNull();
  });
});

describe("the all-time boards of a workspace", () => {
  test("every giver of all time and every team, ranked, as the boards counted them", async () => {
    await t.run((ctx) => countOnTheBoards(ctx, { workspace: "T1", giver: alice, day: "2026-09-01" }));
    await t.run((ctx) => countOnTheBoards(ctx, { workspace: "T1", giver: alice, day: today }));
    await t.run((ctx) => countOnTheBoards(ctx, { workspace: "T1", giver: carol, day: today }));

    const { people, teams } = await t.query((ctx) => allTimeBoardsIn(ctx, "T1"));

    expect(people.map(({ member, thoughtful, rank, viewer }) => ({ member, thoughtful, rank, viewer }))).toEqual([
      { member: alice, thoughtful: 2, rank: 1, viewer: false },
      { member: carol, thoughtful: 1, rank: 2, viewer: false },
    ]);
    expect(teams.map(({ team, thoughtful, mine }) => ({ team, thoughtful, mine }))).toEqual([
      { team: "otters", thoughtful: 2, mine: false },
      { team: "lanterns", thoughtful: 1, mine: false },
    ]);
  });
});

async function aMember(user: string, name: string, profile: number | null): Promise<MemberId> {
  const member = await t.seed.insert("members", { workspace: "T1", user, kind: "member", name, picture: `https://avatars.example/${user}.png` });
  if (profile !== null) await t.seed.insert("companyFaces", { workspace: "T1", member, face: { image: `https://faces.example/${user}.png`, colour: "teal" }, profile });
  return member;
}

function gave(giver: MemberId, awards: number, period = thisWeek) {
  return t.seed.insert("thoughtfulBoardTallies", { workspace: "T1", period, giver, awards });
}

function boardsOf(member: MemberId, period: BoardPeriod) {
  return thoughtfulBoardsIn(member, { whoGave: null, period });
}

function thoughtfulBoardsIn(member: MemberId, asked: { whoGave: string | null; period: BoardPeriod }) {
  return t.query((ctx) => thoughtfulBoardsOf(ctx, { workspace: "T1", member }, asked));
}

async function giversOn(reader: MemberId, period: BoardPeriod) {
  return (await boardsOf(reader, period)).people.map(({ member }) => member);
}

function placeOf(member: MemberId) {
  return t.query((ctx) => weekPlaceOf(ctx, { workspace: "T1", member }));
}
