// The module map's skeleton of convex/album/levelUpHoggies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Flag } from "../analytics/flags.ts";
import { levelReachedEventValidator } from "../bus/events.ts";
import type { CrateKey } from "./hoggies/crateKey.ts";
import type { Drop } from "./hoggies/drops.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const levelUpRevealFlag = { key: "level-up-reveal", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function levelUpCrateKeyOf(level: number, slot: number): CrateKey {
  return `level:${level}:${slot}`;
}

export type LevelUp = { workspace: string; member: MemberId; level: number; at: number };

export const earnLevelUpHoggiesArgs = z.strictObject({ event: levelReachedEventValidator });
export async function earnLevelUpHoggies(ctx: MutationContext, args: z.infer<typeof earnLevelUpHoggiesArgs>): Promise<void> {
  throw notPorted("album.levelUpHoggies.earnLevelUpHoggies");
}
export const earnLevelUpHoggiesJob = mutationJob("album.levelUpHoggies.earnLevelUpHoggies", earnLevelUpHoggiesArgs, earnLevelUpHoggies);

export async function levelUpEarned(ctx: QueryContext, member: MemberId, level: number): Promise<boolean> {
  throw notPorted("album.levelUpHoggies.levelUpEarned");
}

export async function dropLevelUpHoggies(ctx: MutationContext, levelUp: LevelUp): Promise<void> {
  throw notPorted("album.levelUpHoggies.dropLevelUpHoggies");
}

export function levelUpRevealOnFor(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.levelUpHoggies.levelUpRevealOnFor");
}

export async function levelUpHoggiesOf(ctx: QueryContext, member: MemberId, level: number): Promise<Drop[]> {
  throw notPorted("album.levelUpHoggies.levelUpHoggiesOf");
}
