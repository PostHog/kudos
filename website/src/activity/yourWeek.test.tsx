import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ActivityState } from "../../../convex/website/activity";
import { albumFixtures, fixedAlbum } from "../album/albumFixtures";
import type { ActivityWeekRead } from "../album/answer";
import { fixedQuests, noQuests, questsFixtures } from "../album/questsFixtures";
import type { QuestsRead } from "../album/answer";
import { fixtureWeeks } from "../album/weekFixtures";
import { shellFixtures } from "../shell";
import { renderAlbum } from "../test/renderApp";
import { fakeSystemTheme, preferWideScreen } from "../test/systemTheme";
import { activityWeekFixtures, fensKudos, fixedActivityWeek, junosMessage, slackOfTheWorkspace, theWeeklyEdition } from "./activityWeekFixtures";

beforeEach(() => {
  fakeSystemTheme(false);
  preferWideScreen();
});

function visit(activity: ActivityWeekRead, viewActivity: (state: ActivityState) => void = () => {}, album = albumFixtures.midway, quests: QuestsRead = noQuests) {
  window.history.replaceState(null, "", "/activity");
  return renderAlbum(shellFixtures.member, fixedAlbum(album), { activity, quests, weeks: fixtureWeeks(), commands: { viewActivity } });
}

function visitWithQuests(activity: ActivityWeekRead, quests: QuestsRead) {
  return visit(activity, () => {}, albumFixtures.midway, quests);
}

function checksIn(box: ReturnType<typeof within>) {
  return box.getAllByRole("listitem").map((check: HTMLElement) => `${within(check).getByRole("img").getAttribute("aria-label")}: ${spokenTextOf(check)}`);
}

async function questsBox() {
  return within(await screen.findByRole("region", { name: "This week's quests" }));
}

async function thankedBox() {
  return within(await screen.findByRole("region", { name: "Who thanked you this week" }));
}

async function nextStep() {
  return within(await screen.findByRole("region", { name: "Your next step" }));
}

function spokenTextOf(element: Element): string {
  const parts = [...element.childNodes].map((node) => (node instanceof Element ? (node.getAttribute("aria-hidden") === "true" ? "" : spokenTextOf(node)) : (node.textContent ?? "")));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

describe("HH62 HH63: Activity leads with one next step", { timeout: 30_000 }, () => {
  it("is titled Your week under the Activity eyebrow", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.empty));

    expect(await screen.findByRole("heading", { level: 1, name: "Your week" })).toBeInTheDocument();
    expect(screen.getByText("Activity", { selector: ".al-eyebrow" })).toBeInTheDocument();
  });

  it("asks a member who never hugged for their first hug, with one Open Slack button", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.empty));

    const card = await nextStep();
    expect(card.getByText("Hug · a reaction")).toBeInTheDocument();
    expect(card.getByRole("heading", { level: 2, name: "Give your first hug" })).toBeInTheDocument();
    expect(spokenTextOf(card.getByText(/That's a hug/))).toBe("React with :hedgehug: to a teammate's message in Slack. That's a hug: they see it, and you both get XP.");
    expect(card.getAllByRole("link").map((link) => [spokenTextOf(link), link.getAttribute("href")])).toEqual([["Open Slack (opens in a new tab)", slackOfTheWorkspace]]);
  });

  it("asks everyone else to hug a message today, saying the first hug each day pays extra while hugs pay", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.quiet));

    const card = await nextStep();
    expect(card.getByRole("heading", { level: 2, name: "Hug a message today" })).toBeInTheDocument();
    expect(spokenTextOf(card.getByText(/teammate's message/))).toBe("React with :hedgehug: to a teammate's message. Your first hug each day pays extra XP.");
    expect(card.getAllByRole("link").map((link) => [spokenTextOf(link), link.getAttribute("href")])).toEqual([["Open Slack (opens in a new tab)", slackOfTheWorkspace]]);
  });

  it("promises no extra XP while hugs don't pay it", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.quietWithoutRewards));

    const card = await nextStep();
    expect(spokenTextOf(card.getByText(/teammate's message/))).toBe("React with :hedgehug: to a teammate's message.");
  });

  it("asks a thanked member to hug the kudos back, its one button opening that kudos in Slack", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.thanked));

    const card = await nextStep();
    expect(card.getByRole("heading", { level: 2, name: "Hug Fen's kudos back" })).toBeInTheDocument();
    expect(spokenTextOf(card.getByText(/thanked you/))).toBe("Fen thanked you on Wednesday. React with :hedgehug: to their message and they get a hug back.");
    expect(card.getAllByRole("link").map((link) => [spokenTextOf(link), link.getAttribute("href")])).toEqual([["Open Fen's message (opens in a new tab)", fensKudos]]);
  });
});

