// The module map's skeleton of convex/feedback/coins.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { unlockOpenedEventValidator } from "../bus/events.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const tellCoinsOpenedArgs = z.strictObject({ event: unlockOpenedEventValidator });
export async function tellCoinsOpened(ctx: MutationContext, args: z.infer<typeof tellCoinsOpenedArgs>): Promise<void> {
  throw notPorted("feedback.coins.tellCoinsOpened");
}
export const tellCoinsOpenedJob = mutationJob("feedback.coins.tellCoinsOpened", tellCoinsOpenedArgs, tellCoinsOpened);

export function coinsPartOf(coins: number) {
  return `+${coins} 🪙`;
}

export function coinsOpenedLineOf(balance: number) {
  return balance === 0 ? "Coins are open. You earn 🪙 when you give a kudos." : `Coins are open. You already have ${balance} 🪙.`;
}

export function inventoryOpenedLineOf(balance: number, kudosEmoji: string) {
  const starter = `🦔 is one of your kudos emoji: use it in a kudos like :${kudosEmoji}:.`;
  return balance === 0 ? `Coins and inventory are open. ${starter}` : `Coins and inventory are open. You already have ${balance} 🪙, and ${starter}`;
}

export function inCoins(balance: number) {
  return `${balance} 🪙`;
}
