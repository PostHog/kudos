// The module map's skeleton of convex/slack/reactions.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { HugReaction } from "../hugs/reaction.ts";
import type { EventCallback } from "./normalize.ts";
import { isText } from "./richText.ts";
import { z } from "zod";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

type ReactionAdded = {
  type: "reaction_added";
  user?: string;
  reaction?: string;
  item_user?: string;
  item?: { type?: string; channel?: string; ts?: string };
  event_ts?: string;
};

export type ReactionEnvelope = EventCallback & { event: ReactionAdded; authorizations?: Array<{ user_id?: string; is_bot?: boolean }> };

export function isReactionAdded(envelope: EventCallback): envelope is ReactionEnvelope {
  return envelope.event.type === "reaction_added";
}

export const mayReactWithArgs = z.strictObject({ workspace: z.string(), giver: z.string(), emoji: z.string() });
export async function mayReactWith(ctx: QueryContext, args: z.infer<typeof mayReactWithArgs>): Promise<boolean> {
  throw notPorted("slack.reactions.mayReactWith");
}

export function hugReactionOf(envelope: ReactionEnvelope): HugReaction | null {
  const { user, reaction, item_user: author, item, event_ts: eventTs } = envelope.event;
  if (!isText(reaction)) return null;
  if (item?.type !== "message" || !isText(item.channel) || !isText(item.ts) || isDirectMessage(item.channel)) return null;
  if (!isText(user) || !isText(author) || !isText(eventTs) || author === user) return null;
  const appBotUser = appBotUserOf(envelope);
  if (user === appBotUser || author === appBotUser) return null;
  return { workspace: envelope.team_id, giver: user, author, conversation: item.channel, message: item.ts, emoji: reaction, at: Number(eventTs) * 1000 };
}

function isDirectMessage(conversation: string) {
  return conversation.startsWith("D");
}

function appBotUserOf({ authorizations }: ReactionEnvelope) {
  return authorizations?.find((authorization) => authorization.is_bot === true)?.user_id;
}
