// The module map's skeleton of convex/website/signIn.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Id } from "../db/columns.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

type SignIn = { existingUserId: Id<"users"> | null; profile: Record<string, unknown> };

export async function rememberSignedInMember(ctx: MutationContext, { existingUserId, profile }: SignIn): Promise<Id<"users">> {
  throw notPorted("website.signIn.rememberSignedInMember");
}
