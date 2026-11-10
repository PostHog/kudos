// The module map's skeleton of convex/feedback/beside.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { messageRefValidator } from "../engine/messageEvent.ts";
import type { MessagePlace } from "../messageSettings/kinds.ts";
import { notificationValidator } from "./notify.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Beside = { conversation: string; threadRoot?: string };

export type Destination = Beside | Exclude<MessagePlace, "channel">;

export const placeBesideTheKudosArgs = z.strictObject({ member: zv.id("members"), notification: notificationValidator, kudos: messageRefValidator });
export async function placeBesideTheKudos(ctx: QueryContext, args: z.infer<typeof placeBesideTheKudosArgs>): Promise<"dm" | "none" | Beside> {
  throw notPorted("feedback.beside.placeBesideTheKudos");
}
