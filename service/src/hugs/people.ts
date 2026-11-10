// The module map's skeleton of convex/hugs/people.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { hugGivenEventValidator } from "../bus/events.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const payHugPeopleArgs = z.strictObject({ event: hugGivenEventValidator, cursor: z.optional(z.string()) });
export async function payHugPeople(ctx: MutationContext, args: z.infer<typeof payHugPeopleArgs>): Promise<void> {
  throw notPorted("hugs.people.payHugPeople");
}
export const payHugPeopleJob = mutationJob("hugs.people.payHugPeople", payHugPeopleArgs, payHugPeople);
