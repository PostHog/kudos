import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReachedTier } from "../../../convex/album/milestones";
import { levelOf, xpToReach } from "../../../convex/progression/levels";
import { shellFixtures, type TurnReply } from "../shell";
import { renderAlbum } from "../test/renderApp";
import { fakeSystemTheme, preferReducedMotion, preferWideScreen } from "../test/systemTheme";
import { albumFixtures, fixedPeople, fixtureTurnOf } from "./albumFixtures";
import type { Album, AlbumRead, HoggiesRead } from "./answer";
import { hoggiesFixtures } from "./hoggiesFixtures";

const withItems = albumFixtures.withItems;

const lastVisit = Date.parse("2026-10-19T10:00:00Z");

const hourMs = 3_600_000;

const familiarFaces: ReachedTier = { milestone: "people", tier: "silver" };

const everyonesAlbum: ReachedTier = { milestone: "people", tier: "diamond" };

beforeEach(() => {
  fakeSystemTheme(false);
  preferWideScreen();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function withTheTier({ milestone, tier }: ReachedTier, earnedAt: number | null, unlockedAt?: number) {
  const earned = earnedAt !== null;
  return (album: Album): Album => ({
    ...album,
    milestones: album.milestones.map((listed) => (listed.id === milestone ? { ...listed, tiers: listed.tiers.map((step) => (step.tier === tier ? { ...step, earnedAt, ...(unlockedAt !== undefined && { unlockedAt }) } : step)) } : listed)),
    emojis: album.emojis.map((emoji) => (emoji.id === `milestone:${milestone}:${tier}` ? { ...emoji, earned, seen: earned, progress: earned ? null : { have: 0, need: 1 } } : emoji)),
  });
}

const notYetReached = (reached: ReachedTier) => withTheTier(reached, null);

const reachedAt = (reached: ReachedTier, at: number) => withTheTier(reached, at);

function anAlbumThatAnswers(first: Album) {
  let answer = first;
  const listeners = new Set<() => void>();
  const read: AlbumRead = (asking) => {
    const shown = useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => answer,
    );
    return asking ? shown : undefined;
  };
  const answerNext = (next: Album) => {
    answer = next;
    listeners.forEach((listener) => listener());
  };
  return { read, answerNext, now: () => answer };
}

type Reaching = ReachedTier & { xp?: number };

const tierOf = ({ milestone, tier }: Reaching): ReachedTier => ({ milestone, tier });

const paying = (reached: ReachedTier, xp: number): Reaching => ({ ...reached, xp });

const itemXp = 15;

function medalXpOf(reaching: Reaching[]) {
  return reaching.flatMap((reached) => (reached.xp === undefined ? [] : [{ ...tierOf(reached), xp: reached.xp }]));
}

function aTurnThatReaches(...reaching: Reaching[]) {
  return async (item: string): Promise<TurnReply> => {
    const turned = fixtureTurnOf(item);
    const medalXp = medalXpOf(reaching);
    return turned.kind === "turned" ? { ...turned, unlocked: { ...turned.unlocked, milestones: reaching.map(tierOf), ...(medalXp.length > 0 && { medalXp }) } } : turned;
  };
}

function levelAt(xp: number) {
  const level = levelOf(xp);
  return { level, xp, startsAt: xpToReach(level), nextAt: xpToReach(level + 1) };
}

function aTurnThatPutsIn(...reaching: Reaching[]) {
  const medalXp = medalXpOf(reaching).reduce((sum, { xp }) => sum + xp, 0);
  return (album: Album, item: string): Album => {
    const turned = { ...album, board: { ...album.board!, items: album.board!.items.filter((waiting) => waiting.item !== item) }, ...(medalXp > 0 && { level: levelAt(album.level.xp + itemXp + medalXp) }) };
    return reaching.map(tierOf).reduce<Album>((reached, tier) => reachedAt(tier, Date.now())(reached), turned);
  };
}

function visit(...reaching: Reaching[]) {
  window.history.replaceState(null, "", "/book#me");
  const before = reaching.map(tierOf).reduce<Album>((album, tier) => notYetReached(tier)(album), { ...withItems, lastVisit });
  const live = anAlbumThatAnswers(before);
  const reply = aTurnThatReaches(...reaching);
  const after = aTurnThatPutsIn(...reaching);
  const turnItem = vi.fn(async (item: string) => {
    const answer = await reply(item);
    live.answerNext(after(live.now(), item));
    return answer;
  });
  const hoggies: HoggiesRead = (asking) => (asking ? hoggiesFixtures.midway : undefined);
  return { ...renderAlbum(shellFixtures.member, live.read, { hoggies, people: fixedPeople(withItems), commands: { turnItem } }), turnItem };
}

const arrival = { timeout: 10_000 };

async function theFirstItem() {
  const board = within(await screen.findByRole("dialog", { name: "Your items" }, arrival));
  return board.getAllByRole("button", { name: "An unidentified item. Identify it" })[0]!;
}

let clicked = 0;

async function clickOnFakeTime(item: HTMLElement) {
  vi.useFakeTimers();
  clicked = Date.now();
  await act(async () => fireEvent.click(item));
}

const frameMs = 16;

async function at(seconds: number) {
  const due = clicked + Math.round(seconds * 1000);
  while (Date.now() < due) await act(() => vi.advanceTimersByTimeAsync(Math.min(frameMs, due - Date.now())));
}

function stage() {
  return document.querySelector<HTMLElement>(".ib-ground")?.dataset.stage ?? "gone";
}

function dark() {
  return document.querySelector(".ib-ground")?.hasAttribute("data-dark") ?? false;
}

function theMedal({ milestone, tier }: ReachedTier) {
  return document.querySelector<HTMLElement>(`main [data-al-medal="${milestone}:${tier}"]`);
}

function theBurst() {
  return document.querySelector<HTMLElement>(".ib-medal-burst");
}

function theStage() {
  return document.querySelector<HTMLElement>(".ib-medal-stage");
}

function theTitle() {
  return document.querySelector<HTMLElement>(".ib-medal-title");
}

function theXpChip() {
  return document.querySelector<HTMLElement>(".ib-medal-xp");
}

function xpWords() {
  const [bar] = screen.getAllByRole("banner", { hidden: true });
  return within(bar!).getByText(/XP to level/, { selector: ".al-xp-words" }).textContent;
}

function earnedInTheTopBar() {
  const [bar] = screen.getAllByRole("banner", { hidden: true });
  const label = within(bar!).getByRole("button", { name: /^Your emojis, \d+ earned/, hidden: true }).getAttribute("aria-label")!;
  return Number(/(\d+) earned/.exec(label)![1]);
}

function newLabelsOn(element: HTMLElement | null) {
  return element === null ? [] : within(element).queryAllByText("New", { selector: ".ib-new" });
}

async function onMilestones(album: Album) {
  window.history.replaceState(null, "", "/book#milestones");
  renderAlbum(shellFixtures.member, (asking) => (asking ? album : undefined), { people: fixedPeople(album) });
  await screen.findByRole("heading", { name: "Milestones", level: 1 }, arrival);
}

describe("LP19a: a milestone tier unlocks with its own beat on Milestones", { timeout: 30_000 }, () => {
  it("after the item lands, fades to Milestones without a scroll, shows the medal big on centre stage with rays, Familiar faces · Silver, then stamps it into its row with its emoji and New, and the board comes back", async () => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    visit(familiarFaces);
    await clickOnFakeTime(await theFirstItem());

    await at(4.6);
    expect(dark()).toBe(false);
    expect(theBurst()).toBeNull();
    await at(4.8);
    expect(dark(), "the fade to the medal").toBe(true);
    expect(window.location.hash).toBe("#hoggies");
    await at(5.05);
    expect(dark()).toBe(true);
    expect(window.location.hash).toBe("#milestones");
    expect(theMedal(familiarFaces)).toHaveAttribute("data-step", "next");
    expect(newLabelsOn(theMedal(familiarFaces))).toHaveLength(0);

    await at(5.5);
    expect(stage()).toBe("medal");
    expect(dark()).toBe(false);
    expect(scrolled.mock.contexts).toContain(theMedal(familiarFaces));
    expect(scrolled).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "instant" }));
    expect(theStage()).toHaveAttribute("data-phase", "in");
    expect(theMedal(familiarFaces), "the row waits while the medal is on centre stage").toHaveAttribute("data-step", "next");
    expect(theBurst()!.style.getPropertyValue("--burst")).toBe("var(--medal-silver)");
    expect(within(theBurst()!).queryByTestId("confetti")).toBeNull();
    expect(theTitle()).toHaveTextContent("Medal unlockedFamiliar facesSilver · Faces in the album");
    expect(within(theTitle()!).queryByText(/XP/)).toBeNull();
    expect(screen.getByRole("status", { name: "Identifying" })).toHaveTextContent("Familiar faces · Silver medal unlocked");

    await at(9.0);
    expect(theStage(), "stamped into its row").toHaveAttribute("data-phase", "stamped");
    expect(theMedal(familiarFaces)).toHaveAttribute("data-step", "earned");
    expect(newLabelsOn(theMedal(familiarFaces))).toHaveLength(2);

    await at(10.8);
    expect(stage()).toBe("medal");
    await at(11.2);
    expect(stage()).toBe("rest");
    expect(theStage()).toBeNull();
    await at(12.2);
    expect(stage()).toBe("back");
    await at(12.8);
    expect(stage()).toBe("idle");
    expect(screen.getByRole("dialog", { name: "Your items" })).toBeInTheDocument();
  });

  it("springs the medal's emoji out once the medal stamps in, and counts it in the top bar only once it lands in the emoji button", async () => {
    visit(familiarFaces);
    const item = await theFirstItem();
    const before = earnedInTheTopBar();
    await clickOnFakeTime(item);

    await at(8.6);
    expect(stage()).toBe("medal");
    expect(document.querySelector(".ib-emoji"), "while the medal is on centre stage").toBeNull();
    expect(earnedInTheTopBar(), "while the medal is on centre stage").toBe(before);
    await at(9.6);
    expect(document.querySelector(".ib-emoji"), "the emoji out of the medal").toHaveTextContent("New emoji");
    expect(earnedInTheTopBar(), "while the emoji is out").toBe(before);
    await at(11.0);
    expect(document.querySelector(".ib-emoji")).toBeNull();
    expect(earnedInTheTopBar(), "once it lands").toBe(before + 1);
  });

  it("pays the medal's XP at the end of the beat: names it on the stage, flies it to the bar after the stamp, and holds the bar until it lands", async () => {
    visit(paying(familiarFaces, 250));
    await clickOnFakeTime(await theFirstItem());

    await at(5.5);
    expect(within(theTitle()!).getByText("+250 XP")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Identifying" })).toHaveTextContent("Familiar faces · Silver medal unlocked, +250 XP");
    expect(xpWords(), "the item's XP is in, the medal's waits").toBe("275 XP to level 7");
    expect(theXpChip()).toBeNull();

    await at(10.2);
    expect(theXpChip(), "the medal's XP flies to the bar").toHaveTextContent("+250 XP");
    expect(theXpChip()).toHaveAttribute("data-metal", "silver");
    expect(screen.getByRole("status", { name: "Identifying" })).toHaveTextContent("+250 XP for Familiar faces · Silver");
    expect(xpWords(), "while the XP is in flight").toBe("275 XP to level 7");

    await at(12.1);
    expect(theXpChip()).toBeNull();
    expect(xpWords(), "once it lands").toBe("25 XP to level 7");
  });

  it("holds a level the medal's XP crosses until its XP lands", async () => {
    visit(paying({ milestone: "people", tier: "gold" }, 500));
    await clickOnFakeTime(await theFirstItem());

    await at(10.2);
    expect(theXpChip()).toHaveTextContent("+500 XP");
    expect(xpWords()).toBe("275 XP to level 7");
    await at(12.1);
    expect(xpWords()).toBe("375 XP to level 8");
  });

  it("keeps the reduced-motion line off the strip once the beat has played", async () => {
    visit(familiarFaces);
    await clickOnFakeTime(await theFirstItem());

    await at(12.8);
    expect(stage()).toBe("idle");
    await act(async () => fireEvent.click(within(screen.getByRole("dialog", { name: "Your items" })).getByRole("button", { name: "Later" })));

    expect(screen.getByRole("status", { name: "Identified" }), "the strip after Later").not.toBeEmptyDOMElement();
    expect(screen.queryByRole("note", { name: "Medals unlocked" }), "the line for a beat that played").toBeNull();
  });

  it("puts a tier far from Closest medals in its row before the fade, so the medal stamps into its own row", async () => {
    const completionist: ReachedTier = { milestone: "hoggies", tier: "diamond" };
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    visit(completionist);
    await clickOnFakeTime(await theFirstItem());

    await at(5.05);
    expect(window.location.hash).toBe("#milestones");
    expect(theMedal(completionist), "its row is there when the beat jumps to it").toHaveAttribute("data-step", "next");
    await at(5.5);
    expect(scrolled.mock.contexts).toContain(theMedal(completionist));
    await at(9.0);
    expect(theMedal(completionist)).toHaveAttribute("data-step", "earned");
  });

  it("plays each tier the turn reached as its own beat, one after the other", async () => {
    const fiveTeams: ReachedTier = { milestone: "teams", tier: "silver" };
    visit(familiarFaces, fiveTeams);
    await clickOnFakeTime(await theFirstItem());

    await at(5.5);
    expect(theTitle()).toHaveTextContent("Familiar faces");
    expect(theMedal(fiveTeams)).toHaveAttribute("data-step", "next");
    await at(12.3);
    expect(stage()).toBe("medal");
    expect(theTitle()).toHaveTextContent("Five teams strong");
    expect(theMedal(fiveTeams)).toHaveAttribute("data-step", "next");
    await at(15.7);
    expect(theMedal(fiveTeams)).toHaveAttribute("data-step", "earned");
  });

  it("plays two tiers of one milestone on their own medals, the second in the row the first leaves", async () => {
    const fullOfFriends: ReachedTier = { milestone: "people", tier: "gold" };
    visit(familiarFaces, fullOfFriends);
    await clickOnFakeTime(await theFirstItem());

    await at(9.0);
    expect(theMedal(familiarFaces)).toHaveAttribute("data-step", "earned");
    await at(11.2);
    expect(theMedal(fullOfFriends), "waiting for its beat").toHaveAttribute("data-step", "next");
    await at(12.3);
    expect(stage()).toBe("medal");
    expect(theTitle()).toHaveTextContent("Full of friends");
    await at(15.7);
    expect(theMedal(fullOfFriends)).toHaveAttribute("data-step", "earned");
    expect(theMedal(fullOfFriends)).toHaveClass("al-ms-next");
  });

  it("once the beat ends, moves the medal to Earned and shows its milestone's next tier in Closest medals", async () => {
    visit(familiarFaces);
    await clickOnFakeTime(await theFirstItem());

    await at(9.0);
    expect(theMedal(familiarFaces)).toHaveClass("al-ms-next");
    await at(12.8);
    expect(stage()).toBe("idle");
    expect(theMedal(familiarFaces)).toHaveClass("al-ms-earned");
    expect(theMedal({ milestone: "people", tier: "gold" })).toHaveAttribute("data-step", "next");
  });

  it("adds modest confetti for a gold tier", async () => {
    visit({ milestone: "people", tier: "gold" });
    await clickOnFakeTime(await theFirstItem());

    await at(5.5);
    expect(within(theBurst()!).getByTestId("confetti")).toHaveAttribute("data-size", "modest");
  });

  it("adds the gold confetti for a diamond tier", async () => {
    visit(everyonesAlbum);
    await clickOnFakeTime(await theFirstItem());

    await at(5.5);
    expect(theStage()).toHaveAttribute("data-metal", "diamond");
    expect(theBurst()!.style.getPropertyValue("--burst")).toBe("var(--medal-diamond)");
    expect(within(theBurst()!).getByTestId("confetti")).toHaveAttribute("data-size", "gold");
  });

  it("skips the beat on a click like the rest, showing the medal unlocked and its XP in the bar", async () => {
    visit(paying(familiarFaces, 250));
    await clickOnFakeTime(await theFirstItem());

    await at(5.6);
    await act(async () => fireEvent.pointerDown(document.body));
    expect(stage()).toBe("rest");
    expect(theMedal(familiarFaces)).toHaveAttribute("data-step", "earned");
    expect(theStage()).toBeNull();
    expect(theXpChip()).toBeNull();
    expect(xpWords()).toBe("25 XP to level 7");
  });

  it("under reduced motion shows the medal and its emoji in place with one line, with no flight", async () => {
    preferReducedMotion();
    visit(familiarFaces);
    await clickOnFakeTime(await theFirstItem());

    await at(0.05);
    expect(document.querySelector(".ib-ground")).toBeNull();
    const line = screen.getByRole("note", { name: "Medals unlocked" });
    expect(line).toHaveTextContent("Familiar faces · Silver");
    expect(within(line).getByRole("img", { name: ":familiar-faces:" })).toBeInTheDocument();
    expect(newLabelsOn(line)).toHaveLength(1);
    act(() => {
      window.history.pushState(null, "", "/book#milestones");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(theMedal(familiarFaces)).toHaveAttribute("data-step", "earned");
    expect(newLabelsOn(theMedal(familiarFaces))).toHaveLength(2);
  });
});

describe("LP22: a medal and its emoji unlocked since the last visit carry New", { timeout: 30_000 }, () => {
  it("labels the medal and its emoji unlocked after the last visit, a thoughtful tier by the turn that unlocked it, and nothing unlocked before", async () => {
    const thoughtful: ReachedTier = { milestone: "thoughtful", tier: "bronze" };
    const fromSlack = withTheTier(thoughtful, lastVisit - hourMs, lastVisit + hourMs);
    await onMilestones(fromSlack(reachedAt(familiarFaces, lastVisit + hourMs)({ ...withItems, board: { items: [], more: false }, lastVisit })));

    await waitFor(() => expect(newLabelsOn(theMedal(familiarFaces))).toHaveLength(2));
    expect(newLabelsOn(theMedal(thoughtful))).toHaveLength(2);
    expect(newLabelsOn(theMedal({ milestone: "people", tier: "bronze" }))).toHaveLength(0);
  });

  it("labels no medal while getAlbum answers no last visit, as with hidden-items off", async () => {
    await onMilestones(reachedAt(familiarFaces, lastVisit + hourMs)(albumFixtures.midway));

    expect(newLabelsOn(theMedal(familiarFaces))).toHaveLength(0);
  });
});
