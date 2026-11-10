// A quest's hoggie: a finished quest that names a reward earns one face-down hoggie, once per reward. Today's
// convex/album/items/questHoggies.ts over the service's transaction.
import { questFinishedEventValidator } from "../../bus/events.ts";
import { isMember } from "../../workspace/directory.ts";
import { earnHoggieItem, questHoggieRarities } from "../hoggies/rarityCaps.ts";
import { z } from "zod";
import type { MutationContext } from "../../operations.ts";
import { mutationJob } from "../../jobs/define.ts";

export function questItemKeyOf(rewardKey: string): `quest:${string}` {
  return `quest:${rewardKey}`;
}

export const earnQuestHoggieArgs = z.strictObject({ event: questFinishedEventValidator });
export async function earnQuestHoggie(ctx: MutationContext, { event: { workspace, member, quest, rewardKey, at } }: z.infer<typeof earnQuestHoggieArgs>): Promise<void> {
  if (rewardKey === undefined || !(await isMember(ctx, member))) return;
  await earnHoggieItem(ctx, { workspace, member, key: questItemKeyOf(rewardKey), reason: { kind: "quest", quest }, earnedAt: at }, questHoggieRarities);
}
export const earnQuestHoggieJob = mutationJob("album.items.questHoggies.earnQuestHoggie", earnQuestHoggieArgs, earnQuestHoggie);
