import { act, fireEvent, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberId } from "../../../convex/workspace/directory";
import { shellFixtures, type TurnReply } from "../shell";
import { renderAlbum } from "../test/renderApp";
import { fakeSystemTheme, preferReducedMotion, preferWideScreen } from "../test/systemTheme";
import { albumFixtures, fixedPeople, fixtureTurnOf } from "./albumFixtures";
import type { Album, AlbumHoggies, AlbumRead, HoggiesRead } from "./answer";
import { hoggiesFixtures } from "./hoggiesFixtures";

const withItems = albumFixtures.withItems;

const firstItem = withItems.board!.items[0]!.item;

const unlockedAt = Date.parse("2026-10-20T10:00:00Z");

const tinOrchard = { team: "tin-orchard", name: "Tin Orchard", art: { kind: "crest" as const, slug: "replay" }, emoji: "team-tin-orchard", at: unlockedAt };

const tinOrchardEmoji = { id: "team:tin-orchard", kind: "team" as const, name: tinOrchard.emoji, from: tinOrchard.name, picture: "/emoji/team-tin-orchard.png", earned: true, earnedAt: unlockedAt, seen: false, inSlack: false, progress: null };

const itemBoardCss = readFileSync(join(__dirname, "itemBoard.css"), "utf8");

const hoggiesCss = readFileSync(join(__dirname, "hoggies.css"), "utf8");

