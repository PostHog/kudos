// Where a notice caused by a kudos goes, as today's convex/feedback/beside.ts.
import { messageRefValidator } from "../engine/messageEvent.ts";
import type { MessagePlace } from "../messageSettings/kinds.ts";
import { placeOf } from "../messageSettings/messageSettings.ts";
import { threadRootOf } from "../engine/engine.ts";
import { messageKindOfNotification, notificationValidator } from "./notify.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { QueryContext } from "../operations.ts";

export type Beside = { conversation: string; threadRoot?: string };

export type Destination = Beside | Exclude<MessagePlace, "channel">;

export const placeBesideTheKudosArgs = z.strictObject({ member: zv.id("members"), notification: notificationValidator, kudos: messageRefValidator });
/** Where a notice caused by a kudos goes: the member's chosen place, or beside the kudos, in its thread when it has one. */
export async function placeBesideTheKudos(ctx: QueryContext, { member, notification, kudos }: z.infer<typeof placeBesideTheKudosArgs>): Promise<Destination> {
  const place = await placeOf(ctx, member, messageKindOfNotification(notification));
  if (place !== "channel") return place;
  const threadRoot = await threadRootOf(ctx, kudos);
  return { conversation: kudos.conversation, ...(threadRoot !== null && { threadRoot }) };
}