describe("HH64: beside the step, a Slack message drawn with one reaction of the kudos emoji", { timeout: 30_000 }, () => {
  it.each([
    ["empty", "Alex Lee", "Shipped the fix for the flaky deploy, should be green now.", activityWeekFixtures.empty],
    ["quiet", "Juno Park", "Docs for the new export flow are up, comments welcome.", activityWeekFixtures.quiet],
    ["thanked", "Fen Marlowe", "The demo today was brilliant, the way you explained the data model clicked for everyone.", activityWeekFixtures.thanked],
  ] as const)("the %s step draws %s's message", async (_, sender, words, answer) => {
    visit(fixedActivityWeek(answer));

    const card = await nextStep();
    expect(card.getByText(sender)).toBeInTheDocument();
    expect(card.getByText(words)).toBeInTheDocument();
    expect(card.getByText("1", { selector: ".xpm-slack-reaction-count" })).toBeInTheDocument();
  });
});

describe("HH62 HH65: the week's quests sit under the step, one checkbox row each", { timeout: 30_000 }, () => {
  it("lists this week's drawn quests with how to give a kudos and their reward, a finished one ticked, and no difficulty labels", async () => {
    visitWithQuests(fixedActivityWeek(activityWeekFixtures.quiet), fixedQuests(questsFixtures.week));

    const box = await questsBox();
    expect(box.getByRole("heading", { level: 2, name: "This week's quests · 1 of 3" })).toBeInTheDocument();
    expect(checksIn(box)).toEqual([
      "Not done: Thank 3 people in one day Write :hedgehug: @name and what they did, in any channel HedgeHug is in. +20 XP and a hoggie",
      "Not done: Thank 2 people you haven't thanked before Write :hedgehug: @name and what they did, in any channel HedgeHug is in. +20 XP and a hoggie",
      "Done: Thank someone you haven't thanked in the last 30 days Write :hedgehug: @name and what they did, in any channel HedgeHug is in. +20 XP and a hoggie",
    ]);
    expect(box.queryByText(/Say why|Reach out|Join in/)).not.toBeInTheDocument();
  });

  it("draws a tick in a finished quest's box, so done never rests on color alone", async () => {
    visitWithQuests(fixedActivityWeek(activityWeekFixtures.quiet), fixedQuests(questsFixtures.week));

    const box = await questsBox();
    const ticked = box.getAllByRole("img").map((checkBox: HTMLElement) => `${checkBox.getAttribute("aria-label")}: ${checkBox.querySelector("svg") === null ? "empty" : "ticked"}`);
    expect(ticked).toEqual(["Not done: empty", "Not done: empty", "Done: ticked"]);
  });

  it("shows how to do each getting-started step, and no reward where a step has none", async () => {
    visitWithQuests(fixedActivityWeek(activityWeekFixtures.empty), fixedQuests(questsFixtures.beforeTheFirstHug));

    const box = await questsBox();
    expect(checksIn(box).slice(0, 2)).toEqual([
      "Not done: Give your first hug React with your kudos emoji on any message in Slack.",
      "Not done: Give a kudos to someone Mention someone in a Slack message and add your kudos emoji. +50 XP and a hoggie",
    ]);
  });

  it("HH54: under two-quests lists the hug quest with how to hug, then the kudos quest with its own how-to, each with its reward", async () => {
    visitWithQuests(fixedActivityWeek(activityWeekFixtures.quiet), fixedQuests(questsFixtures.twoQuestsNewcomer));

    const box = await questsBox();
    expect(box.getByRole("heading", { level: 2, name: "This week's quests · 0 of 2" })).toBeInTheDocument();
    expect(checksIn(box)).toEqual([
      "Not done: Give 3 hugs React with your kudos emoji on any message in Slack. +20 XP and a hoggie",
      "Not done: Thank someone new Someone from another team counts, and so does a new joiner. +50 XP and a hoggie",
    ]);
  });

  it("HH54: under two-quests a drawn kudos quest, which has no how-to of its own, shows how to give a kudos", async () => {
    visitWithQuests(fixedActivityWeek(activityWeekFixtures.quiet), fixedQuests(questsFixtures.twoQuestsDrawn));

    const box = await questsBox();
    expect(checksIn(box)).toEqual([
      "Done: Hug messages on 2 different days React with your kudos emoji on any message in Slack. +20 XP and a hoggie",
      "Not done: Thank 3 people in one day Write :hedgehug: @name and what they did, in any channel HedgeHug is in. +20 XP and a hoggie",
    ]);
  });

  it("hides the shell's quests panel while the page shows them", async () => {
    visitWithQuests(fixedActivityWeek(activityWeekFixtures.quiet), fixedQuests(questsFixtures.week));
    await questsBox();

    expect(screen.queryByRole("complementary", { name: "Quests" })).not.toBeInTheDocument();
  });

  it("keeps the shell's quests panel on the weekly edition", async () => {
    visitWithQuests(theWeeklyEdition, fixedQuests(questsFixtures.week));

    expect(await screen.findByRole("complementary", { name: "Quests" }, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "This week's quests" })).not.toBeInTheDocument();
  });
});

