import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { shellFixtures } from "../shell";
import { renderAlbum } from "../test/renderApp";
import { fakeSystemTheme, preferWideScreen } from "../test/systemTheme";
import { albumFixtures, fixedAlbum, fixedPeople } from "./albumFixtures";
import type { Album, QuestsRead, QuestsShown } from "./answer";
import { boardsFixtures, fixedBoards } from "./boardsFixtures";
import { fixedHoggies, hoggiesFixtures } from "./hoggiesFixtures";
import { fixedPlayerCards } from "./playerCardFixtures";
import { fixedProfile, profileFixtures } from "./profileFixtures";
import { fixedQuests, noQuests, questsFixtures } from "./questsFixtures";
import { fixtureWeeks } from "./weekFixtures";

const arrival = { timeout: 10_000 };
const aTeamPage = "/book#teams/lanterns";
const onTheMondayPath: Album = { ...albumFixtures.midway, gettingStarted: null };
const withPageD: Album = { ...onTheMondayPath, personPageD: true, linkPreviews: true };

beforeAll(async () => {
  await import("./AlbumApp");
});

beforeEach(() => {
  window.localStorage.clear();
  fakeSystemTheme(false);
  preferWideScreen();
});

afterEach(() => vi.restoreAllMocks());

function visit(address: string, { quests = fixedQuests(questsFixtures.newcomer), album = onTheMondayPath }: { quests?: QuestsRead; album?: Album } = {}) {
  window.history.replaceState(null, "", address);
  return renderAlbum(shellFixtures.member, fixedAlbum(album), {
    quests,
    playerCards: fixedPlayerCards(),
    weeks: fixtureWeeks(),
    people: fixedPeople(album),
    boards: fixedBoards(boardsFixtures.week),
    profile: fixedProfile(profileFixtures.noted),
    hoggies: fixedHoggies(hoggiesFixtures.glance),
  });
}

async function openPanel() {
  return within(await screen.findByRole("complementary", { name: "Quests" }, arrival));
}

function tab() {
  return screen.getByRole("button", { name: /^Quests,/ });
}

function stepsMarkedNextIn(panel: Awaited<ReturnType<typeof openPanel>>) {
  return panel.getAllByRole("listitem").flatMap((step) => /^(.*): next\b/.exec(step.getAttribute("aria-label") ?? "")?.[1] ?? []);
}

function views(actions: { viewQuests: ReturnType<typeof vi.fn> }) {
  return actions.viewQuests.mock.calls.map(([surface]) => surface);
}

