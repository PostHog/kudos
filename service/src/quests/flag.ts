// Who walks the Monday path and who sees two quests: flag decisions, with exposure recorded where the member sees them.
// Today's convex/quests/flag.ts.
import { exposed, memberDecision } from "../analytics/flags.ts";
import { xpLevelsOnFor } from "../progression/xpLevels.ts";
import { mondayQuestFlag } from "./mondayQuestFlag.ts";
import { twoQuestsFlag } from "./twoQuestsFlag.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export async function onTheMondayPath(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  return (await memberDecision(ctx, mondayQuestFlag, member)) && (await xpLevelsOnFor(ctx, member));
}

export function twoQuestsOn(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  return memberDecision(ctx, twoQuestsFlag, member);
}

export async function twoQuestsShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const on = await memberDecision(ctx, twoQuestsFlag, member);
  await exposed(ctx, twoQuestsFlag, member, on);
  return on;
}

export async function mondayPathShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const applies = await memberDecision(ctx, mondayQuestFlag, member);
  await exposed(ctx, mondayQuestFlag, member, applies);
  return applies && (await xpLevelsOnFor(ctx, member));
}
