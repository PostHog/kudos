// A hug find: a giver who hugs may find a hoggie, at most one a day, drawn from the hug's own secret. Today's
// convex/album/items/hugFinds.ts over the service's transaction.
import { hugGivenEventValidator } from "../../bus/events.ts";
import { isMember } from "../../workspace/directory.ts";
import { drawSecret } from "../hoggies/drops.ts";
import { findsOnHug } from "../hoggies/draw.ts";
import { hugFindRarities } from "../hoggies/rarityCaps.ts";
import { earnItem } from "./ledger.ts";
import { z } from "zod";
import type { MutationContext } from "../../operations.ts";
import { mutationJob } from "../../jobs/define.ts";

export const findOnHugArgs = z.strictObject({ event: hugGivenEventValidator });
export async function findOnHug(ctx: MutationContext, { event: { workspace, giver, message, day, at, rewards } }: z.infer<typeof findOnHugArgs>): Promise<void> {
  if (rewards !== true || !(await isMember(ctx, giver))) return;
  if (!(await findsOnHug({ secret: drawSecret(), member: giver, hug: `${message.conversation}:${message.message}` }))) return;
  await earnItem(ctx, { workspace, member: giver, source: "hoggie", key: `hug-find:${day}`, ...hugFindRarities, reason: { kind: "hug" }, earnedAt: at });
}
export const findOnHugJob = mutationJob("album.items.hugFinds.findOnHug", findOnHugArgs, findOnHug);