describe("MQ38 MQ39: the quests panel greets a newcomer with the Getting started journey", { timeout: 30_000 }, () => {
  it("opens on a first visit with the eyebrow, the warm title, its note, five steps and the footer", async () => {
    visit(aTeamPage);

    const panel = await openPanel();
    expect(panel.getByText("Getting started · 1 of 5")).toBeInTheDocument();
    expect(panel.getByRole("heading", { name: "Welcome in, Sam" })).toBeInTheDocument();
    expect(panel.getByText("A few small ways to make someone's day. Every quest leaves an unidentified hoggie on your board.")).toBeInTheDocument();
    expect(panel.getAllByRole("listitem").map((step) => step.getAttribute("aria-label"))).toEqual([
      "Give your first hug: done",
      "Give a kudos to someone: next, +50 XP and an unidentified hoggie",
      "Identify the hoggie it left on your board: not yet",
      "Thank someone new: not yet, +50 XP and an unidentified hoggie",
      "Thank someone on two different days: not yet, +50 XP and an unidentified hoggie",
    ]);
    expect(panel.getByText("Once these are done, three new quests arrive every Monday.")).toBeInTheDocument();
  });

  it("names the next step with its hint, and shows progress on a step that counts more than one", async () => {
    visit(aTeamPage, { quests: fixedQuests(questsFixtures.halfway) });

    const panel = await openPanel();
    const next = within(panel.getByRole("listitem", { name: /^Thank someone new: next/ }));
    expect(next.getByText("Next")).toBeInTheDocument();
    expect(next.getByText("Someone from another team counts, and so does a new joiner.")).toBeInTheDocument();
    expect(panel.getByRole("img", { name: "1 of 2" })).toBeInTheDocument();
    expect(panel.getByText("Getting started · 3 of 5")).toBeInTheDocument();
  });

  it.each([
    { journey: "before the first hug", quests: questsFixtures.beforeTheFirstHug, next: "Give a kudos to someone" },
    { journey: "with the first kudos given and its hoggie still unidentified", quests: questsFixtures.firstThanks, next: "Thank someone new" },
  ])("MQ6: marks the quest the backend names next $journey, not the first step left", async ({ quests, next }) => {
    visit(aTeamPage, { quests: fixedQuests(quests) });

    const panel = await openPanel();
    expect(stepsMarkedNextIn(panel)).toEqual([next]);
    expect(panel.getAllByText("Next")).toHaveLength(1);
  });

  it("MQ6: marks no step next once the backend names no next quest", async () => {
    visit(aTeamPage, { quests: fixedQuests(questsFixtures.awaitingTheDraw) });

    const panel = await openPanel();
    expect(stepsMarkedNextIn(panel)).toEqual([]);
    expect(panel.queryByText("Next")).not.toBeInTheDocument();
  });

  it("MQ37: a finished step whose hoggie waits offers the board, and one already turned does not", async () => {
    visit(aTeamPage, { quests: fixedQuests(questsFixtures.firstThanks) });

    const panel = await openPanel();
    const finished = within(panel.getByRole("listitem", { name: /^Give a kudos to someone: done/ }));
    expect(finished.getByRole("button", { name: "Identify it on your board →" })).toBeInTheDocument();
    expect(panel.getAllByRole("button", { name: "Identify it on your board →" })).toHaveLength(1);
  });

  it("MQ41: records one panel view for the first-visit open", async () => {
    const { actions } = visit(aTeamPage);

    await openPanel();

    await waitFor(() => expect(views(actions)).toEqual(["panel"]));
  });
});

describe("MQ41 MQ36: a view counts only once the quests are in sight", { timeout: 30_000 }, () => {
  it.each<[string, string, Album, string]>([
    ["panel", aTeamPage, albumFixtures.withItems, "panel"],
    ["panel on the own page D", "/book#me", { ...albumFixtures.withItems, personPageD: true, linkPreviews: true }, "panel"],
  ])("the %s records no view while the item board covers the page, and one once it is put away", async (_, address, album, surface) => {
    const { actions, user } = visit(address, { album });
    const board = within(await screen.findByRole("dialog", { name: "Your items" }, arrival));

    expect(views(actions)).toEqual([]);
    await user.click(board.getByRole("button", { name: "Later" }));

    await waitFor(() => expect(views(actions)).toEqual([surface]));
  });

  it("the panel records no view while a hoggie's entry is open over the page, and one once it closes", async () => {
    const { actions, user } = visit("/book#hoggies/angel");
    await screen.findByRole("dialog", {}, arrival);

    expect(views(actions)).toEqual([]);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(views(actions)).toEqual(["panel"]));
  });
});

