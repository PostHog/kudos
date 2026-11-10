// The module map's skeleton of convex/album/items/questHoggies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { questFinishedEventValidator } from "../../bus/events.ts";
import { z } from "zod";
import type { MutationContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";
import { mutationJob } from "../../jobs/define.ts";

export function questItemKeyOf(rewardKey: string): `quest:${string}` {
  return `quest:${rewardKey}`;
}

export const earnQuestHoggieArgs = z.strictObject({ event: questFinishedEventValidator });
export async function earnQuestHoggie(ctx: MutationContext, args: z.infer<typeof earnQuestHoggieArgs>): Promise<void> {
  throw notPorted("album.items.questHoggies.earnQuestHoggie");
}
export const earnQuestHoggieJob = mutationJob("album.items.questHoggies.earnQuestHoggie", earnQuestHoggieArgs, earnQuestHoggie);