describe("HH66: who thanked you this week sits beside the quests", { timeout: 30_000 }, () => {
  it("lists every hug and kudos, newest first, with the sender, the way, the day and a kudos's words", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.thanked));

    const box = await thankedBox();
    expect(box.getByRole("heading", { level: 2, name: "Who thanked you this week" })).toBeInTheDocument();
    expect(box.getAllByRole("listitem").map(spokenTextOf)).toEqual([
      "Fen Marlowe gave you a kudos · Wed The demo today was brilliant, the way you explained the data model clicked for everyone.",
      "Ines Duarte hugged your kudos back · Tue Thanks for pairing on the webhook queue.",
      "Juno Park hugged a kudos you got · Tue Great write-up on the retry fix.",
      "Juno Park hugged your message (opens in a new tab) · Tue",
    ]);
  });

  it("links a hug on an ordinary message to that message in Slack, never showing its words", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.thanked));

    const box = await thankedBox();
    expect(box.getAllByRole("link").map((link) => [spokenTextOf(link), link.getAttribute("href")])).toEqual([["hugged your message (opens in a new tab)", junosMessage]]);
  });

  it("names a hug on an ordinary message without a link when Slack's address of it is unknown", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.hugUnlinked));

    const box = await thankedBox();
    expect(box.getAllByRole("listitem").map(spokenTextOf)).toEqual(["Juno Park hugged your message · Tue"]);
    expect(box.queryByRole("link")).not.toBeInTheDocument();
  });

  it("draws each sender's face", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.thanked));

    const box = await thankedBox();
    expect(box.getAllByRole("listitem").map((row: HTMLElement) => row.querySelector("[aria-hidden='true']")?.textContent)).toEqual(["FM", "ID", "JP", "JP"]);
  });

  it("says who shows here while nobody has thanked the member yet", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.quiet));

    const box = await thankedBox();
    expect(box.getByText("Nobody yet. Hugs and kudos you get show here, with who sent them.")).toBeInTheDocument();
    expect(box.queryByRole("listitem")).not.toBeInTheDocument();
  });
});

describe("HH67: one line on last week opens its weekly issue", { timeout: 30_000 }, () => {
  it("says what the member gave and got last week", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.thanked));

    expect((await screen.findByText(/^Last week you gave/)).textContent).toBe("Last week you gave 2 hugs and 1 kudos, and got 1 hug. Read last week");
  });

  it("opens the weekly issue of last week from Read last week", async () => {
    const { user } = visit(fixedActivityWeek(activityWeekFixtures.thanked), () => {}, { ...albumFixtures.midway, shareableUrls: true });

    await user.click(await screen.findByRole("link", { name: "Read last week" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Weekly edition" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Last week in your album" })).toBeInTheDocument();
    expect(window.location.search).toBe("?week=2026-10-05");
  });

  it("shows no line for a member with no history", async () => {
    visit(fixedActivityWeek(activityWeekFixtures.empty));
    await nextStep();

    expect(screen.queryByText(/^Last week you gave/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Read last week" })).not.toBeInTheDocument();
  });
});

describe("HH68: while activity-next is off, Activity is today's weekly edition", { timeout: 30_000 }, () => {
  it("shows the weekly edition", async () => {
    visit(theWeeklyEdition);

    expect(await screen.findByRole("heading", { level: 1, name: "Weekly edition" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your next step" })).not.toBeInTheDocument();
  });
});

describe("HH91: the page records activity viewed once it shows", { timeout: 30_000 }, () => {
  it.each([
    ["empty", activityWeekFixtures.empty],
    ["quiet", activityWeekFixtures.quiet],
    ["thanked", activityWeekFixtures.thanked],
  ] as const)("records one view in the %s state", async (state, answer) => {
    const viewed: ActivityState[] = [];
    const view = visit(fixedActivityWeek(answer), (shown) => viewed.push(shown));
    await nextStep();

    view.showVisitor({ ...shellFixtures.member });
    await nextStep();

    expect(viewed).toEqual([state]);
  });

  it("records nothing while the item board covers the page, and one view once it is put away", async () => {
    const viewed: ActivityState[] = [];
    const { user } = visit(fixedActivityWeek(activityWeekFixtures.thanked), (shown) => viewed.push(shown), albumFixtures.withItems);
    const board = within(await screen.findByRole("dialog", { name: "Your items" }, { timeout: 10_000 }));

    expect(viewed).toEqual([]);
    await user.click(board.getByRole("button", { name: "Later" }));

    await waitFor(() => expect(viewed).toEqual(["thanked"]));
  });

  it("records nothing while the page shows the weekly edition", async () => {
    const viewed: ActivityState[] = [];
    visit(theWeeklyEdition, (shown) => viewed.push(shown));
    await screen.findByRole("heading", { level: 1, name: "Weekly edition" });

    expect(viewed).toEqual([]);
  });
});
