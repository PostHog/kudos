import { act, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmojiInPlace } from "../../../convex/album/emojiWizard";
import type { SlackEmojiMatchesRead } from "../emojiWizardReads";
import { fixedSettings, settingsFixtures } from "../settingsFixtures";
import { shellFixtures } from "../shell";
import { anAlbumThatAnswers } from "../test/albumThatAnswers";
import { renderAlbum } from "../test/renderApp";
import { fakeSystemTheme, preferReducedMotion, preferWideScreen } from "../test/systemTheme";
import { albumFixtures, fixedAlbum } from "./albumFixtures";
import type { Album, AlbumEmoji, AlbumRead, KudosEmojiPickReply, PickKudosEmoji } from "./answer";

const day = 24 * 60 * 60 * 1_000;

const kudosEmoji = { kudosEmoji: "hedgehog", kudosEmojiImage: "https://emoji.slack-edge.com/T1/hedgehog/1.png" };

const raisedHands = "https://a.slack-edge.com/production-standard-emoji-assets/15.0/apple-large/1f64c.png";

const noMatches: SlackEmojiMatchesRead = () => ({ kind: "matches", matches: [] });

beforeEach(() => {
  fakeSystemTheme(false);
  preferWideScreen();
  vi.spyOn(window, "open").mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function anEmoji(emoji: Partial<AlbumEmoji> & Pick<AlbumEmoji, "id" | "kind" | "name" | "from">): AlbumEmoji {
  return { picture: `/emoji/${emoji.id.replace(":", "-")}.png`, earned: false, earnedAt: null, seen: true, inSlack: false, progress: { have: 0, need: 3 }, ...emoji };
}

function held(emoji: Partial<AlbumEmoji> & Pick<AlbumEmoji, "id" | "kind" | "name" | "from">): AlbumEmoji {
  return anEmoji({ earned: true, progress: null, ...emoji });
}

const levelTwoLocked = anEmoji({ id: "level:2", kind: "level", name: "raised_hands", from: "Level 2", picture: raisedHands, inSlack: true, progress: { have: 0, need: 20 } });

const levelTwoHeld = held({ id: "level:2", kind: "level", name: "raised_hands", from: "Level 2", picture: raisedHands, inSlack: true });

const newcomer: Album = { ...albumFixtures.newcomer, level: { level: 1, xp: 0, startsAt: 0, nextAt: 20 }, emojis: [levelTwoLocked, ...albumFixtures.newcomer.emojis], emojiHowTo: kudosEmoji };

const atLevelTwo: Album = {
  ...albumFixtures.midway,
  emojiHowTo: kudosEmoji,
  emojis: [
    held({ id: "level:5", kind: "level", name: "level-5", from: "Level 5" }),
    levelTwoHeld,
    held({ id: "hype:ines-okafor", kind: "hype", name: "ines-okafor-hype", from: "Ines Okafor", picture: "/emoji/hype.png", earnedAt: Date.now() - 9 * day }),
    held({ id: "team:quiet-harbour", kind: "team", name: "team-quiet-harbour", from: "Quiet Harbour", earnedAt: Date.now() - 3 * day, inSlack: true }),
    anEmoji({ id: "team:copper-kite", kind: "team", name: "team-copper-kite", from: "Copper Kite", progress: { have: 0, need: 3 } }),
    anEmoji({ id: "level:10", kind: "level", name: "level-10", from: "Level 10", progress: { have: 1210, need: 4500 } }),
    anEmoji({ id: "milestone:people:bronze", kind: "milestone", name: "bronze-people", from: "People", progress: { have: 1, need: 4 } }),
    anEmoji({ id: "team:lanterns", kind: "team", name: "team-lanterns", from: "Lanterns", progress: { have: 4, need: 5 } }),
  ],
};

type Visit = { album: Album; wizard?: boolean; inPlace?: EmojiInPlace; pickKudosEmoji?: PickKudosEmoji; read?: AlbumRead };

function visit({ album, wizard = false, inPlace = null, pickKudosEmoji, read = fixedAlbum({ ...album, emojiWizard: wizard, emojiInPlace: inPlace }) }: Visit) {
  window.history.replaceState(null, "", "/");
  return renderAlbum(shellFixtures.member, read, { settings: fixedSettings(settingsFixtures.forTheMaintainer), slackEmojiMatches: noMatches, commands: pickKudosEmoji === undefined ? {} : { pickKudosEmoji } });
}

async function theEmojiButton() {
  const [bar] = await screen.findAllByRole("banner", {}, { timeout: 5_000 });
  return within(bar!).getByRole("button", { name: /^Your emojis/ });
}

async function openTheEmojis(view: ReturnType<typeof visit>) {
  await view.user.click(await theEmojiButton());
  return within(screen.getByRole("region", { name: "Your emojis" }));
}

function section(popup: ReturnType<typeof within>, title: string) {
  return within(popup.getByRole("region", { name: title }));
}

function rowsIn(region: ReturnType<typeof within>): string[] {
  return region.queryAllByRole("listitem").map((row: HTMLElement) => row.textContent ?? "");
}

function namesIn(region: ReturnType<typeof within>): (string | undefined)[] {
  return rowsIn(region).map((row) => row.match(/:[a-z0-9_-]+:/)?.[0]);
}

describe("the emoji popup leads with the earned emojis the member picks to count in their kudos", () => {
  const firstThankYou = held({ id: "milestone:thoughtful:bronze", kind: "milestone", name: "love-hog", from: "First thank-you" });
  const withFirstThankYou: Album = { ...atLevelTwo, emojis: [...atLevelTwo.emojis, firstThankYou] };

  function picksIn(popup: ReturnType<typeof within>) {
    return within(popup.getByRole("region", { name: /^Count in kudos/ }));
  }

  function pressedIn(picks: ReturnType<typeof within>) {
    return picks.getAllByRole("button").map((button: HTMLElement) => `${button.querySelector("code")?.textContent} ${button.getAttribute("aria-pressed")}`);
  }

  it("lists each earned emoji but First thank-you and the hype emojis, which count without a pick, presses the picked ones, and a press picks one more", async () => {
    const pickKudosEmoji = vi.fn<PickKudosEmoji>(async () => ({ kind: "picked", picks: ["level:5", "level:2"] }));
    const view = visit({ album: { ...withFirstThankYou, kudosEmojiPicks: ["level:5"] }, pickKudosEmoji });
    const popup = await openTheEmojis(view);

    const picks = picksIn(popup);
    expect(popup.getByRole("region", { name: /^Count in kudos/ })).toHaveAccessibleName("Count in kudos · 1 of 5");
    expect(picks.getByText(/always count/)).toHaveTextContent("Your kudos emoji and :love-hog: always count. Pick up to 5 more for the kudos you write. A teammate's hype emoji counts when you mention them, and a reaction with any emoji is a hug.");
    expect(pressedIn(picks)).toEqual([":team-quiet-harbour: false", ":level-5: true", ":raised_hands: false"]);

    await view.user.click(picks.getByRole("button", { name: ":raised_hands:" }));

    expect(pickKudosEmoji).toHaveBeenCalledWith("level:2", true);
    expect(pressedIn(picks)).toEqual([":team-quiet-harbour: false", ":level-5: true", ":raised_hands: true"]);
  });

  it("with five picked, an unpicked emoji can't be pressed, and a picked one unpicks", async () => {
    const six = [held({ id: "milestone:people:bronze", kind: "milestone", name: "bronze-people", from: "People" }), held({ id: "team:copper-kite", kind: "team", name: "team-copper-kite", from: "Copper Kite" }), held({ id: "level:10", kind: "level", name: "level-10", from: "Level 10" }), ...atLevelTwo.emojis.filter(({ earned }) => earned)];
    const pickKudosEmoji = vi.fn<PickKudosEmoji>(async () => ({ kind: "picked", picks: ["team:copper-kite", "level:10", "level:5", "level:2"] }));
    const view = visit({ album: { ...atLevelTwo, emojis: six, kudosEmojiPicks: ["team:copper-kite", "level:10", "level:5", "level:2", "team:quiet-harbour"] }, pickKudosEmoji });
    const picks = picksIn(await openTheEmojis(view));

    expect(picks.getByRole("button", { name: ":bronze-people:" })).toBeDisabled();
    await view.user.click(picks.getByRole("button", { name: ":team-quiet-harbour:" }));

    expect(pickKudosEmoji).toHaveBeenCalledWith("team:quiet-harbour", false);
    expect(picks.getByRole("button", { name: ":bronze-people:" })).toBeEnabled();
  });

  it("a pick the album no longer lists, such as a random emoji Slack removed, still counts toward the five and can be unpicked", async () => {
    const pickKudosEmoji = vi.fn<PickKudosEmoji>(async () => ({ kind: "picked", picks: ["level:5"] }));
    const view = visit({ album: { ...withFirstThankYou, kudosEmojiPicks: ["level:5", "random:gone-parrot", "team:disbanded"] }, pickKudosEmoji });
    const popup = await openTheEmojis(view);
    const picks = picksIn(popup);

    expect(popup.getByRole("region", { name: /^Count in kudos/ })).toHaveAccessibleName("Count in kudos · 3 of 5");
    expect(pressedIn(picks)).toEqual([":team-quiet-harbour: false", ":level-5: true", ":raised_hands: false", ":gone-parrot: true", "undefined true"]);
    expect(picks.getByRole("button", { name: ":gone-parrot: No longer listed" })).toBeEnabled();
    await view.user.click(picks.getByRole("button", { name: "An emoji no longer listed" }));

    expect(pickKudosEmoji).toHaveBeenCalledWith("team:disbanded", false);
    expect(pressedIn(picks)).toEqual([":team-quiet-harbour: false", ":level-5: true", ":raised_hands: false"]);
  });

  it("after a press, the album's next answer shows its own picks", async () => {
    const pickKudosEmoji = vi.fn<PickKudosEmoji>(async () => ({ kind: "picked", picks: ["level:5", "level:2"] }));
    const live = anAlbumThatAnswers({ ...withFirstThankYou, kudosEmojiPicks: ["level:5"] });
    const view = visit({ album: live.now(), read: live.read, pickKudosEmoji });
    const picks = picksIn(await openTheEmojis(view));
    await view.user.click(picks.getByRole("button", { name: ":raised_hands:" }));

    live.answerNext({ ...live.now(), kudosEmojiPicks: ["team:quiet-harbour"] });

    expect(pressedIn(picks)).toEqual([":team-quiet-harbour: true", ":level-5: false", ":raised_hands: false"]);
  });

  it("a reply that lands after the album's next answer keeps the album's picks", async () => {
    let reply: (answer: KudosEmojiPickReply) => void = () => {};
    const pickKudosEmoji = vi.fn<PickKudosEmoji>(() => new Promise((resolve) => (reply = resolve)));
    const live = anAlbumThatAnswers({ ...withFirstThankYou, kudosEmojiPicks: [] });
    const view = visit({ album: live.now(), read: live.read, pickKudosEmoji });
    const picks = picksIn(await openTheEmojis(view));
    await view.user.click(picks.getByRole("button", { name: ":raised_hands:" }));

    live.answerNext({ ...live.now(), kudosEmojiPicks: ["level:5"] });
    await act(async () => reply({ kind: "picked", picks: ["level:2"] }));

    expect(pressedIn(picks)).toEqual([":team-quiet-harbour: false", ":level-5: true", ":raised_hands: false"]);
  });

  it("with picking off, the album answers no picks: no section, and every earned emoji counts in a kudos as before", async () => {
    const { kudosEmojiPicks: _off, ...withoutPicks } = withFirstThankYou;
    const popup = await openTheEmojis(visit({ album: withoutPicks }));

    const useNow = section(popup, "Use these now");
    expect(popup.queryByRole("region", { name: /^Count in kudos/ })).not.toBeInTheDocument();
    expect(useNow.getByText(/^React with any of them/)).toHaveTextContent("React with any of them or put them in a kudos. Each one counts like : XP for you both, and an item when it's in a kudos.");
    expect(useNow.getAllByRole("listitem")[0]).toHaveTextContent(":hedgehog:Your kudos emoji · works from the start");
  });

  it("with no earned emoji left to pick but a pick the album no longer lists, the section stays so it can be unpicked", async () => {
    const pickKudosEmoji = vi.fn<PickKudosEmoji>(async () => ({ kind: "picked", picks: [] }));
    const popup = await openTheEmojis(visit({ album: { ...newcomer, kudosEmojiPicks: ["random:gone-parrot"] }, pickKudosEmoji }));

    expect(popup.getByRole("region", { name: /^Count in kudos/ })).toHaveAccessibleName("Count in kudos · 1 of 5");
    expect(pressedIn(picksIn(popup))).toEqual([":gone-parrot: true"]);
  });

  it("with no earned emoji to pick, the section is gone", async () => {
    const popup = await openTheEmojis(visit({ album: newcomer }));

    expect(popup.queryByRole("region", { name: /^Count in kudos/ })).not.toBeInTheDocument();
  });
});

describe("LP74 LP75: the emoji popup leads with what the member can use", () => {
  it("a newcomer's button counts the kudos emoji alone, and the popup opens on it, then on level 2 and the hype row", async () => {
    const view = visit({ album: newcomer });

    const button = await theEmojiButton();
    expect(button).toHaveAccessibleName("Your emojis, 1 you can use");
    expect(button).toHaveTextContent("1");
    const popup = await openTheEmojis(view);

    const useNow = section(popup, "Use these now");
    const hint = useNow.getByText(/^React with any of them/);
    expect(hint).toHaveTextContent("React with any of them for a hug, like : XP for you both.");
    expect(within(hint).getByRole("img", { name: ":hedgehog:" })).toHaveAttribute("src", kudosEmoji.kudosEmojiImage);
    const [kudos] = useNow.getAllByRole("listitem");
    expect(useNow.getAllByRole("listitem")).toHaveLength(1);
    expect(kudos).toHaveTextContent(":hedgehog:Your kudos emoji · always counts in kudos");
    expect(kudos!.querySelector("img")).toHaveAttribute("src", kudosEmoji.kudosEmojiImage);
    const next = rowsIn(section(popup, "Unlock next"));
    expect(next).toHaveLength(3);
    expect(next[0]).toContain(":raised_hands:");
    expect(next[0]).toContain("Reach level 2 · your first kudos does it");
    expect(next[1]).toBe("Give someone a kudos or react with their hype emoji on 10 of their messages: unlock it");
    expect(next[2]).toContain(":team-kettle-works:");
  });

  it("a member at level 2 uses the kudos emoji, then the dated emojis newest first, then the level emojis highest first, and counts only those Slack has", async () => {
    const view = visit({ album: atLevelTwo });

    expect(await theEmojiButton()).toHaveAccessibleName("Your emojis, 3 you can use");
    const popup = await openTheEmojis(view);

    const useNow = section(popup, "Use these now");
    expect(namesIn(useNow)).toEqual([":hedgehog:", ":team-quiet-harbour:", ":ines-okafor-hype:", ":level-5:", ":raised_hands:"]);
    expect(rowsIn(useNow)[1]).toContain("You unlocked the Quiet Harbour team sticker");
    expect(rowsIn(useNow)[4]).toContain("You reached level 2");
  });

  it("once level 2 and a hype emoji are held, Unlock next lists the three with the most progress done", async () => {
    const view = visit({ album: atLevelTwo });
    const popup = await openTheEmojis(view);

    const next = section(popup, "Unlock next");
    expect(namesIn(next)).toEqual([":team-lanterns:", ":level-10:", ":bronze-people:"]);
    expect(rowsIn(next)[0]).toContain("Collect all 5 people on Lanterns · 4 of 5");
  });

  it("ties in Unlock next keep the shelves' order, and with nothing left to earn the section is gone", async () => {
    const halfway = { have: 1, need: 2 };
    const tied: Album = {
      ...atLevelTwo,
      emojis: [
        ...atLevelTwo.emojis.filter(({ earned }) => earned),
        anEmoji({ id: "level:10", kind: "level", name: "level-10", from: "Level 10", progress: halfway }),
        anEmoji({ id: "milestone:people:bronze", kind: "milestone", name: "bronze-people", from: "People", progress: halfway }),
        anEmoji({ id: "team:lanterns", kind: "team", name: "team-lanterns", from: "Lanterns", progress: halfway }),
      ],
    };
    const view = visit({ album: tied });
    expect(namesIn(section(await openTheEmojis(view), "Unlock next"))).toEqual([":team-lanterns:", ":bronze-people:", ":level-10:"]);
    view.unmount();

    const tiedMilestones: Album = {
      ...atLevelTwo,
      emojis: [
        ...atLevelTwo.emojis.filter(({ earned }) => earned),
        anEmoji({ id: "milestone:hoggies:bronze", kind: "milestone", name: "curious", from: "Curious", progress: halfway }),
        anEmoji({ id: "milestone:people:silver", kind: "milestone", name: "familiar-faces", from: "Familiar faces", progress: halfway }),
      ],
    };
    const milestones = visit({ album: tiedMilestones });
    expect(namesIn(section(await openTheEmojis(milestones), "Unlock next"))).toEqual([":familiar-faces:", ":curious:"]);
    milestones.unmount();

    const nothingLeft = visit({ album: { ...atLevelTwo, emojis: atLevelTwo.emojis.filter(({ earned }) => earned) } });
    const popup = await openTheEmojis(nothingLeft);
    expect(popup.getByRole("region", { name: "Use these now" })).toBeInTheDocument();
    expect(popup.queryByRole("region", { name: "Unlock next" })).not.toBeInTheDocument();
  });

  it("an earned emoji Slack lacks reads Set it up and opens the mapping wizard where the wizard opens for the member", async () => {
    const view = visit({ album: atLevelTwo, wizard: true });
    const useNow = section(await openTheEmojis(view), "Use these now");

    await view.user.click(useNow.getByRole("button", { name: "Set up :level-5: in Slack" }));

    expect(await screen.findByRole("dialog", { name: "Find :level-5: in Slack" }, { timeout: 5_000 })).toBeInTheDocument();
  });

  it("where the wizard doesn't open for the member, an earned emoji Slack lacks keeps today's control and its words", async () => {
    const withoutTheWizard = visit({ album: atLevelTwo });
    const useNow = section(await openTheEmojis(withoutTheWizard), "Use these now");
    expect(useNow.queryByRole("button", { name: /^Set up/ })).not.toBeInTheDocument();
    expect(useNow.getByRole("button", { name: "Add to Slack: :level-5:" })).toBeInTheDocument();
    withoutTheWizard.unmount();

    const forAMember = visit({ album: atLevelTwo, wizard: true, inPlace: "member" });
    const theirs = section(await openTheEmojis(forAMember), "Use these now");
    expect(theirs.queryByRole("button", { name: /^Set up/ })).not.toBeInTheDocument();
    expect(rowsIn(theirs)[3]).toContain("Coming soon to Slack");
  });

  it("All emojis · N opens today's shelves and search, and the way back returns to what the member can use", async () => {
    const view = visit({ album: atLevelTwo });
    const popup = await openTheEmojis(view);

    await view.user.click(popup.getByRole("button", { name: "All emojis · 8" }));

    expect(popup.getByRole("heading", { level: 2 })).toHaveTextContent("Your emojis · 4 of 8");
    expect(popup.getByRole("searchbox", { name: "Find an emoji" })).toBeInTheDocument();
    expect(popup.getByRole("region", { name: /^Team stickers/ })).toBeInTheDocument();
    expect(popup.queryByRole("region", { name: "Use these now" })).not.toBeInTheDocument();
    const back = popup.getByRole("button", { name: "Back to the emojis you can use" });
    expect(back).toHaveFocus();

    await view.user.click(back);

    expect(popup.getByRole("region", { name: "Use these now" })).toBeInTheDocument();
    expect(popup.getByRole("button", { name: "All emojis · 8" })).toHaveFocus();
  });

  it("+N more opens the popup on All emojis, where Just unlocked lists what it marked seen, and the next opening leads with what the member can use", async () => {
    preferReducedMotion();
    const people = ["ada", "bo", "cy", "di", "ed", "fi"];
    const sixNew: Album = { ...atLevelTwo, emojis: [...atLevelTwo.emojis, ...people.map((person, index) => held({ id: `hype:${person}`, kind: "hype", name: `${person}-hype`, from: person, picture: "/emoji/hype.png", earnedAt: Date.now() - index * 60_000, seen: false }))] };
    const view = visit({ album: sixNew });
    const bundle = await screen.findByRole("dialog", { name: "New emojis unlocked" }, { timeout: 5_000 });

    await view.user.click(within(bundle).getByRole("button", { name: "+1 more" }));

    const popup = within(await screen.findByRole("region", { name: "Your emojis" }));
    expect(namesIn(section(popup, "Just unlocked"))).toEqual(people.map((person) => `:${person}-hype:`));
    expect(popup.getByRole("button", { name: "Back to the emojis you can use" })).toBeInTheDocument();

    await view.user.keyboard("{Escape}");
    const reopened = await openTheEmojis(view);

    expect(reopened.getByRole("region", { name: "Use these now" })).toBeInTheDocument();
  });

  it("while onboarding is off, the button counts the earned emojis and the popup is today's", async () => {
    const { emojiHowTo: _off, ...today } = atLevelTwo;
    const view = visit({ album: today });

    expect(await theEmojiButton()).toHaveAccessibleName("Your emojis, 4 earned");
    const popup = await openTheEmojis(view);

    expect(popup.getByRole("heading", { level: 2 })).toHaveTextContent("Your emojis · 4 of 8");
    expect(popup.queryByRole("region", { name: "Use these now" })).not.toBeInTheDocument();
    expect(popup.queryByRole("region", { name: "Unlock next" })).not.toBeInTheDocument();
    expect(popup.queryByRole("button", { name: /^All emojis/ })).not.toBeInTheDocument();
  });
});
