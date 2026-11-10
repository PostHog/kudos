// What other stacks' reads answer to the album's earned emojis, random emojis and boards while their bodies are still
// stubs in the module map: the album's flags (9.5's flag.ts) and the hidden-items and onboarding flags (S8), the items
// waiting face down and the hype each holds (S8's ledger and items/hypes.ts), the packs (S8), a member's level and when
// they first reached each one (S6), and who shows on the leaderboards (S11). Each stand-in keeps its Convex function's
// contract, as convex/album/flag.ts, items/flag.ts, items/onboardingFlag.ts, items/ledger.ts, items/hypes.ts,
// packs.ts, progression/progression.ts, unlocks/levelUps.ts and leaderboard/visibility.ts answer it. The packs read
// the service's own thoughtfulPacks rows in their index order, as packs.ts did. A test file mocks a module with
// `standIn`, which keeps the module's other exports:
//
//   vi.mock("../packs.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "packs"));
import { and, eq, gte, lt, type SQL } from "drizzle-orm";
import { toDocument } from "../../db/documents.ts";
import { indexOrder } from "../../db/indexOrder.ts";
import { thoughtfulPacks, type Doc } from "../../db/schema/index.ts";
import type { QueryContext } from "../../operations.ts";

export const earnedWorld = {
  /** Members each flag is on for. */
  flags: { randomEmojis: new Set<string>(), hiddenItems: new Set<string>(), onboarding: new Set<string>() },
  /** Each member's level. */
  levels: new Map<string, number>(),
  /** When each member first reached a level, by `member:level`. */
  levelReachedAt: new Map<string, number>(),
  /** The people whose first pack from the member waits face down, as `member:person`, oldest first. */
  packsFaceDown: new Set<string>(),
  /** How many other items wait face down for each member, all older than their packs' items. */
  otherItemsWaiting: new Map<string, number>(),
  /** Members whose Show me on the leaderboards is off. */
  offTheBoards: new Set<string>(),

  reset() {
    for (const on of Object.values(this.flags)) on.clear();
    this.levels.clear();
    this.levelReachedAt.clear();
    this.packsFaceDown.clear();
    this.otherItemsWaiting.clear();
    this.offTheBoards.clear();
  },
};

const flag = (on: Set<string>) => async (_ctx: unknown, member: string) => on.has(member);

// convex/album/flag.ts
const albumFlags = { randomEmojisShownTo: flag(earnedWorld.flags.randomEmojis) };

// convex/album/items/flag.ts
const itemFlags = { hiddenItemsShownTo: flag(earnedWorld.flags.hiddenItems) };

// convex/album/items/onboardingFlag.ts: onboarding shows only where hidden items do.
const onboarding = { onboardingShownTo: async (_ctx: unknown, member: string) => earnedWorld.flags.onboarding.has(member) && earnedWorld.flags.hiddenItems.has(member) };

const waitsFaceDown = (member: string, person: string) => earnedWorld.flags.hiddenItems.has(member) && earnedWorld.packsFaceDown.has(`${member}:${person}`);

// convex/album/items/ledger.ts: the items face down, oldest first, a thanks item naming the person it is for; at most
// mostItemsShown of them, with `more` when others wait beyond.
const mostItemsShown = 100;
const ledger = {
  boardOf: async (_ctx: unknown, member: string) => {
    const others = Array.from({ length: earnedWorld.otherItemsWaiting.get(member) ?? 0 }, () => ({ kind: "hoggie" as const }));
    const thanks = [...earnedWorld.packsFaceDown].filter((key) => key.startsWith(`${member}:`)).map((key) => ({ kind: "thanks" as const, person: key.slice(member.length + 1) }));
    const waiting = [...others, ...thanks].map((reason, index) => ({ item: `item-${index}`, earnedAt: index, reason }));
    return { items: waiting.slice(0, mostItemsShown), more: waiting.length > mostItemsShown };
  },
};

// convex/album/items/hypes.ts
const itemHypes = { hypeWaitsForItsItem: async (_ctx: unknown, member: string, person: string) => waitsFaceDown(member, person) };

const byGiverAt = indexOrder(thoughtfulPacks, ["giver", "at"]);
const byGiverRecipient = indexOrder(thoughtfulPacks, ["giver", "recipient"]);

// convex/album/packs.ts
const packs = {
  packsEarnedBetween: async (ctx: QueryContext, giver: string, { from, to }: { from: number; to: number }, most: number) => {
    const bounds: SQL[] = [eq(thoughtfulPacks.giver, giver)];
    if (Number.isFinite(from)) bounds.push(gte(thoughtfulPacks.at, from));
    if (Number.isFinite(to)) bounds.push(lt(thoughtfulPacks.at, to));
    const rows = await ctx.tx.select().from(thoughtfulPacks).where(and(...bounds)).orderBy(...byGiverAt.orderBy()).limit(most);
    return rows.map((row) => toDocument<Doc<"thoughtfulPacks">>(thoughtfulPacks, row));
  },
  isFirstPackFor: async (ctx: QueryContext, { _id, giver, recipient }: Doc<"thoughtfulPacks">) => {
    const [first] = await ctx.tx.select({ _id: thoughtfulPacks._id }).from(thoughtfulPacks).where(and(eq(thoughtfulPacks.giver, giver), eq(thoughtfulPacks.recipient, recipient))).orderBy(...byGiverRecipient.orderBy()).limit(1);
    return first?._id === _id;
  },
};

// convex/progression/progression.ts: the home's level, the one field the album reads.
const progression = { progressionHomeOf: async (_ctx: unknown, member: string) => ({ level: earnedWorld.levels.get(member) ?? 1, xp: 0, xpToNextLevel: 0 }) };

// convex/unlocks/levelUps.ts: when the member first reached the level or any above it, by the lowest such level, as
// the by_member_level index's first row at or above it answers.
const levelUps = {
  levelFirstReachedAt: async (_ctx: unknown, member: string, level: number) => {
    const reached = [...earnedWorld.levelReachedAt]
      .map(([key, at]) => ({ of: key.slice(0, key.lastIndexOf(":")), level: Number(key.slice(key.lastIndexOf(":") + 1)), at }))
      .filter(({ of, level: reachedLevel }) => of === member && reachedLevel >= level)
      .toSorted((one, other) => one.level - other.level);
    return reached[0]?.at ?? null;
  },
};

// convex/leaderboard/visibility.ts: on the boards unless the member turned it off.
const visibility = { isOnTheBoards: async (_ctx: unknown, member: string) => !earnedWorld.offTheBoards.has(member) };

const standIns = { albumFlags, itemFlags, onboarding, ledger, itemHypes, packs, progression, levelUps, visibility };

/** The module as it is, with the stand-ins of `which` in place of its stubs. */
export async function standIn(original: () => Promise<unknown>, which: keyof typeof standIns): Promise<Record<string, unknown>> {
  return { ...((await original()) as Record<string, unknown>), ...standIns[which] };
}
