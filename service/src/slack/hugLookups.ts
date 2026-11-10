// The module map's skeleton of convex/slack/hugLookups.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { hugReactionValidator } from "../hugs/reaction.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

const lookUpArgs = { reaction: hugReactionValidator, users: z.array(z.string()) };

export const lookUpHugPeopleArgs = z.strictObject({ ...lookUpArgs, attempt: z.optional(zv.number()) });
export async function lookUpHugPeople(ctx: ActionContext, args: z.infer<typeof lookUpHugPeopleArgs>): Promise<void> {
  throw notPorted("slack.hugLookups.lookUpHugPeople");
}
export const lookUpHugPeopleJob = actionJob("slack.hugLookups.lookUpHugPeople", lookUpHugPeopleArgs, lookUpHugPeople);

export const decideLookedUpHugArgs = z.strictObject({ reaction: hugReactionValidator });
export async function decideLookedUpHug(ctx: MutationContext, args: z.infer<typeof decideLookedUpHugArgs>): Promise<void> {
  throw notPorted("slack.hugLookups.decideLookedUpHug");
}