beforeEach(() => {
  fakeSystemTheme(false);
  preferWideScreen();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

function withTheHoggieTurned(album: Album, item: string): Album {
  return { ...album, board: { ...album.board!, items: album.board!.items.filter((waiting) => waiting.item !== item) }, level: { ...album.level, xp: album.level.xp + 15 } };
}

function withTinOrchardFilled(album: Album, item: string): Album {
  return {
    ...album,
    board: { ...album.board!, items: album.board!.items.filter((waiting) => waiting.item !== item) },
    people: album.people.map((someone) => (someone.person === "cass-vey" ? { ...someone, held: true } : someone)),
    teams: album.teams.map((team) => (team.team === "tin-orchard" ? { ...team, held: team.total, state: "unlocked", unlockedAt } : team)),
  };
}

function aStickerTurnOfCassVey(unlocked: Extract<TurnReply, { kind: "turned" }>["unlocked"]): TurnReply {
  const thanked = withItems.people.find(({ person }) => person === "cass-vey")!;
  return { kind: "turned", face: { kind: "sticker", person: "cass-vey" as MemberId, isNew: true, thanked: { name: thanked.name, face: thanked.face } }, applied: null, page: { kind: "team", team: "tin-orchard" }, unlocked, again: false };
}

function theDanceFound(): AlbumHoggies {
  const midway = hoggiesFixtures.midway;
  const before = midway.hoggies.find(({ hoggie }) => hoggie === "70s-dance")!;
  const dance = { ...before, count: 1, found: true, spares: 0, firstAt: Date.parse("2026-10-21T09:00:00Z") };
  return { ...midway, hoggies: midway.hoggies.map((hoggie) => (hoggie.hoggie === "70s-dance" ? dance : { ...hoggie, firstAt: hoggie.firstAt === null ? null : Math.min(hoggie.firstAt, Date.parse("2026-10-01T09:00:00Z")) })), found: before.found ? midway.found : midway.found + 1, rarest: [dance, ...midway.rarest.filter(({ hoggie }) => hoggie !== "70s-dance")].slice(0, 5) };
}

function hoggiesThatAnswerLater(answer: AlbumHoggies) {
  let answered = false;
  const listeners = new Set<() => void>();
  const read: HoggiesRead = (asking) => {
    const shown = useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => answered,
    );
    return asking && shown ? answer : undefined;
  };
  const answers = () => {
    answered = true;
    listeners.forEach((listener) => listener());
  };
  return { read, answers };
}

type Visit = { album?: Album; reply?: (item: string) => Promise<TurnReply>; after?: (album: Album, item: string) => Album; hoggies?: AlbumHoggies; hoggiesRead?: HoggiesRead; render?: typeof renderAlbum };

function visit({ album = withItems, reply = async (item) => fixtureTurnOf(item), after = withTheHoggieTurned, hoggies = theDanceFound(), hoggiesRead = (asking) => (asking ? hoggies : undefined), render = renderAlbum }: Visit = {}) {
  window.history.replaceState(null, "", "/book#me");
  const live = anAlbumThatAnswers(album);
  const turnItem = vi.fn(async (item: string) => {
    const answer = await reply(item);
    if (answer.kind === "turned") live.answerNext(after(live.now(), item));
    return answer;
  });
  const view = render(shellFixtures.member, live.read, { hoggies: hoggiesRead, people: fixedPeople(withItems), commands: { turnItem } });
  return { ...view, turnItem, live };
}

async function anAlbumNotLoadedYet() {
  vi.resetModules();
  const { renderAlbum: renderAfterItLoads } = await import("../test/renderApp");
  return renderAfterItLoads;
}

const arrival = { timeout: 10_000 };

const anUnidentifiedItem = { name: "An unidentified item. Identify it" };

async function theFirstItem() {
  const board = within(await screen.findByRole("dialog", { name: "Your items" }, arrival));
  return board.getAllByRole("button", anUnidentifiedItem)[0]!;
}

function theFirstItemTheMomentItShows() {
  return new Promise<HTMLElement>((resolve) => {
    const watching = new MutationObserver(() => {
      const board = screen.queryByRole("dialog", { name: "Your items" });
      const item = board === null ? undefined : within(board).queryAllByRole("button", anUnidentifiedItem)[0];
      if (item === undefined) return;
      watching.disconnect();
      resolve(item);
    });
    watching.observe(document.body, { subtree: true, childList: true, attributes: true });
  });
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

function ground() {
  return document.querySelector<HTMLElement>(".ib-ground");
}

function stage() {
  return ground()?.dataset.stage ?? "gone";
}

function dark() {
  return ground()?.hasAttribute("data-dark") ?? false;
}

function caption() {
  return document.querySelector<HTMLElement>(".ib-caption");
}

function xpWords() {
  return within(screen.getAllByRole("banner", { hidden: true })[0]!).getByText(/XP to level/, { selector: ".al-xp-words" }).textContent;
}

function thePlate() {
  return document.querySelector<HTMLElement>('[data-hoggie="70s-dance"]');
}

function tinOrchardInTheSidebar() {
  return within(screen.getByRole("navigation", { name: "Album" })).getByRole("link", { name: /Tin Orchard/ });
}

function sidebarLinkTo(team: string) {
  return within(screen.getByRole("navigation", { name: "Album" })).getByRole("link", { name: new RegExp(team) });
}

function earnedInTheTopBar() {
  const [bar] = screen.getAllByRole("banner", { hidden: true });
  const label = within(bar!).getByRole("button", { name: /^Your emojis, \d+ earned/, hidden: true }).getAttribute("aria-label")!;
  return Number(/(\d+) earned/.exec(label)![1]);
}

function theEmojiInTheAir() {
  return document.querySelector<HTMLElement>(".ib-emoji");
}

function theSpotOfCassVey() {
  return screen.getByText("Cass Vey", { selector: ".al-photo-name" }).closest("li");
}

function placeTheSealInView() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rectOf(this: Element) {
    return this.matches(".al-seal-spot, [data-al-seal]") ? new DOMRect(400, 300, 160, 130) : new DOMRect(0, 0, 0, 0);
  });
}

