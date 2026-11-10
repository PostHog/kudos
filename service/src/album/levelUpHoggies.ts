// Level-up hoggies, as today's convex/album/levelUpHoggies.ts: each level reached earns three hoggie items, and while
// hidden items are off and the reveal flag is on, each one is dropped at once and marked turned.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { exposed, memberDecision, memberDecisionWithoutWriting, type Flag } from "../analytics/flags.ts";
import { levelReachedEventValidator } from "../bus/events.ts";
import type { Id } from "../db/columns.ts";
import { toDocument } from "../db/documents.ts";
import { items, type Doc } from "../db/schema/index.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { CrateKey } from "./hoggies/crateKey.ts";
import { dropFor, droppedIn, foundIn, type Drop } from "./hoggies/drops.ts";
import { crestsShownTo } from "./hoggies/flag.ts";
import { earnHoggieItem, levelUpSlotRarities, levelUpThirdSlotRarities, storedRangeOf, type RarityRange, type SourceRarities } from "./hoggies/rarityCaps.ts";
import { hiddenItemsShownTo } from "./items/flag.ts";
import { earnedItemOf, markTurned } from "./items/ledger.ts";

export const levelUpRevealFlag = { key: "level-up-reveal", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

const slots: ReadonlyArray<{ slot: number; rarities: SourceRarities }> = [
  { slot: 1, rarities: levelUpSlotRarities },
  { slot: 2, rarities: levelUpSlotRarities },
  { slot: 3, rarities: levelUpThirdSlotRarities },
];

export function levelUpCrateKeyOf(level: number, slot: number): CrateKey {
  return `level:${level}:${slot}`;
}

export type LevelUp = { workspace: string; member: MemberId; level: number; at: number };

type LevelUpItem = { crate: CrateKey; range: RarityRange };

export const earnLevelUpHoggiesArgs = z.strictObject({ event: levelReachedEventValidator });
export async function earnLevelUpHoggies(ctx: MutationContext, { event: { workspace, member, level, at } }: z.infer<typeof earnLevelUpHoggiesArgs>): Promise<void> {
  if (await levelUpEarned(ctx, member, level)) return;
  await dropLevelUpHoggies(ctx, { workspace, member, level, at });
}
export const earnLevelUpHoggiesJob = mutationJob("album.levelUpHoggies.earnLevelUpHoggies", earnLevelUpHoggiesArgs, earnLevelUpHoggies);

export async function levelUpEarned(ctx: QueryContext, member: MemberId, level: number): Promise<boolean> {
  return (await earnedItemOf(ctx, member, "hoggie", levelUpCrateKeyOf(level, 1))) !== null;
}

export async function dropLevelUpHoggies(ctx: MutationContext, levelUp: LevelUp): Promise<void> {
  const earned = await earnLevelUpItems(ctx, levelUp);
  if (await hiddenItemsShownTo(ctx, levelUp.member)) return;
  if (await levelUpRevealDropsFor(ctx, levelUp.member)) await revealLevelUpHoggies(ctx, levelUp, earned);
}

async function earnLevelUpItems(ctx: MutationContext, { workspace, member, level, at }: LevelUp): Promise<LevelUpItem[]> {
  const earned: LevelUpItem[] = [];
  for (const { slot, rarities } of slots) {
    const crate = levelUpCrateKeyOf(level, slot);
    const item = await earnHoggieItem(ctx, { workspace, member, key: crate, reason: { kind: "levelUp", level }, earnedAt: at }, rarities);
    earned.push({ crate, range: storedRangeOf(await itemOf(ctx, item)) });
  }
  return earned;
}

// Convex's `ctx.db.get(item)!`: the item just earned or found is there.
async function itemOf({ tx }: QueryContext, item: Id<"items">): Promise<Doc<"items">> {
  const [row] = await tx.select().from(items).where(eq(items._id, item));
  if (row === undefined) throw new Error("The level-up item is not stored");
  return toDocument<Doc<"items">>(items, row);
}

async function revealLevelUpHoggies(ctx: MutationContext, { member, at }: LevelUp, earned: LevelUpItem[]): Promise<void> {
  for (const { crate, range } of earned) {
    await dropFor(ctx, member, crate, at, range);
    if (await droppedIn(ctx, member, crate)) await markTurned(ctx, member, "hoggie", crate, at);
  }
}

async function levelUpRevealDropsFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const drops = await memberDecision(ctx, levelUpRevealFlag, member);
  await exposed(ctx, levelUpRevealFlag, member, drops);
  return drops;
}

export function levelUpRevealOnFor(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, levelUpRevealFlag, member);
}

export async function levelUpHoggiesOf(ctx: QueryContext, member: MemberId, level: number): Promise<Drop[]> {
  const shown = { crests: await crestsShownTo(ctx, member) };
  const hoggies: Drop[] = [];
  for (const { slot } of slots) {
    const drop = await foundIn(ctx, member, levelUpCrateKeyOf(level, slot), shown);
    if (drop !== null) hoggies.push(drop);
  }
  return hoggies;
}
