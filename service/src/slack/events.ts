// The front door's handler for Slack's message events: posts, edits and deletions. Today's convex/slack/events.ts sent
// them to `receipts.receive`, which observed one and kept its receipt unless the engine ignored it; the front door keeps
// the receipt the same way, in the same transaction. A message that can't affect kudos is acknowledged and kept no
// receipt, as today. Today's thank-you nudge, which ran after it, comes with the nudge (S4's 4.7).
import { withholdingWords } from "../analytics/exceptions.ts";
import type { MutationContext } from "../operations.ts";
import type { EventCallback as FrontDoorEvent, Handled } from "./frontDoor.ts";
import { isMessage, mayAffectKudos, messageEventOf, type EventCallback } from "./normalize.ts";
import { processEvent } from "./processEvent.ts";

/** Takes a message event in: the engine observes it, and an event it ignores leaves no receipt. */
export const receiveMessage = withholdingWords(async (ctx: MutationContext, envelope: FrontDoorEvent): Promise<Handled> => {
  const callback = envelope as EventCallback;
  const event = messageEventOf(callback);
  if (isMessage(callback.event) && !mayAffectKudos(event)) return "ignored";
  const observation = await processEvent(ctx, event);
  return observation?.kind === "ignored" ? "ignored" : undefined;
});
