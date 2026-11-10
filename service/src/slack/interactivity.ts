// The module map's skeleton of convex/slack/interactivity.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DmLink } from "../analytics/isolatedUsage.ts";
import { dmKindValidator, dmLinkDestinationValidator } from "../analytics/projections.ts";
import type { Command } from "../commands/commands.ts";

const dmKinds: readonly DmLink["dm"][] = dmKindValidator.options.map(({ value }) => value);

const dmLinkDestinations: readonly DmLink["destination"][] = dmLinkDestinationValidator.options.map(({ value }) => value);

export const showMeHowAction = "dm-link:welcome:quests-how";

export function encodeHomeAction(command: Command) {
  return JSON.stringify(command);
}
