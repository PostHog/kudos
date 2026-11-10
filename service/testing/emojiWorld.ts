// What other stacks' reads would answer to the album's emoji modules, while their bodies are still stubs in the module
// map: the directory's members (S3), Slack's custom emoji and the standard-emoji flag (S3), what a member has earned
// and their level emojis (S9's earned and level emojis, later in the stack), and the album and workspace flags (S9's
// flag.ts, S3's workspace settings). Each stand-in keeps its Convex function's contract, as convex/workspace/
// slackEmoji.ts, customEmoji.ts, directory.ts and convex/album/earnedEmojis.ts answer it. A test file mocks a module
// with `standIn`, which keeps the module's other exports:
//
//   vi.mock("../workspace/slackEmoji.ts", async (original) => (await import("../../testing/emojiWorld.ts")).standIn(original, "slackEmoji"));
import type { QueryContext } from "../src/operations.ts";
import { standardEmojiListed, standardEmojiNamed, standardEmojiStartingWith } from "../src/workspace/standardEmoji.ts";

type ListedEmoji = { name: string; image: string };
type CustomEmoji = ListedEmoji & { aliasOf?: string };
type Member = { workspace: string; user: string; fullName: string; current: boolean; admin?: boolean };

export const emojiWorld = {
  members: new Map<string, Member>(),
  /** Each workspace's custom emoji, as Slack's last listing kept them. */
  customEmoji: new Map<string, CustomEmoji[]>(),
  /** Members for whom standard-emoji is on. */
  standardEmoji: new Set<string>(),
  /** What each member has earned, by earned emoji ID. */
  earned: new Map<string, Set<string>>(),
  /** Each member's random drops, by Slack name. */
  drops: new Map<string, Set<string>>(),
  /** The level emojis each member is offered (onboarding's level 2 among them). */
  levels: new Map<string, number[]>(),
  /** Members for whom each flag is on. */
  flags: { emojiWizard: new Set<string>(), emojiMappingInPlace: new Set<string>(), workspaceSettings: new Set<string>(), kudosEmojiPicks: new Set<string>() },

  reset() {
    this.members.clear();
    this.customEmoji.clear();
    this.standardEmoji.clear();
    this.earned.clear();
    this.drops.clear();
    this.levels.clear();
    for (const on of Object.values(this.flags)) on.clear();
  },
  member(member: string, fields: Partial<Member> & { fullName: string }) {
    this.members.set(member, { workspace: "T1", user: `U_${member}`, current: true, ...fields });
  },
  slackHas(workspace: string, ...emoji: CustomEmoji[]) {
    this.customEmoji.set(workspace, [...(this.customEmoji.get(workspace) ?? []), ...emoji]);
  },
  earns(member: string, ...ids: string[]) {
    this.earned.set(member, new Set([...(this.earned.get(member) ?? []), ...ids]));
  },
};

const customIn = (workspace: string) => (emojiWorld.customEmoji.get(workspace) ?? []).toSorted((one, other) => (one.name < other.name ? -1 : one.name > other.name ? 1 : 0));
const customNamed = (workspace: string, name: string) => customIn(workspace).find((emoji) => emoji.name === name) ?? null;
const withStandard = (member: string) => emojiWorld.standardEmoji.has(member);

// convex/workspace/slackEmoji.ts over convex/workspace/customEmoji.ts.
const slackEmoji = {
  slackEmojiReachOf: async (_ctx: unknown, member: string) => (withStandard(member) ? "customAndStandard" : "custom"),
  slackEmojiImageOf: async (_ctx: unknown, workspace: string, name: string) => customNamed(workspace, name)?.image ?? standardEmojiNamed(name)?.image,
  slackEmojiNamed: async (_ctx: unknown, workspace: string, name: string, reach: string) => {
    const custom = customNamed(workspace, name);
    if (custom !== null) return { name: custom.aliasOf ?? custom.name, image: custom.image };
    return reach === "customAndStandard" ? standardEmojiNamed(name) : null;
  },
  slackEmojiStartingWith: async (_ctx: unknown, workspace: string, typed: string, limit: number, reach: string) => {
    const rows = customIn(workspace)
      .filter(({ name }) => name.startsWith(typed))
      .slice(0, limit * 2);
    const originals = new Map(rows.map(({ name, image, aliasOf }) => [aliasOf ?? name, { name: aliasOf ?? name, image }]));
    const custom = [...originals.values()].toSorted((first, second) => first.name.localeCompare(second.name)).slice(0, limit);
    const standard = reach === "customAndStandard" ? standardEmojiStartingWith(typed, limit).filter(({ name }) => customNamed(workspace, name) === null) : [];
    return [...custom, ...standard].slice(0, limit);
  },
  slackEmojiListedIn: async (_ctx: unknown, workspace: string, most: number, reach: string) => {
    const custom = customIn(workspace)
      .slice(0, most)
      .map(({ name, image }) => ({ name, image }));
    const names = new Set(custom.map(({ name }) => name));
    const standard = reach === "customAndStandard" ? standardEmojiListed().filter(({ name }) => !names.has(name)) : [];
    return [...custom, ...standard].slice(0, most);
  },
};

