// The Monday DM's Stop and Turn-back-on buttons, as today's convex/mondayDm/stop.ts: a press moves the member's quests
// message setting and, pressed in the DM itself, redraws that DM to show where it now stands.
import { z } from "zod";
import { reportMessageSettingChanged } from "../analytics/isolatedUsage.ts";
import type { Id } from "../db/columns.ts";
import type { MessagePlace } from "../messageSettings/kinds.ts";
import { placeOf, setMessageSetting } from "../messageSettings/messageSettings.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { onTheMondayPath } from "../quests/flag.ts";
import { showMondayDmJob } from "../slack/mondayDm.ts";
import { zv } from "../values.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import { hypeNudgeOf } from "./hypeNudge.ts";
import type { MondayDmContent } from "./records.ts";
import { mondayDmRow } from "./rows.ts";

export type ShownMondayDm = { workspace: string; content: MondayDmContent; nudge: string | null; stopped: boolean };

export type PressedIn = { channel: string; ts: string } | undefined;

export function stopMondayQuests(ctx: MutationContext, workspace: string, member: MemberId, dm: Id<"mondayDms">, pressedIn: PressedIn): Promise<void> {
  return placeMondayQuests(ctx, workspace, member, dm, "none", pressedIn);
}

export function resumeMondayQuests(ctx: MutationContext, workspace: string, member: MemberId, dm: Id<"mondayDms">, pressedIn: PressedIn): Promise<void> {
  return placeMondayQuests(ctx, workspace, member, dm, "dm", pressedIn);
}

export const shownMondayDmArgs = z.strictObject({ dm: zv.id("mondayDms") });
export async function shownMondayDm(ctx: QueryContext, { dm }: z.infer<typeof shownMondayDmArgs>): Promise<null | ShownMondayDm> {
  const row = await mondayDmRow(ctx.tx, dm);
  if (row?.content === undefined) return null;
  const { workspace } = await chatUserOf(ctx, row.member);
  return { workspace, content: row.content, nudge: await hypeNudgeOf(ctx, dm), stopped: (await placeOf(ctx, row.member, "quests")) === "none" };
}

async function placeMondayQuests(ctx: MutationContext, workspace: string, member: MemberId, dm: Id<"mondayDms">, place: MessagePlace, pressedIn: PressedIn): Promise<void> {
  const row = await mondayDmRow(ctx.tx, dm);
  if (row?.member !== member || !(await onTheMondayPath(ctx, member))) return;
  if (await setMessageSetting(ctx, member, "quests", place)) await reportMessageSettingChanged(ctx, { workspace, member, setting: "quests", on: place !== "none", place, via: "dm-button", at: ctx.now });
  if (pressedIn !== undefined) await ctx.jobs.enqueue(showMondayDmJob, { dm, ...pressedIn }, { after: 0 });
}