describe("LP18 LP19 LP21: the Page-first turn sequence at 0.8×", { timeout: 30_000 }, () => {
  it("lands a hoggie's stages at LP18's times: the page at 0.36 s, the turn at 0.76 s, the hold at 1.7 s, the fade from 2.5 to 2.8 s, the drop at 3.1 s and the board back at 5.3 s", async () => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    const { turnItem } = visit();
    await clickOnFakeTime(await theFirstItem());

    await at(0.26);
    expect(window.location.hash).toBe("#me");
    expect(dark(), "the page cross-fades from 0.03 s").toBe(true);
    await at(0.46);
    expect(window.location.hash).toBe("#hoggies");
    expect(dark(), "the page shows at 0.36 s").toBe(false);

    await at(0.66);
    expect(stage()).toBe("lift");
    await at(0.86);
    expect(stage()).toBe("turn");

    await at(1.6);
    expect(caption()).toBeNull();
    await at(1.8);
    expect(stage()).toBe("hold");
    expect(caption()).toHaveTextContent("70's DanceRare hoggie · New");

    await at(2.4);
    expect(dark()).toBe(false);
    await at(2.6);
    expect(dark(), "the fade to the slot").toBe(true);
    expect(scrolled.mock.contexts).not.toContain(thePlate());
    await at(2.9);
    expect(scrolled.mock.contexts).toContain(thePlate());
    expect(scrolled).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "instant" }));
    expect(dark()).toBe(false);

    await at(3.0);
    expect(stage()).toBe("hold");
    await at(3.2);
    expect(stage()).toBe("land");

    await at(5.2);
    expect(stage()).not.toBe("back");
    await at(5.4);
    expect(stage()).toBe("back");
    await at(5.9);
    expect(stage()).toBe("idle");
    expect(screen.getByRole("heading", { name: "2 unidentified items wait" })).toBeVisible();
    expect(turnItem).toHaveBeenCalledTimes(1);
  });

  it("keeps LP18's times for an item turned the moment the album first shows its board, before the album's first effects have run", async () => {
    visit({ render: await anAlbumNotLoadedYet() });
    await clickOnFakeTime(await theFirstItemTheMomentItShows());

    await at(0.26);
    expect(window.location.hash).toBe("#me");
    expect(dark()).toBe(true);
    await at(0.46);
    expect(window.location.hash).toBe("#hoggies");
    await at(1.8);
    expect(stage()).toBe("hold");
  });

  it("keeps the hoggie off the page until it lands: the top of Hoggies names no new find and its plate waits empty and unmarked", async () => {
    visit();
    await clickOnFakeTime(await theFirstItem());

    await at(0.46);
    const main = within(screen.getByRole("main"));
    expect(main.queryByText("70's Dance")).toBeNull();
    expect(thePlate()).toHaveTextContent("Not found yet");
    expect(thePlate()).toHaveAttribute("data-arriving");
    expect(hoggiesCss).toMatch(/\.al-hoggies-plate\[data-landed\]:not\(\[data-arriving\]\) \{\s*outline:/);

    await at(4.1);
    expect(thePlate()).toHaveTextContent("70's Dance");
    expect(thePlate()).toHaveAttribute("data-landed");
    expect(thePlate()).not.toHaveAttribute("data-arriving");
  });

  it("flies the +15 XP chip to the bar during the hold, and the bar moves only once it lands", async () => {
    visit();
    await clickOnFakeTime(await theFirstItem());

    await at(2.0);
    expect(xpWords()).toBe("290 XP to level 7");
    expect(screen.getByText("+15 XP", { selector: ".ib-chip" })).toBeInTheDocument();
    await at(3.1);
    expect(xpWords()).toBe("275 XP to level 7");
    expect(document.querySelector(".ib-chip")).toBeNull();
  });

  it("lands a sticker that fills its team, then unlocks the team sticker as the follow-up: a gold burst, the seal colours, Unlocked with its date, its emoji and New, and the board back after about 8.8 s", async () => {
    placeTheSealInView();
    visit({ reply: async () => aStickerTurnOfCassVey({ teamStickers: [tinOrchard], hype: null, milestones: [] }), after: withTinOrchardFilled });
    await clickOnFakeTime(await theFirstItem());

    await at(0.46);
    expect(window.location.hash).toBe("#teams/tin-orchard");
    expect(screen.getByRole("img", { name: "Tin Orchard sticker, 2 of 3" })).toBeInTheDocument();
    await at(1.8);
    expect(caption()).toHaveTextContent("Cass VeySticker · New");
    expect(within(tinOrchardInTheSidebar()).getByRole("img", { name: "2 of 3" })).toBeInTheDocument();

    await at(4.1);
    expect(screen.getByRole("img", { name: "Tin Orchard sticker, 3 of 3" })).toBeInTheDocument();
    expect(screen.queryByText(/^Unlocked /)).toBeNull();
    expect(document.querySelector(".ib-flourish")).toBeNull();

    await at(4.8);
    expect(stage()).toBe("unlock");
    expect(screen.getByRole("img", { name: "Tin Orchard sticker, unlocked" })).toBeInTheDocument();
    expect(document.querySelector(".ib-flourish")).not.toBeNull();
    const tag = screen.getByText(/^Unlocked /).closest("p")!;
    expect(tag).toHaveTextContent("Unlocked 20 Oct");
    expect(tag).toHaveTextContent(":team-tin-orchard:");
    expect(tag).toHaveTextContent("New");
    expect(within(tinOrchardInTheSidebar()).getByRole("img", { name: "Unlocked" })).toBeInTheDocument();

    await at(7.2);
    expect(stage()).toBe("unlock");
    await at(8.2);
    expect(stage()).toBe("rest");
    await at(8.4);
    expect(stage()).toBe("back");
    await at(8.9);
    expect(stage()).toBe("idle");
  });

  it("springs the team emoji out of the seal as it stamps in, holds it, then flies it into the emoji button, which counts it and marks it seen only as it lands", async () => {
    placeTheSealInView();
    const { actions } = visit({ reply: async () => aStickerTurnOfCassVey({ teamStickers: [tinOrchard], hype: null, milestones: [] }), after: (album, item) => ({ ...withTinOrchardFilled(album, item), emojis: [...album.emojis, tinOrchardEmoji] }) });
    const item = await theFirstItem();
    const before = earnedInTheTopBar();
    await clickOnFakeTime(item);

    await at(4.8);
    expect(stage()).toBe("unlock");
    expect(theEmojiInTheAir(), "while the seal pops").toBeNull();
    await at(5.9);
    expect(theEmojiInTheAir()).toHaveTextContent(":team-tin-orchard:");
    expect(screen.getByRole("status", { name: "Identifying" })).toHaveTextContent(":team-tin-orchard: emoji unlocked");
    expect(earnedInTheTopBar(), "while the emoji is out").toBe(before);
    expect(actions.markEmojisSeen).not.toHaveBeenCalled();

    await at(7.3);
    expect(theEmojiInTheAir()).toBeNull();
    expect(earnedInTheTopBar(), "once it lands in the emoji button").toBe(before + 1);
    expect(actions.markEmojisSeen).toHaveBeenCalledWith(["team:tin-orchard"]);
    await at(10);
    expect(stage()).toBe("idle");
    expect(screen.queryByRole("dialog", { name: /emoji/i }), "the flight was its moment").toBeNull();
    expect(actions.markEmojisSeen).toHaveBeenCalledTimes(1);
  });

  it("unlocks each team a sticker filled on its own page: the first team's beat leaves the second still locked, then the sequence fades to the second team's page for its own beat", async () => {
    placeTheSealInView();
    const sableQuay = { team: "sable-quay", name: "Sable Quay", art: { kind: "crest" as const, slug: "growth" }, mine: false, people: ["sable-ford", "cass-vey"], unmatched: [], held: 1, total: 2, state: "progress" as const, unlockedAt: null };
    const unlockedSableQuay = { team: "sable-quay", name: "Sable Quay", art: sableQuay.art, emoji: "team-sable-quay", at: unlockedAt };
    const bothFilled = (album: Album, item: string) => {
      const filled = withTinOrchardFilled(album, item);
      return { ...filled, teams: filled.teams.map((team) => (team.team === "sable-quay" ? { ...team, held: 2, state: "unlocked" as const, unlockedAt } : team)) };
    };
    visit({ album: { ...withItems, teams: [...withItems.teams, sableQuay] }, reply: async () => aStickerTurnOfCassVey({ teamStickers: [tinOrchard, unlockedSableQuay], hype: null, milestones: [] }), after: bothFilled });
    await clickOnFakeTime(await theFirstItem());

    await at(4.8);
    expect(window.location.hash).toBe("#teams/tin-orchard");
    expect(stage()).toBe("unlock");
    expect(screen.getByRole("img", { name: "Tin Orchard sticker, unlocked" })).toBeInTheDocument();
    expect(within(sidebarLinkTo("Sable Quay")).getByRole("img", { name: "2 of 2" }), "the second team, filled but still locked, during the first team's beat").toBeInTheDocument();

    await at(9.0);
    expect(window.location.hash, "the second team's beat plays on its own page").toBe("#teams/sable-quay");
    expect(stage()).toBe("unlock");
    expect(screen.getByRole("img", { name: "Sable Quay sticker, unlocked" })).toBeInTheDocument();
    expect(document.querySelector(".ib-flourish"), "the second team's gold burst").not.toBeNull();
    expect(within(sidebarLinkTo("Sable Quay")).getByRole("img", { name: "Unlocked" })).toBeInTheDocument();
  });

  it("pops the thanked person's hype emoji in beside their sticker only once it lands", async () => {
    const hype = { name: "cass-vey-hype", picture: "/emoji/hype-cass.png", inSlack: false, from: "Cass Vey" };
    visit({ reply: async () => aStickerTurnOfCassVey({ teamStickers: [], hype, milestones: [] }), after: (album, item) => ({ ...withTinOrchardFilled(album, item), teams: album.teams }) });
    await clickOnFakeTime(await theFirstItem());

    await at(1.8);
    expect(screen.queryByRole("img", { name: ":cass-vey-hype: hype emoji unlocked" })).toBeNull();
    await at(4.1);
    expect(screen.getByRole("img", { name: ":cass-vey-hype: hype emoji unlocked" })).toBeInTheDocument();
  });

  it("counts each emoji the turn brings in the top bar only as it lands in the emoji button: the hype out of the sticker first, then the team emoji out of the seal", async () => {
    placeTheSealInView();
    const hype = { name: "cass-vey-hype", picture: "/emoji/hype-cass.png", inSlack: false, from: "Cass Vey" };
    const withTheirEmojis = (album: Album, item: string): Album => ({
      ...withTinOrchardFilled(album, item),
      emojis: [...album.emojis, { ...tinOrchardEmoji, id: "hype:cass-vey", kind: "hype", name: hype.name, from: hype.from, picture: hype.picture }, tinOrchardEmoji],
    });
    visit({ reply: async () => aStickerTurnOfCassVey({ teamStickers: [tinOrchard], hype, milestones: [] }), after: withTheirEmojis });
    const item = await theFirstItem();
    const before = earnedInTheTopBar();
    await clickOnFakeTime(item);

    await at(1.8);
    expect(earnedInTheTopBar(), "while the sticker holds").toBe(before);
    await at(4.1);
    expect(earnedInTheTopBar(), "as the sticker lands").toBe(before);
    await at(4.6);
    expect(theEmojiInTheAir(), "the hype springs out").toHaveTextContent(":cass-vey-hype:");
    expect(earnedInTheTopBar(), "while the hype is out").toBe(before);
    await at(6.0);
    expect(earnedInTheTopBar(), "once the hype lands").toBe(before + 1);
    await at(6.6);
    expect(stage()).toBe("unlock");
    expect(earnedInTheTopBar(), "while the seal pops").toBe(before + 1);
    await at(8.0);
    expect(theEmojiInTheAir(), "the team emoji springs out").toHaveTextContent(":team-tin-orchard:");
    expect(earnedInTheTopBar(), "while the team emoji is out").toBe(before + 1);
    await at(9.0);
    expect(earnedInTheTopBar(), "once the team emoji lands").toBe(before + 2);
  });

  it("springs the hype emoji a hoggie's turn unlocks, when the person's sticker is already in the album, and counts it as it lands", async () => {
    const hype = { name: "cass-vey-hype", picture: "/emoji/hype-cass.png", inSlack: false, from: "Cass Vey" };
    const hypeEmoji = { ...tinOrchardEmoji, id: "hype:cass-vey", kind: "hype" as const, name: hype.name, from: hype.from, picture: hype.picture };
    const aHoggieTurnWithHype = async (item: string): Promise<TurnReply> => {
      const turned = await fixtureTurnOf(item);
      return turned.kind === "turned" ? { ...turned, unlocked: { teamStickers: [], hype, milestones: [] } } : turned;
    };
    visit({ reply: aHoggieTurnWithHype, after: (album, item) => ({ ...withTheHoggieTurned(album, item), emojis: [...album.emojis, hypeEmoji] }) });
    const item = await theFirstItem();
    const before = earnedInTheTopBar();
    await clickOnFakeTime(item);

    await at(4.0);
    expect(theEmojiInTheAir(), "while the hoggie lands").toBeNull();
    await at(4.6);
    expect(theEmojiInTheAir(), "the hype springs out").toHaveTextContent(":cass-vey-hype:");
    expect(earnedInTheTopBar(), "while the hype is out").toBe(before);
    await at(6.0);
    expect(earnedInTheTopBar(), "once the hype lands").toBe(before + 1);
  });

  it("keeps New off a sticker's spot on its page until the sticker lands", async () => {
    const lastVisit = Date.parse("2026-10-19T10:00:00Z");
    const putIn = (album: Album, item: string) => {
      const filled = withTinOrchardFilled(album, item);
      return { ...filled, teams: album.teams, people: filled.people.map((someone) => (someone.person === "cass-vey" ? { ...someone, at: unlockedAt } : someone)) };
    };
    visit({ album: { ...withItems, lastVisit }, reply: async () => aStickerTurnOfCassVey({ teamStickers: [], hype: null, milestones: [] }), after: putIn });
    await clickOnFakeTime(await theFirstItem());

    await at(1.8);
    expect(theSpotOfCassVey()).toHaveTextContent("Not in your album yet");
    expect(theSpotOfCassVey()).not.toHaveTextContent("New");
    await at(4.1);
    expect(theSpotOfCassVey()).toHaveTextContent("In your album");
    expect(theSpotOfCassVey()).toHaveTextContent("New");
  });

  it("drops a sticker into its spot on a team page still locked behind book-next, instead of landing it without the flight", async () => {
    const putIn = (album: Album, item: string) => ({ ...withTinOrchardFilled(album, item), teams: album.teams });
    visit({ album: { ...withItems, bookNext: { chatUrl: "https://app.slack.com/client/T1", rarityCaps: true } }, reply: async () => aStickerTurnOfCassVey({ teamStickers: [], hype: null, milestones: [] }), after: putIn });
    await clickOnFakeTime(await theFirstItem());

    await at(1.8);
    expect(window.location.hash).toBe("#teams/tin-orchard");
    expect(theSpotOfCassVey()).toHaveAttribute("data-landed");
    expect(theSpotOfCassVey()).toHaveAttribute("data-arriving");
    await at(3.2);
    expect(stage()).toBe("land");
    await at(4.1);
    expect(theSpotOfCassVey()).not.toHaveAttribute("data-arriving");
    expect(theSpotOfCassVey()).toHaveTextContent("In your album");
  });

  it.each([
    ["a second click", () => fireEvent.pointerDown(document.body)],
    ["Enter", () => fireEvent.keyDown(window, { key: "Enter" })],
    ["Space", () => fireEvent.keyDown(window, { key: " " })],
    ["Esc", () => fireEvent.keyDown(window, { key: "Escape" })],
  ])("jumps the running item into its slot on %s, without sending the turn twice, and rests before the board comes back", async (_, skip) => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    const { turnItem } = visit();
    const item = await theFirstItem();
    await clickOnFakeTime(item);

    await at(1.0);
    await act(async () => skip());
    expect(stage()).toBe("rest");
    expect(thePlate()).toHaveAttribute("data-landed");
    expect(thePlate()).toHaveTextContent("70's Dance");
    expect(scrolled.mock.contexts).toContain(thePlate());
    expect(xpWords()).toBe("275 XP to level 7");
    await act(async () => fireEvent.click(item));
    expect(turnItem).toHaveBeenCalledTimes(1);

    await at(2.1);
    expect(stage()).toBe("back");
    await at(2.6);
    expect(stage()).toBe("idle");
    expect(screen.getByRole("dialog", { name: "Your items" })).toBeInTheDocument();
  });

  it("waits for the turn's answer when skipped before it comes, then lands at once", async () => {
    let answer: (reply: TurnReply) => void = () => undefined;
    const { turnItem } = visit({ reply: () => new Promise((resolve) => (answer = resolve)) });
    await clickOnFakeTime(await theFirstItem());

    await at(0.2);
    await act(async () => fireEvent.pointerDown(document.body));
    await at(1.0);
    expect(window.location.hash).toBe("#me");
    await act(async () => answer(fixtureTurnOf(firstItem)));
    expect(stage()).toBe("rest");
    expect(window.location.hash).toBe("#hoggies");
    expect(thePlate()).toHaveAttribute("data-landed");
    expect(turnItem).toHaveBeenCalledTimes(1);
  });

  it("holds the turned item while its page still loads, then fades to the slot and drops into it once the page shows", async () => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    const page = hoggiesThatAnswerLater(theDanceFound());
    visit({ hoggiesRead: page.read });
    await clickOnFakeTime(await theFirstItem());

    await at(3.4);
    expect(window.location.hash).toBe("#hoggies");
    expect(stage()).toBe("hold");
    expect(dark()).toBe(false);
    expect(thePlate()).toBeNull();

    await act(async () => page.answers());
    await at(4.0);
    expect(scrolled.mock.contexts).toContain(thePlate());
    await at(4.4);
    expect(stage()).toBe("land");
    await at(7.0);
    expect(stage()).toBe("idle");
    expect(thePlate()).toHaveAttribute("data-landed");
  });

  it("lands the item without the flight when its page has not shown within two seconds of the hold, and brings the slot into view once it does", async () => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    const page = hoggiesThatAnswerLater(theDanceFound());
    visit({ hoggiesRead: page.read });
    await clickOnFakeTime(await theFirstItem());

    await at(4.8);
    expect(ground()).toBeNull();
    expect(screen.getByRole("status", { name: "Identified" })).toHaveTextContent("70's Dance: Rare hoggie · New");
    expect(screen.getByRole("button", { name: "2 unidentified items wait" })).toBeVisible();

    await act(async () => page.answers());
    await at(5.0);
    expect(thePlate()).toHaveAttribute("data-landed");
    expect(thePlate()).not.toHaveAttribute("data-arriving");
    expect(scrolled.mock.contexts).toContain(thePlate());
  });

  it.each([
    ["the turn", 1.0, "turn"],
    ["the hold", 2.6, "hold"],
  ])("lands the item without the flight when skipped during %s while its page still loads, and brings the slot into view once the page shows", async (_, skippedAt, skippedStage) => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    const page = hoggiesThatAnswerLater(theDanceFound());
    visit({ hoggiesRead: page.read });
    await clickOnFakeTime(await theFirstItem());

    await at(skippedAt);
    expect(stage()).toBe(skippedStage);
    await act(async () => fireEvent.pointerDown(document.body));
    expect(ground()).toBeNull();
    expect(screen.getByRole("status", { name: "Identified" })).toHaveTextContent("70's Dance: Rare hoggie · New");

    await act(async () => page.answers());
    await at(skippedAt + 0.2);
    expect(thePlate()).toHaveAttribute("data-landed");
    expect(thePlate()).not.toHaveAttribute("data-arriving");
    expect(scrolled.mock.contexts).toContain(thePlate());
  });

  it("leaves no timer behind when the album goes mid-flight", async () => {
    const { unmount } = visit();
    await clickOnFakeTime(await theFirstItem());
    await at(1.8);
    expect(stage()).toBe("hold");

    unmount();
    await act(() => Promise.resolve());

    expect(vi.getTimerCount()).toBe(0);
  });

  it("marks no emoji seen when the album goes before the emoji reached the emoji button, so its moment still waits", async () => {
    placeTheSealInView();
    const { unmount, actions } = visit({ reply: async () => aStickerTurnOfCassVey({ teamStickers: [tinOrchard], hype: null, milestones: [] }), after: (album, item) => ({ ...withTinOrchardFilled(album, item), emojis: [...album.emojis, tinOrchardEmoji] }) });
    await clickOnFakeTime(await theFirstItem());
    await at(4.8);
    expect(stage()).toBe("unlock");

    unmount();
    await act(() => Promise.resolve());
    await act(() => Promise.resolve());

    expect(actions.markEmojisSeen).not.toHaveBeenCalled();
  });

  it("brings the board back with the trouble said when the turn is refused mid-flight", async () => {
    visit({ reply: async () => ({ kind: "refused" }) });
    await clickOnFakeTime(await theFirstItem());

    await at(0.5);
    expect(stage()).toBe("idle");
    expect(window.location.hash).toBe("#me");
    expect(within(screen.getByRole("dialog", { name: "Your items" })).getByRole("alert")).toHaveTextContent("That item couldn't be identified. Try again.");
  });

  it("closes the board after the rest when the last item has turned", async () => {
    const single = { ...withItems, board: { ...withItems.board!, items: withItems.board!.items.slice(0, 1) } };
    window.history.replaceState(null, "", "/book#me");
    const live = anAlbumThatAnswers(single);
    const turnItem = vi.fn(async (item: string) => {
      live.answerNext(withTheHoggieTurned(live.now(), item));
      return fixtureTurnOf(item);
    });
    const found = theDanceFound();
    renderAlbum(shellFixtures.member, live.read, { hoggies: (asking) => (asking ? found : undefined), commands: { turnItem } });
    await clickOnFakeTime(await theFirstItem());

    await at(4.1);
    expect(stage()).toBe("land");
    expect(screen.getByRole("status", { name: "Identified" })).not.toHaveTextContent("70's Dance");
    await at(5.4);
    expect(ground()).toBeNull();
    expect(screen.getByRole("status", { name: "Identified" })).toHaveTextContent("70's Dance: Rare hoggie · New");
  });

  it("never changes the page or says where an item goes on hover, and the pointer that taps the first item goes once the member hovers", async () => {
    const { user, turnItem } = visit();
    const item = await theFirstItem();
    const dialog = screen.getByRole("dialog", { name: "Your items" });
    const words = dialog.textContent;
    expect(item.closest("li")!.querySelector(".ib-pointer")).not.toBeNull();

    await user.hover(item);

    expect(window.location.hash).toBe("#me");
    expect(dialog.textContent).toBe(words);
    expect(turnItem).not.toHaveBeenCalled();
    expect(document.querySelector(".ib-pointer")).toBeNull();
  });

  it("runs the same flow on a phone, with 72 px items", async () => {
    window.matchMedia = ((query: string) => ({ media: query, matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    visit();
    await clickOnFakeTime(await theFirstItem());

    await at(0.86);
    expect(stage()).toBe("turn");
    await at(3.2);
    expect(stage()).toBe("land");
    await at(5.9);
    expect(stage()).toBe("idle");
    expect(itemBoardCss, "every item on a phone is 72 px, whatever its size on a wide screen").toMatch(/@media \(max-width: 40rem\) \{\s*\.ib-slot \{\s*width: 4\.5rem;\s*height: 4\.5rem;/);
  });

  it("keeps the plain path under reduced motion: a click puts the item in place at once and says what it was, with no flight", async () => {
    preferReducedMotion();
    visit();
    await clickOnFakeTime(await theFirstItem());

    await at(0.05);
    expect(ground()).toBeNull();
    expect(document.querySelector(".ib-flyer")).toBeNull();
    expect(window.location.hash).toBe("#hoggies");
    expect(screen.getByRole("status", { name: "Identified" })).toHaveTextContent("70's Dance: Rare hoggie · New+15 XP");
    expect(xpWords()).toBe("275 XP to level 7");
  });

  it("holds a level the turn's XP crosses until the chip lands, and plays the level's emoji moment only once the board is back", async () => {
    const levelSeven = { ...withItems.emojis.find(({ id }) => id === "level:10")!, id: "level:7", name: "level-7", from: "Level 7", earned: true, seen: false, progress: null };
    const crossing = (album: Album, item: string): Album => ({ ...withTheHoggieTurned(album, item), level: { level: 7, xp: 1505, startsAt: 1500, nextAt: 2100 }, emojis: [...album.emojis, levelSeven] });
    visit({ after: crossing });
    await clickOnFakeTime(await theFirstItem());

    await at(2.0);
    expect(xpWords()).toBe("290 XP to level 7");
    await at(3.1);
    expect(xpWords()).toBe("595 XP to level 8");
    await at(5.0);
    expect(screen.queryByRole("dialog", { name: /emoji/i })).toBeNull();
    expect(stage()).toBe("rest");
    await at(7.0);
    expect(screen.getByRole("dialog", { name: /emoji/i })).toBeInTheDocument();
  });
});
