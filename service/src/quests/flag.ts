// The module map's skeleton of convex/quests/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function onTheMondayPath(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("quests.flag.onTheMondayPath");
}

export function twoQuestsOn(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("quests.flag.twoQuestsOn");
}

export async function twoQuestsShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("quests.flag.twoQuestsShownTo");
}

export async function mondayPathShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("quests.flag.mondayPathShownTo");
}