describe("MQ39: the panel folds to a tab, and the fold is remembered", { timeout: 30_000 }, () => {
  it("folds into a tab with its ring and unfolds from it, recording a view for each open", async () => {
    const { actions, user } = visit(aTeamPage);
    const panel = await openPanel();

    await user.click(panel.getByRole("button", { name: "Fold the quests away" }));

    expect(screen.queryByRole("heading", { name: "Welcome in, Sam" })).not.toBeInTheDocument();
    expect(tab()).toHaveAccessibleName("Quests, 1 of 5 done");
    await user.click(tab());
    expect(await openPanel()).toBeTruthy();
    await waitFor(() => expect(views(actions)).toEqual(["panel", "panel"]));
  });

  it("Escape folds it", async () => {
    const { user } = visit(aTeamPage);
    const panel = await openPanel();

    panel.getByRole("button", { name: "Fold the quests away" }).focus();
    await user.keyboard("{Escape}");

    expect(tab()).toBeInTheDocument();
  });

  it("starts folded on the next visit once folded, and records no view until it opens", async () => {
    const first = visit(aTeamPage);
    await first.user.click((await openPanel()).getByRole("button", { name: "Fold the quests away" }));
    first.unmount();

    const { actions } = visit(aTeamPage);

    expect(await screen.findByRole("button", { name: /^Quests,/ }, arrival)).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Quests" })).not.toBeInTheDocument();
    expect(views(actions)).toEqual([]);
  });

  it("starts folded on a phone whatever was remembered, and opens over the page", async () => {
    window.matchMedia = ((query: string) => ({ media: query, matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const { user } = visit(aTeamPage);

    await user.click(await screen.findByRole("button", { name: /^Quests,/ }, arrival));

    expect((await openPanel()).getByRole("heading", { name: "Welcome in, Sam" })).toBeInTheDocument();
  });
});

describe("MQ37 MQ39: after onboarding the panel lists this week's drawn quests", { timeout: 30_000 }, () => {
  it("shows three rows with progress and +20 XP, a finished row crossed off with its board link, and the days left", async () => {
    visit(aTeamPage, { quests: fixedQuests(questsFixtures.week) });

    const panel = await openPanel();
    expect(panel.getByText("This week · 1 of 3")).toBeInTheDocument();
    expect(panel.getByRole("heading", { name: "Your quests this week, Sam" })).toBeInTheDocument();
    expect(panel.getAllByRole("listitem").map((row) => row.getAttribute("aria-label"))).toEqual([
      "Thank 3 people in one day: not yet, +20 XP and an unidentified hoggie",
      "Thank 2 people you haven't thanked before: not yet, +20 XP and an unidentified hoggie",
      "Thank someone you haven't thanked in the last 30 days: done, won 20 XP and a hoggie",
    ]);
    expect(panel.getByRole("img", { name: "2 of 3" })).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Identify it on your board →" })).toBeInTheDocument();
    expect(panel.getByText("3 days left · new quests Monday at 9:00")).toBeInTheDocument();
  });
});

describe("HH54 HH55: under two-quests the panel lists the hug quest, then the kudos quest, as one checklist", { timeout: 30_000 }, () => {
  it("shows the eyebrow counting two, each row with its goal, its how-to and its reward, and marks the quest the backend names next", async () => {
    visit(aTeamPage, { quests: fixedQuests(questsFixtures.twoQuestsNewcomer) });

    const panel = await openPanel();
    expect(panel.getByText("This week's quests · 0 of 2")).toBeInTheDocument();
    expect(panel.getAllByRole("listitem").map((row) => row.getAttribute("aria-label"))).toEqual([
      "Give 3 hugs: next, +20 XP and an unidentified hoggie",
      "Thank someone new: not yet, +50 XP and an unidentified hoggie",
    ]);
    const hug = within(panel.getByRole("listitem", { name: /^Give 3 hugs/ }));
    expect(hug.getByText("Next")).toBeInTheDocument();
    expect(hug.getByText("React with your kudos emoji on any message in Slack.")).toBeInTheDocument();
    expect(hug.getByRole("img", { name: "1 of 3" })).toBeInTheDocument();
    expect(within(panel.getByRole("listitem", { name: /^Thank someone new/ })).getByText("Someone from another team counts, and so does a new joiner.")).toBeInTheDocument();
    expect(panel.getAllByText("Next")).toHaveLength(1);
    expect(panel.queryByText(/Getting started/)).not.toBeInTheDocument();
  });

  it("crosses off a finished drawn quest with its board link and hides its how-to, and counts it in the eyebrow and the tab", async () => {
    visit(aTeamPage, { quests: fixedQuests(questsFixtures.twoQuestsDrawn) });

    const panel = await openPanel();
    expect(panel.getByText("This week's quests · 1 of 2")).toBeInTheDocument();
    expect(panel.getAllByRole("listitem").map((row) => row.getAttribute("aria-label"))).toEqual([
      "Hug messages on 2 different days: done, won 20 XP and a hoggie",
      "Thank 3 people in one day: next, +20 XP and an unidentified hoggie",
    ]);
    expect(panel.queryByText("React with your kudos emoji on any message in Slack.")).not.toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Identify it on your board →" })).toBeInTheDocument();
  });

  it("shows one row and counts one when a side has no quest this week", async () => {
    visit(aTeamPage, { quests: fixedQuests(questsFixtures.twoQuestsOneSide) });

    const panel = await openPanel();
    expect(panel.getByText("This week's quests · 0 of 1")).toBeInTheDocument();
    expect(panel.getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("MQ40: the member's own page D leaves the quests to the panel", { timeout: 30_000 }, () => {
  it("shows no quests section, and the panel opens beside the page and records its view", async () => {
    const { actions } = visit("/book#me", { album: withPageD });

    expect((await openPanel()).getByRole("heading", { name: "Welcome in, Sam" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Your card" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your quests" })).not.toBeInTheDocument();
    await waitFor(() => expect(views(actions)).toEqual(["panel"]));
  });

  it("MQ22: the welcome's link opens the folded panel, and leaves the remembered fold as it was", async () => {
    const first = visit(aTeamPage);
    await first.user.click((await openPanel()).getByRole("button", { name: "Fold the quests away" }));
    first.unmount();
    const landed = visit("/book#me/quests", { album: withPageD });
    expect(await openPanel()).toBeTruthy();
    landed.unmount();

    visit(aTeamPage);

    expect(await screen.findByRole("button", { name: /^Quests,/ }, arrival)).toBeInTheDocument();
  });

  it.each<[string, boolean]>([
    ["/book#me/quests/someone-new", true],
    ["/book#me/quests", false],
  ])("MQ22: the welcome's link %s opens the named step's how-to: %s", async (address, opened) => {
    visit(address, { album: withPageD });

    const step = within((await openPanel()).getByRole("listitem", { name: /^Thank someone new:/ }));

    if (opened) expect(await step.findByText("Someone from another team counts, and so does a new joiner.")).toBeInTheDocument();
    else expect(step.queryByText("Someone from another team counts, and so does a new joiner.")).not.toBeInTheDocument();
  });

  it("the old profile, with page D off, gets no Getting started strip, and the panel opens as on any page", async () => {
    visit("/book#me");

    expect(await openPanel()).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
  });
});

describe("MQ42 MQ43: no panel off the path, while loading or when the read fails", { timeout: 30_000 }, () => {
  it.each<[string, QuestsShown | undefined]>([
    ["off the Monday path", { kind: "not-found" }],
    ["while the read is loading", undefined],
    ["when the read fails", { kind: "broken" }],
  ])("%s there is no panel and no tab, and the page works", async (_, answer) => {
    visit("/book#me", { quests: () => answer, album: withPageD });

    expect(await screen.findByRole("region", { name: "Your card" }, arrival)).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Quests" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Quests,/ })).not.toBeInTheDocument();
  });

  it.each<[string, QuestsShown | undefined]>([
    ["while the read is loading", undefined],
    ["when the read fails", { kind: "broken" }],
  ])("on the Monday path, %s the old profile shows no Getting started strip", async (_, answer) => {
    visit("/book#me", { quests: () => answer });

    expect(await screen.findByRole("heading", { level: 1 }, arrival)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
  });

  it("off the Monday path the old profile keeps its Getting started strip", async () => {
    visit("/book#me", { quests: noQuests, album: albumFixtures.midway });

    expect(await screen.findByRole("region", { name: "Getting started" }, arrival)).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Quests" })).not.toBeInTheDocument();
  });
});
