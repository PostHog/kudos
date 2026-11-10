// The module map's skeleton of convex/album/items/hugFinds.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { hugGivenEventValidator } from "../../bus/events.ts";
import { z } from "zod";
import type { MutationContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";
import { mutationJob } from "../../jobs/define.ts";

export const findOnHugArgs = z.strictObject({ event: hugGivenEventValidator });
export async function findOnHug(ctx: MutationContext, args: z.infer<typeof findOnHugArgs>): Promise<void> {
  throw notPorted("album.items.hugFinds.findOnHug");
}
export const findOnHugJob = mutationJob("album.items.hugFinds.findOnHug", findOnHugArgs, findOnHug);