// convex/workspace/directory.ts: a member row of kind "member" is current; a former member keeps their row.
const directory = {
  personFactsOf: async (_ctx: unknown, member: string) => {
    const found = emojiWorld.members.get(member);
    return found?.current ? { workspace: found.workspace, user: found.user, admin: found.admin ?? false } : null;
  },
  fullNameOf: async (_ctx: unknown, member: string) => {
    const found = emojiWorld.members.get(member);
    return found?.current ? found.fullName : "";
  },
  currentMembersNamedIn: async (_ctx: unknown, workspace: string) =>
    [...emojiWorld.members].filter(([, { workspace: of, current }]) => of === workspace && current).map(([member, { fullName }]) => ({ member, fullName })),
};

const isEarned = (member: string, id: string) => emojiWorld.earned.get(member)?.has(id) ?? false;

// convex/album/earnedEmojis.ts: what the member earned, a random drop by its Slack name.
const earnedEmojis = {
  isEarnedBy: async (_ctx: unknown, member: string, id: string) => isEarned(member, id),
  holdsEarnedEmoji: async (_ctx: unknown, member: string, emoji: string) => (emoji.startsWith("random:") ? (emojiWorld.drops.get(member)?.has(emoji.slice("random:".length)) ?? false) : isEarned(member, emoji)),
  hypeFaceOf: async (_ctx: unknown, _workspace: string, person: string) => ({ name: emojiWorld.members.get(person)?.fullName ?? "Someone", picture: `https://faces.example/${person}.png` }),
  earnedEmojisAmong: async (ctx: QueryContext, workspace: string, member: string, names: string[], counts: (emoji: string) => boolean | Promise<boolean>) => {
    // Read when called, so loading this module never loads the album's while a mock factory runs.
    const { namesHeldIn } = await import("../src/album/emojiNames.ts");
    const registry = await namesHeldIn(ctx, workspace);
    const earned = new Map<string, string>();
    for (const name of new Set(names)) {
      const dropped = emojiWorld.drops.get(member)?.has(name) ?? false;
      const candidates = [...(dropped ? [{ emoji: `random:${name}`, dropped }] : []), ...(registry.has(name) ? [{ emoji: registry.get(name)!, dropped: false }] : [])];
      for (const { emoji, dropped: isDrop } of candidates) if (!earned.has(name) && (await counts(emoji)) && (isDrop || isEarned(member, emoji))) earned.set(name, emoji);
    }
    return [...earned].map(([name, emoji]) => ({ name, emoji }));
  },
};

const levelEmojis = {
  isEmojiLevelOf: async (_ctx: unknown, member: string, level: number) => (emojiWorld.levels.get(member) ?? [5, 10, 15, 20, 25]).includes(level),
};

const flags = {
  emojiWizardShownTo: async (_ctx: unknown, member: string) => emojiWorld.flags.emojiWizard.has(member),
  emojiMappingInPlaceShownTo: async (_ctx: unknown, member: string) => emojiWorld.flags.emojiMappingInPlace.has(member),
  kudosEmojiPicksCountFor: async (_ctx: unknown, member: string) => emojiWorld.flags.kudosEmojiPicks.has(member),
};

const workspaceSettings = {
  workspaceSettingsShownTo: async (_ctx: unknown, member: string) => emojiWorld.flags.workspaceSettings.has(member),
};

const standIns = { slackEmoji, directory, earnedEmojis, levelEmojis, flags, workspaceSettings };

/** The module as it is, with the stand-ins of `which` in place of its stubs. */
export async function standIn(original: () => Promise<unknown>, which: keyof typeof standIns): Promise<Record<string, unknown>> {
  return { ...(await original()) as Record<string, unknown>, ...standIns[which] };
}
