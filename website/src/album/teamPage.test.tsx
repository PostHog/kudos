import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberId } from "../../../convex/workspace/directory";
import { shellFixtures, type Face } from "../shell";
import { drawnPicturesIn } from "../test/pictures";
import { renderAlbum } from "../test/renderApp";
import { fakeSystemTheme, preferReducedMotion, preferWideScreen } from "../test/systemTheme";
import { albumFixtures, fixedAlbum, fixedPeople, fixturePersonOf, fixtureUnlockOf, stickerFor } from "./albumFixtures";
import type { Album, AlbumEmoji, AlbumPet, PersonPage, PersonRead, PutAllInReply, UnlockReply } from "./answer";

const memberWithTheAlbum = shellFixtures.member;

const midway = albumFixtures.midway;

const kettleWorksEmoji: AlbumEmoji = { id: "team:kettle-works", kind: "team", name: "team-kettle-works", from: "Kettle Works", picture: "/emoji/team-kettle-works.png", earned: false, earnedAt: null, seen: false, inSlack: true, progress: { have: 3, need: 3 } };

beforeEach(() => {
  fakeSystemTheme(false);
  preferWideScreen();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Visit = { album?: Album; unlockTeamSticker?: (team: string) => Promise<UnlockReply>; putAllIn?: () => Promise<PutAllInReply>; people?: PersonRead };

function visit(path: string, { album = midway, unlockTeamSticker = async (team) => fixtureUnlockOf(album, team), putAllIn, people = fixedPeople(album) }: Visit = {}) {
  window.history.replaceState(null, "", path);
  const send = vi.fn(unlockTeamSticker);
  const view = renderAlbum(memberWithTheAlbum, fixedAlbum(album), { people, commands: { unlockTeamSticker: send, ...(putAllIn && { putAllIn }) } });
  return { ...view, send };
}

const arrival = { timeout: 10_000 };

async function photo() {
  return within(await screen.findByRole("figure", { name: / team photo$/ }, arrival));
}

async function unlockOnThePhoto(name = "Ready to unlock the Kettle Works sticker") {
  return (await photo()).findByRole("button", { name });
}

async function unlockSays() {
  return within(screen.getByRole("article")).findByRole("status", { name: "Unlocking the sticker" });
}

function withTheTray(album: Album, person: string): Album {
  return { ...album, tray: [stickerFor(`tray-${person}`, person)] };
}

const junoFace = { kind: "slack", image: "https://avatars.slack-edge.com/juno.png", initials: "JP" } as const;

const inesFace = { kind: "company-profile", image: "https://res.cloudinary.com/posthog/ines.png", colour: "#f4c430", initials: "IO" } as const;

function withFaces(album: Album, faces: Record<string, Face>): Album {
  return { ...album, people: album.people.map((person) => ({ ...person, face: faces[person.person] ?? person.face })) };
}

function silhouetteIn(person: HTMLElement) {
  return person.querySelector(".al-silhouette");
}

function pictureShownOf(person: HTMLElement) {
  return person.querySelector("[data-picture]")?.getAttribute("data-picture");
}

describe("AL45: the team page is the team's class photo", () => {
  it("the member's own team page is one mounted photo: collected people by face, the rest as silhouettes, and the unmatched shown and never counted, with no caption repeating their names", async () => {
    visit("/book#teams/lanterns");

    expect(await screen.findByRole("heading", { level: 1, name: "Lanterns" }, arrival)).toBeInTheDocument();
    const shown = await photo();
    expect(shown.getAllByRole("listitem").map((person) => person.textContent)).toEqual([
      "SESam Example You",
      "IOInes Okafor In your album",
      "BTBram Teller In your album",
      "OVOona Vasquez In your album",
      "TRTomas Reyne In your album",
      "JPJuno Park Not in your album yet",
      "HCHal Corwin Not in Slack yet",
    ]);
    expect(shown.getByRole("link", { name: "Juno Park Not in your album yet" })).toHaveAttribute("href", "/book#people/juno-park");
    expect(shown.queryByRole("link", { name: /Hal Corwin/ })).not.toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Lanterns team photo" })).toBeInTheDocument();
    expect(screen.queryByText(/Left to right/)).not.toBeInTheDocument();
  });

  it("the member stands first on their own team's photo, in colour, marked You and linked to their profile and counted among its people", async () => {
    visit("/book#teams/lanterns", { album: withFaces(midway, {}) });

    const shown = await photo();
    const you = shown.getByRole("link", { name: "Sam Example You" });
    expect(you).toHaveAttribute("href", "/book#me");
    expect(pictureShownOf(you)).toBe("colour");
    expect(shown.getByText("You")).not.toHaveClass("sr-only");
    expect(screen.getByText("7 people")).toBeInTheDocument();
  });

  it("the member is not on the photo of a team that isn't theirs", async () => {
    visit("/book#teams/quiet-harbour");

    const shown = await photo();
    expect(shown.queryByText("Sam Example")).not.toBeInTheDocument();
    expect(screen.getByText("2 people")).toBeInTheDocument();
  });

  it("leaves whether someone is in your album to their picture, and says it in words only to a screen reader", async () => {
    visit("/book#teams/lanterns");

    const shown = await photo();
    expect(shown.getByText("Not in your album yet")).toHaveClass("sr-only");
    expect(shown.getAllByText("In your album").every((words) => words.classList.contains("sr-only"))).toBe(true);
    expect(shown.getByText("Not in Slack yet")).not.toHaveClass("sr-only");
  });

  it("someone not in your album yet shows their own picture greyed out, as a locked sticker is, while the collected show theirs in colour and someone not in Slack yet stays a named silhouette", async () => {
    visit("/book#teams/lanterns", { album: withFaces(midway, { "juno-park": junoFace, "ines-okafor": inesFace }) });

    const shown = await photo();
    const juno = shown.getByRole("link", { name: "Juno Park Not in your album yet" });
    expect(drawnPicturesIn(juno)).toEqual([junoFace.image]);
    expect(pictureShownOf(juno)).toBe("grey");
    expect(pictureShownOf(shown.getByRole("link", { name: "Ines Okafor In your album" }))).toBe("colour");
    const hal = shown.getAllByRole("listitem").find((person) => person.textContent?.includes("Hal Corwin"))!;
    expect(drawnPicturesIn(hal)).toEqual([]);
    expect(hal).toHaveTextContent("HCHal Corwin Not in Slack yet");
  });

  it.each([
    { without: "no picture", face: { kind: "initials", initials: "JP" } as const, failsToLoad: false },
    { without: "a picture that fails to load", face: junoFace, failsToLoad: true },
  ])("someone not in your album yet with $without stands as a named silhouette, while a collected person without a picture keeps their initials", async ({ face, failsToLoad }) => {
    visit("/book#teams/lanterns", { album: withFaces(midway, { "juno-park": face, "ines-okafor": { kind: "initials", initials: "IO" } }) });

    const juno = (await photo()).getByRole("link", { name: "Juno Park Not in your album yet" });
    if (failsToLoad) fireEvent.error(juno.querySelector("img")!);

    await waitFor(() => expect(drawnPicturesIn(juno)).toEqual([]));
    expect(silhouetteIn(juno)).toHaveTextContent("JP");
    expect(silhouetteIn((await photo()).getByRole("link", { name: "Ines Okafor In your album" }))).toBeNull();
  });

  it("once their card is put in, the same picture turns from grey to colour", async () => {
    const album = withTheTray(withFaces(midway, { "juno-park": junoFace }), "juno-park");
    const { user } = visit("/book#teams/lanterns", { album, putAllIn: async () => ({ kind: "placed", items: album.tray, more: false }) });
    const picture = (await photo()).getByRole("link", { name: "Juno Park Not in your album yet" }).querySelector("img");
    expect(picture).not.toBeNull();

    await user.click(await screen.findByRole("button", { name: /^Tray/ }));
    await user.click(screen.getByRole("button", { name: /^Put it in/ }));

    const juno = await (await photo()).findByRole("link", { name: "Juno Park In your album" }, { timeout: 5_000 });
    expect(juno.querySelector("img")).toBe(picture);
    expect(pictureShownOf(juno)).toBe("colour");
  });

  it("the seal is ringed by one segment per person to collect, filled for each one in the album", async () => {
    visit("/book#teams/lanterns");

    const seal = await screen.findByRole("img", { name: "Lanterns sticker, 4 of 5" }, arrival);
    expect(seal.querySelectorAll("[data-segment]")).toHaveLength(5);
    expect(seal.querySelectorAll("[data-segment='in']")).toHaveLength(4);
  });

  it("another team's page says it is a team page", async () => {
    visit("/book#teams/tin-orchard");

    expect(await screen.findByRole("heading", { level: 1, name: "Tin Orchard" })).toBeInTheDocument();
    expect(screen.getByText("Team page")).toBeInTheDocument();
  });

  it("a team the album doesn't hold is not found", async () => {
    visit("/book#teams/nowhere-at-all");

    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
  });
});

describe("AL45: a team sticker unlocks only on the member's own click", () => {
  it.each([
    { path: "/book#teams/tin-orchard", state: "collecting" },
    { path: "/book#teams/kettle-works", state: "ready" },
    { path: "/book#teams/quiet-harbour", state: "unlocked" },
  ])("a $state page has no call to action under the photo", async ({ path }) => {
    visit(path);

    await photo();
    const page = screen.getByRole("article");
    expect(within(page).queryByRole("region")).not.toBeInTheDocument();
    expect(within(page).queryByText(/Collect all|Everyone is in|is yours|Unlock your team sticker/)).not.toBeInTheDocument();
  });

  it("the ready sticker itself is the one unlock action: a button on the photo, under its Ready to unlock ribbon", async () => {
    visit("/book#teams/kettle-works");

    const sticker = await unlockOnThePhoto();
    expect(sticker).toHaveTextContent("Ready to unlock");
    expect(sticker).toBeEnabled();
    expect(screen.getAllByRole("button", { name: /Ready to unlock the Kettle Works sticker/ })).toEqual([sticker]);
  });

  it("a sticker still being collected or already unlocked is a picture, never a button", async () => {
    visit("/book#teams/tin-orchard");
    expect(await screen.findByRole("img", { name: /^Tin Orchard sticker, \d+ of \d+$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unlock/ })).not.toBeInTheDocument();
  });

  it("the sticker takes keyboard focus and Enter unlocks it", async () => {
    preferReducedMotion();
    const { user, send } = visit("/book#teams/kettle-works");
    const sticker = await unlockOnThePhoto();

    sticker.focus();
    expect(sticker).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(send).toHaveBeenCalledExactlyOnceWith("kettle-works");
    expect(await screen.findByRole("dialog", { name: "Kettle Works sticker unlocked" })).toBeInTheDocument();
  });

  it("visiting a ready page sends nothing, and one click sends unlockTeamSticker once for that team however often it is pressed", async () => {
    preferReducedMotion();
    let answer: (reply: UnlockReply) => void = () => undefined;
    const { send } = visit("/book#teams/kettle-works", { unlockTeamSticker: () => new Promise((resolve) => (answer = resolve)) });
    const unlock = await unlockOnThePhoto();
    expect(send).not.toHaveBeenCalled();

    await userEvent.click(unlock);
    await userEvent.click(unlock);

    expect(send).toHaveBeenCalledExactlyOnceWith("kettle-works");
    expect(unlock).toHaveAccessibleName("Unlocking…");
    expect(unlock).toHaveAttribute("aria-disabled", "true");
    expect(unlock).toHaveFocus();
    await act(async () => answer(fixtureUnlockOf(midway, "kettle-works")));
    expect(await screen.findByRole("dialog", { name: "Kettle Works sticker unlocked" })).toBeInTheDocument();
  });

  it("a refusal says so under the photo and plays no moment", async () => {
    visit("/book#teams/kettle-works", { unlockTeamSticker: async () => ({ kind: "refused" }) });

    await userEvent.click(await unlockOnThePhoto());

    expect(await unlockSays()).toHaveTextContent("The Kettle Works sticker couldn't be unlocked. Reload the page to see where it stands.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("an unreachable server says so and the sticker stays to try again", async () => {
    visit("/book#teams/kettle-works", { unlockTeamSticker: async () => Promise.reject(new Error("no answer within 10 s")) });

    await userEvent.click(await unlockOnThePhoto());

    expect(await unlockSays()).toHaveTextContent("Couldn't reach HedgeHug. Try again.");
    expect(await unlockOnThePhoto()).not.toHaveAttribute("aria-disabled");
  });

  it("AL54: while Put them all in waits for its answer and while its cards fly in, the sticker says it waits and sends nothing, then comes back once they land", async () => {
    const trayed: Album = { ...midway, tray: [stickerFor("tray-juno", "juno-park"), { item: "tray-banana", kind: "hoggie", hoggie: "banana", rarity: "common", isNew: true }] };
    let answer: (reply: PutAllInReply) => void = () => undefined;
    const { user, send } = visit("/book#teams/kettle-works", { album: trayed, putAllIn: () => new Promise((resolve) => (answer = resolve)) });
    await user.click(await screen.findByRole("button", { name: /^Tray/ }));
    await user.click(screen.getByRole("button", { name: /^Put them all in/ }));

    const waiting = await unlockOnThePhoto("Waiting for your cards to land…");
    expect(waiting).toHaveAttribute("aria-disabled", "true");
    await user.click(waiting);
    await act(async () => answer({ kind: "placed", items: trayed.tray, more: false }));
    await user.click(await unlockOnThePhoto("Waiting for your cards to land…"));
    expect(send).not.toHaveBeenCalled();

    const unlock = await (await photo()).findByRole("button", { name: "Ready to unlock the Kettle Works sticker" }, { timeout: 5_000 });
    expect(unlock).not.toHaveAttribute("aria-disabled");
  });

  it("AL54: while the unlock waits for its answer, the packs button opens nothing, so the moment never lands on a pack", async () => {
    let answer: (reply: UnlockReply) => void = () => undefined;
    const { user } = visit("/book#teams/kettle-works", { unlockTeamSticker: () => new Promise((resolve) => (answer = resolve)) });
    await user.click(await unlockOnThePhoto());

    const [bar] = screen.getAllByRole("banner", { hidden: true });
    expect(bar).toHaveAttribute("inert");
    await act(async () => answer(fixtureUnlockOf(midway, "kettle-works")));
    expect(screen.queryByRole("dialog", { name: "Open your packs" })).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Kettle Works sticker unlocked" })).toBeInTheDocument();
  });

  it("a refusal said under the photo goes once getAlbum reads the page unlocked, as when another tab unlocked it first", async () => {
    const live = { album: midway, listeners: new Set<() => void>() };
    const read = (asking: boolean) => {
      const shown = useSyncExternalStore((listener) => (live.listeners.add(listener), () => live.listeners.delete(listener)), () => live.album);
      return asking ? shown : undefined;
    };
    window.history.replaceState(null, "", "/book#teams/kettle-works");
    renderAlbum(memberWithTheAlbum, read, { people: fixedPeople(midway), commands: { unlockTeamSticker: async () => ({ kind: "refused" }) } });
    await userEvent.click(await unlockOnThePhoto());
    expect(await unlockSays()).toHaveTextContent(/couldn't be unlocked/);

    live.album = { ...midway, teams: midway.teams.map((team) => (team.team === "kettle-works" ? { ...team, state: "unlocked", unlockedAt: Date.parse("2026-10-18T10:00:00Z") } : team)) };
    act(() => live.listeners.forEach((listener) => listener()));

    expect(await unlockSays()).toHaveTextContent("");
  });

  it("dims the page, lifts the sticker, colours it, names it and its team emoji, then flies it back to an unlocked page, in about five seconds", async () => {
    visit("/book#teams/kettle-works", { album: { ...midway, emojis: [...midway.emojis.filter(({ id }) => id !== kettleWorksEmoji.id), kettleWorksEmoji] } });
    const unlock = await unlockOnThePhoto();
    vi.useFakeTimers();
    await act(async () => fireEvent.click(unlock));
    const moment = screen.getByRole("dialog", { name: "Kettle Works sticker unlocked" });

    expect(moment).toHaveAttribute("data-phase", "lift");
    await act(async () => vi.advanceTimersByTime(1000));
    expect(moment).toHaveAttribute("data-phase", "reveal");
    expect(within(moment).queryByText(":team-kettle-works:")).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(2100));
    expect(moment).toHaveAttribute("data-phase", "named");
    expect(within(moment).getByRole("heading", { name: "Kettle Works sticker unlocked" })).toBeInTheDocument();
    expect(within(moment).getByText("18 Oct 2026 · 3 of 3 people collected")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(800));
    expect(moment).toHaveAttribute("data-phase", "emoji");
    expect(within(moment).getByText(":team-kettle-works:")).toBeInTheDocument();
    expect(within(moment).getByText("Your new team emoji. Use it in Slack: react with it and put it in the kudos you give.")).toBeInTheDocument();
    expect(within(moment).getByRole("button", { name: "Put it on the page" })).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(moment).toHaveAttribute("data-phase", "home");
    await act(async () => vi.advanceTimersByTime(820));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Kettle Works sticker, unlocked" })).toBeInTheDocument();
    expect(screen.getByText("Unlocked 18 Oct 2026")).toHaveFocus();
  });

  it("#736: with emoji-mapping-in-place on, a member's unlock moment says the team emoji is coming soon to Slack, with no Slack action", async () => {
    preferReducedMotion();
    visit("/book#teams/kettle-works", { album: { ...midway, emojiWizard: true, emojiInPlace: "member" } });

    await userEvent.click(await unlockOnThePhoto());

    const moment = await screen.findByRole("dialog", { name: "Kettle Works sticker unlocked" });
    expect(within(moment).getByText("Your new team emoji. Coming soon to Slack.")).toBeInTheDocument();
    expect(within(moment).queryByRole("button", { name: /in Slack$|^Add to Slack/ })).not.toBeInTheDocument();
  });

  it("under reduced motion it shows its end state at once: the coloured sticker, its name, its emoji and the way back, with no lift and no confetti", async () => {
    preferReducedMotion();
    visit("/book#teams/kettle-works");

    await userEvent.click(await unlockOnThePhoto());

    const moment = await screen.findByRole("dialog", { name: "Kettle Works sticker unlocked" });
    expect(moment).toHaveAttribute("data-phase", "emoji");
    expect(moment).toHaveAttribute("data-reduced");
    expect(moment.querySelector("[data-confetti]")).toBeNull();
    expect(within(moment).getByText(":team-kettle-works:")).toBeInTheDocument();
    expect(within(moment).getByText("Your new team emoji. Add it to Slack from this page, then react with it and put it in the kudos you give.")).toBeInTheDocument();
    await userEvent.click(within(moment).getByRole("button", { name: "Put it on the page" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("AL54: while it plays nothing else can start: the top bar and the page are inert, so no pack opens over it", async () => {
    preferReducedMotion();
    visit("/book#teams/kettle-works");

    await userEvent.click(await unlockOnThePhoto());
    await screen.findByRole("dialog", { name: "Kettle Works sticker unlocked" });

    const [bar] = screen.getAllByRole("banner", { hidden: true });
    expect(bar).toHaveAttribute("inert");
    expect(screen.getByRole("main", { hidden: true }).closest("[inert]")).not.toBeNull();
  });

  it("the page keeps the unlocked sticker the command answered while getAlbum still says ready", async () => {
    preferReducedMotion();
    visit("/book#teams/kettle-works");

    await userEvent.click(await unlockOnThePhoto());
    await userEvent.click(await screen.findByRole("button", { name: "Put it on the page" }));

    expect(await screen.findByRole("img", { name: "Kettle Works sticker, unlocked" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ready to unlock the Kettle Works sticker" })).not.toBeInTheDocument();
  });
});

describe("AL45: an unlocked page says plainly what the member got", () => {
  it("LP19: with the item board answered, the seal reads Unlocked with its date and team emoji, and no line follows under it", async () => {
    visit("/book#teams/quiet-harbour", { album: { ...midway, board: { items: [], more: false } } });

    expect(await screen.findByRole("img", { name: "Quiet Harbour sticker, unlocked" }, arrival)).toBeInTheDocument();
    expect(screen.getByText("Unlocked 15 Oct 2026").closest("p")).toHaveTextContent(":team-quiet-harbour:");
    expect(screen.queryByText(/You got the/), "the second line under the seal").toBeNull();
  });

  it("while Slack has the team emoji: the gold sticker with its date, and how to use the emoji in Slack", async () => {
    visit("/book#teams/quiet-harbour");

    expect(await screen.findByRole("img", { name: "Quiet Harbour sticker, unlocked" }, arrival)).toBeInTheDocument();
    expect(screen.getByText("Unlocked 15 Oct 2026")).toBeInTheDocument();
    expect(teamEmojiLine()).toHaveTextContent("You got the :team-quiet-harbour: team emoji. Use it in Slack: react with it and put it in the kudos you give.");
    expect(screen.queryByRole("button", { name: /^Add to Slack/ })).not.toBeInTheDocument();
  });

  it("AL30, AL31: while Slack doesn't have it, never says it's usable, and Add to Slack saves its picture as <name>.png and opens the workspace's custom emoji page", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const saved: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      if (this.download !== "") saved.push({ href: this.getAttribute("href") ?? "", download: this.download });
    });
    const { user } = visit("/book#teams/quiet-harbour", { album: withTheTeamEmojiOutOfSlack(midway, "quiet-harbour") });

    expect(await screen.findByText(/team emoji\./, undefined, arrival)).toHaveTextContent("You got the :team-quiet-harbour: team emoji. It isn't in Slack yet: add it, then react with it and put it in the kudos you give.");
    expect(screen.queryByText(/Use it in Slack/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to Slack: :team-quiet-harbour:" }));

    await waitFor(() => expect(saved).toEqual([{ href: "/emoji/team-support.png", download: "team-quiet-harbour.png" }]));
    expect(window.open).toHaveBeenCalledExactlyOnceWith("https://hedgehug.slack.com/customize/emoji", "_blank", "noopener,noreferrer");
  });

  it("AL31: a team picture from another host saves the team emblem, which the browser can download", async () => {
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      if (this.download !== "") saved.push(`${this.getAttribute("href")} as ${this.download}`);
    });
    const outOfSlack = withTheTeamEmojiOutOfSlack(midway, "quiet-harbour");
    const album: Album = { ...outOfSlack, emojis: outOfSlack.emojis.map((emoji) => (emoji.id === "team:quiet-harbour" ? { ...emoji, picture: "https://pictures.example/quiet-harbour.png" } : emoji)) };
    const { user } = visit("/book#teams/quiet-harbour", { album });

    vi.spyOn(window, "open").mockReturnValue(null);
    await user.click(await screen.findByRole("button", { name: "Add to Slack: :team-quiet-harbour:" }, arrival));

    await waitFor(() => expect(saved).toEqual(["/emoji/team.png as team-quiet-harbour.png"]));
  });
});

function teamEmojiLine() {
  return screen.getByText(/team emoji\./);
}

function withTheTeamEmojiOutOfSlack(album: Album, team: string): Album {
  return { ...album, emojis: album.emojis.map((emoji) => (emoji.id === `team:${team}` ? { ...emoji, inSlack: false } : emoji)) };
}

describe("AL74: a team emoji mapped to a Slack emoji", () => {
  const mappedPicture = "https://emoji.slack-edge.com/T1/harbour-hogs/1.png";

  it("shows the Slack emoji's name and picture on the unlocked page", async () => {
    const mapped: AlbumEmoji = { id: "team:quiet-harbour", kind: "team", name: "harbour-hogs", from: "Quiet Harbour", picture: mappedPicture, earned: true, earnedAt: Date.parse("2026-10-15T10:00:00Z"), seen: true, inSlack: true, progress: null };
    visit("/book#teams/quiet-harbour", { album: { ...midway, emojis: [...midway.emojis.filter(({ id }) => id !== "team:quiet-harbour"), mapped] } });

    expect(await screen.findByRole("img", { name: "Quiet Harbour sticker, unlocked" }, arrival)).toBeInTheDocument();
    expect(teamEmojiLine()).toHaveTextContent("You got the :harbour-hogs: team emoji.");
    expect(screen.queryByText(":team-quiet-harbour:")).not.toBeInTheDocument();
    expect(teamEmojiLine().closest(".al-emoji-line")?.querySelector("img")).toHaveAttribute("src", mappedPicture);
  });

  it("names the Slack emoji, not the name stored at the unlock, in the unlock moment", async () => {
    preferReducedMotion();
    visit("/book#teams/kettle-works", { album: { ...midway, emojis: [...midway.emojis.filter(({ id }) => id !== kettleWorksEmoji.id), { ...kettleWorksEmoji, name: "kettle-crew", picture: mappedPicture }] } });
    await userEvent.click(await unlockOnThePhoto());

    const moment = await screen.findByRole("dialog", { name: "Kettle Works sticker unlocked" });
    expect(within(moment).getByText(":kettle-crew:")).toBeInTheDocument();
    expect(within(moment).getByText(":kettle-crew:").closest(".al-unlock-emoji")?.querySelector("img")).toHaveAttribute("src", mappedPicture);
  });
});

describe("AL46: the person page", () => {
  it("shows your history with them, their teams and their hype emoji", async () => {
    visit("/book#people/ines-okafor");

    expect(await screen.findByRole("heading", { level: 1, name: "Ines Okafor" })).toBeInTheDocument();
    const history = within(screen.getByRole("list", { name: "Your history together" }));
    expect(history.getAllByRole("listitem").map((fact) => fact.textContent)).toEqual(["First thanked8 Sept 2026", "Kudos you gave1", "Kudos they gave you0", "Hugs you gave0", "Hugs they gave you2"]);
    expect(screen.getByText(/Thanks for staying late to untangle the migration/)).toBeInTheDocument();
    expect(screen.getByText(/^Your best message to/).closest("figcaption")).toHaveTextContent("Your best message to Ines");
    expect(within(screen.getByRole("list", { name: "Their teams" }))
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Kettle Works3 of 3", "/book#teams/kettle-works"],
      ["Lanterns4 of 5", "/book#teams/lanterns"],
    ]);
    expect(screen.getByText(":ines-okafor-hype:")).toBeInTheDocument();
    expect(screen.getByText("Unlocked by your first kudos to Ines")).toBeInTheDocument();
  });

  it("opens them in Slack in a new tab, from the link getAlbumPerson gives", async () => {
    visit("/book#people/ines-okafor", { people: (asking, person) => (asking && person !== null ? { ...(fixturePersonOf(midway, person) as PersonPage), slackProfile: "https://kudos-test.slack.com/team/U_INES" } : undefined) });

    const inSlack = await screen.findByRole("link", { name: "Open in Slack, Ines's profile (opens in a new tab)" });
    expect(inSlack).toHaveAttribute("href", "https://kudos-test.slack.com/team/U_INES");
    expect(inSlack).toHaveAttribute("target", "_blank");
    expect(inSlack).toHaveAttribute("rel", "noreferrer");
    expect(inSlack).toHaveClass("ph-no-capture");
  });

  it("offers no Open in Slack for them while getAlbumPerson has no Slack link", async () => {
    visit("/book#people/ines-okafor", { people: (asking, person) => (asking && person !== null ? { ...(fixturePersonOf(midway, person) as PersonPage), slackProfile: null } : undefined) });

    expect(await screen.findByRole("heading", { level: 1, name: "Ines Okafor" })).toBeInTheDocument();
    expect(screen.getByRole("article")).not.toHaveTextContent("Ines's profile");
  });

  it("someone not in your album yet stands as a silhouette, with how to collect them and how to unlock their hype emoji", async () => {
    visit("/book#people/juno-park");

    expect(await screen.findByRole("heading", { level: 1, name: "Juno Park" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Not in your album yet" })).toBeInTheDocument();
    expect(screen.getByText("Juno's pack is waiting. Open it from your packs to add Juno to your album.")).toBeInTheDocument();
    expect(screen.getByText("Give Juno a kudos to unlock their hype emoji")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Your history together" })).getByText("Not yet")).toBeInTheDocument();
  });

  it("counts your reactions with their hype emoji on their messages beside the kudos way to unlock it", async () => {
    visit("/book#people/juno-park", { people: personWithHype({ earned: false, name: "juno-park-hype", reactions: { have: 3, need: 10 } }) });

    expect(await screen.findByText("Give Juno a kudos to unlock their hype emoji")).toBeInTheDocument();
    expect(screen.getByText("Or react with it on 10 of their messages: 3 of 10")).toBeInTheDocument();
  });

  it("names your reactions as the way their hype emoji was unlocked", async () => {
    visit("/book#people/juno-park", { people: personWithHype({ earned: true, name: "juno-park-hype", reactions: { have: 10, need: 10 }, byReactions: true }) });

    expect(await screen.findByText("Unlocked by your reactions on 10 of Juno's messages")).toBeInTheDocument();
    expect(screen.queryByText(/Or react with it/)).not.toBeInTheDocument();
  });

  it("someone not in your album yet with a picture shows it greyed out, on their photo and in their hype emoji still to unlock", async () => {
    visit("/book#people/juno-park", { people: (asking, person) => (asking && person !== null ? { ...(fixturePersonOf(midway, person) as PersonPage), face: junoFace } : undefined) });

    const hype = (await screen.findByText(":juno-park-hype:")).closest("div")!;
    const figure = screen.getByRole("figure", { name: "Not in your album yet" });
    expect(drawnPicturesIn(figure)).toEqual([junoFace.image]);
    expect(pictureShownOf(figure)).toBe("grey");
    expect(drawnPicturesIn(hype)).toEqual([junoFace.image]);
    expect(pictureShownOf(hype)).toBe("grey");
  });

  it("a hype emoji earned before the card is put in already shows their face in colour, while their photo stays grey", async () => {
    visit("/book#people/juno-park", { people: (asking, person) => (asking && person !== null ? { ...(fixturePersonOf(midway, person) as PersonPage), face: junoFace, hype: { earned: true, name: "juno-park-hype" } } : undefined) });

    const hype = (await screen.findByText(":juno-park-hype:")).closest("div")!;
    expect(drawnPicturesIn(hype)).toEqual([junoFace.image]);
    expect(pictureShownOf(hype)).toBe("colour");
    expect(pictureShownOf(screen.getByRole("figure", { name: "Not in your album yet" }))).toBe("grey");
  });

  it("someone in the tray, or with nothing waiting, is told the step that adds them", async () => {
    visit("/book#people/juno-park", { album: withTheTray(midway, "juno-park") });
    expect(await screen.findByText("Juno's card is in your tray. Put it in from the top bar.")).toBeInTheDocument();
  });

  it("asks getAlbumPerson for the person in the address only, and a person it doesn't know is not found", async () => {
    const asked: (string | null)[] = [];
    visit("/book#people/nobody-at-all", {
      people: (asking, person) => {
        if (asking) asked.push(person);
        return asking ? { kind: "no-person" } : undefined;
      },
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(new Set(asked)).toEqual(new Set(["nobody-at-all"]));
  });

  it("a team page never asks for a person", async () => {
    const asked: boolean[] = [];
    visit("/book#teams/lanterns", {
      people: (asking) => {
        asked.push(asking);
        return undefined;
      },
    });

    await screen.findByRole("heading", { level: 1, name: "Lanterns" });
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    expect(asked.every((asking) => !asking)).toBe(true);
  });
});

describe("LP58: a member's pet shows in colour beside their sticker on team pages and on their person page", () => {
  const rocket: AlbumPet = { person: "juno-park" as MemberId, hoggie: "rocket", name: "Rocket", rarity: "legendary" };
  const banana: AlbumPet = { person: "ines-okafor" as MemberId, hoggie: "banana", name: "Banana", rarity: "common" };
  const withPets = (...pets: AlbumPet[]): Album => ({ ...midway, pets });

  function petOf(name: string) {
    return screen.getByRole("img", { name });
  }

  it("on a team page each member with a pet has it beside their sticker, in colour even while their sticker is still grey, and the others have none", async () => {
    visit("/book#teams/lanterns", { album: withPets(rocket, banana) });

    const shown = await photo();
    const juno = shown.getAllByRole("listitem").find((person) => person.textContent?.includes("Juno Park"))!;
    expect(within(juno).getByRole("img", { name: "Juno's pet, Rocket" })).toBeInTheDocument();
    expect(drawnPicturesIn(petOf("Juno's pet, Rocket"))).toEqual([expect.stringContaining("rocket")]);
    expect(petOf("Juno's pet, Rocket").querySelector("[data-silhouette]")).toBeNull();
    expect(within(juno).getByRole("link", { name: "Juno Park Not in your album yet" })).toBeInTheDocument();
    expect(shown.getAllByRole("img", { name: /'s pet, / }).map((pet) => pet.getAttribute("aria-label"))).toEqual(["Ines's pet, Banana", "Juno's pet, Rocket"]);
  });

  it("on their own team page the member's pet stands beside them as their pet", async () => {
    const sparky: AlbumPet = { person: "sam-example" as MemberId, hoggie: "rocket", name: "Sparky", rarity: "rare" };
    visit("/book#teams/lanterns", { album: withPets(sparky) });

    const you = (await photo()).getAllByRole("listitem")[0]!;
    expect(within(you).getByRole("img", { name: "Your pet, Sparky" })).toBeInTheDocument();
  });

  it("on a person page their pet stands beside their sticker in colour, named, even before they are in the viewer's album", async () => {
    visit("/book#people/juno-park", { album: withPets(rocket) });

    expect(await screen.findByRole("heading", { level: 1, name: "Juno Park" })).toBeInTheDocument();
    const mount = screen.getByRole("figure", { name: "Not in your album yet" });
    expect(within(mount).getByRole("img", { name: "Juno's pet, Rocket" })).toBeInTheDocument();
    expect(petOf("Juno's pet, Rocket").querySelector("[data-silhouette]")).toBeNull();
    expect(screen.getByText("Pet:").closest("p")).toHaveTextContent("Pet: Rocket");
  });

  it("someone without a pet shows none on their person page", async () => {
    visit("/book#people/ines-okafor", { album: withPets(rocket) });

    expect(await screen.findByRole("heading", { level: 1, name: "Ines Okafor" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /'s pet, / })).not.toBeInTheDocument();
    expect(screen.queryByText("Pet:")).not.toBeInTheDocument();
  });

  it("with pet-hoggie off, getAlbum names no pets and no page shows one", async () => {
    visit("/book#teams/lanterns");

    expect((await photo()).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.queryByRole("img", { name: /'s pet, / })).not.toBeInTheDocument();
  });
});

function personWithHype(hype: PersonPage["hype"]): PersonRead {
  return (asking, person) => (asking && person !== null ? { ...(fixturePersonOf(midway, person) as PersonPage), hype } : undefined);
}
