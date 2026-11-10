// The module map's skeleton of convex/website/memberMutation.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { HomeMember } from "../feedback/homes.ts";
import { type VerifiedMember } from "./memberQuery.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

type CommandHandler<Args, Result> = (ctx: MutationContext, me: VerifiedMember, person: HomeMember, args: Args) => Promise<Result>;
export function memberMutation({ args, handler }: { args: z.ZodRawShape; handler: CommandHandler<never, unknown> }): { isConvexFunction: true; isMutation: true } & { _visibility: "public" } & { isPublic: true } {
  throw notPorted("website.memberMutation.memberMutation");
}
