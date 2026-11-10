// The module map's skeleton of convex/mondayDm/stop.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import type { MondayDmContent } from "./records.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type ShownMondayDm = { workspace: string; content: MondayDmContent; nudge: string | null; stopped: boolean };

export type PressedIn = { channel: string; ts: string } | undefined;

export function stopMondayQuests(ctx: MutationContext, workspace: string, member: MemberId, dm: Id<"mondayDms">, pressedIn: PressedIn): Promise<void> {
  throw notPorted("mondayDm.stop.stopMondayQuests");
}

export function resumeMondayQuests(ctx: MutationContext, workspace: string, member: MemberId, dm: Id<"mondayDms">, pressedIn: PressedIn): Promise<void> {
  throw notPorted("mondayDm.stop.resumeMondayQuests");
}

export const shownMondayDmArgs = z.strictObject({ dm: zv.id("mondayDms") });
export async function shownMondayDm(ctx: QueryContext, args: z.infer<typeof shownMondayDmArgs>): Promise<null | ShownMondayDm> {
  throw notPorted("mondayDm.stop.shownMondayDm");
}
