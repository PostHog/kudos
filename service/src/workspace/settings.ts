// A workspace's settings with their defaults, its welcome nudge switch and its announcement channel. Today's
// convex/workspace/settings.ts over the service's transaction.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { emojiNameOf } from "./settingsBounds.ts";
import type { Doc } from "../db/schema/index.ts";
import { welcomeNudgeSwitches, workspaces } from "../db/schema/index.ts";
import { indexOrder } from "../db/indexOrder.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { xpLevelsShownIn } from "../progression/xpLevels.ts";
import { republishAdminsInJob } from "../feedback/homes.ts";
import { zv } from "../values.ts";
import { insertRow, patchRow, uniqueRow } from "./rows.ts";

export type WorkspaceSettings = { baseAllowance: number; kudosEmoji: string; announcementChannel: string | null };

const defaultBaseAllowance = 3;
const fallbackKudosEmoji = "taco";
const defaultHugBudget = 10;

export async function settingsOf(ctx: QueryContext, workspace: string): Promise<WorkspaceSettings> {
  const row = await workspaceRow(ctx, workspace);
  return {
    baseAllowance: row?.baseAllowance ?? defaultBaseAllowance,
    kudosEmoji: row?.kudosEmoji ?? defaultKudosEmoji(),
    announcementChannel: row?.announcementChannel ?? null,
  };
}

export async function hugBudgetOf(ctx: QueryContext, workspace: string): Promise<number> {
  return (await workspaceRow(ctx, workspace))?.hugBudget ?? defaultHugBudget;
}

export async function welcomeNudgeOn(ctx: QueryContext, workspace: string): Promise<boolean> {
  return (await welcomeNudgeSwitchIn(ctx, workspace))?.on ?? true;
}

export async function saveWelcomeNudge(ctx: MutationContext, workspace: string, on: boolean): Promise<void> {
  const saved = await welcomeNudgeSwitchIn(ctx, workspace);
  if (saved === null) await insertRow(ctx, welcomeNudgeSwitches, { workspace, on });
  else await patchRow(ctx, welcomeNudgeSwitches, saved._id, { on });
}

const welcomeNudgeByWorkspace = indexOrder(welcomeNudgeSwitches, ["workspace"]);

function welcomeNudgeSwitchIn(ctx: QueryContext, workspace: string) {
  return uniqueRow<Doc<"welcomeNudgeSwitches">>(ctx, welcomeNudgeSwitches, eq(welcomeNudgeSwitches.workspace, workspace), welcomeNudgeByWorkspace);
}

/** An operator's: the hugs each member of the workspace gives on their day. */
export const setHugBudgetArgs = z.strictObject({ workspace: z.string(), hugBudget: zv.number() });
export async function setHugBudget(ctx: MutationContext, { workspace, hugBudget }: z.infer<typeof setHugBudgetArgs>): Promise<void> {
  if (!Number.isInteger(hugBudget) || hugBudget < 0) throw new Error("A hug budget is a whole number of hugs, 0 or more");
  const row = await workspaceRow(ctx, workspace);
  if (row === null) throw new Error(`Kudos knows no workspace ${workspace}`);
  await patchRow(ctx, workspaces, row._id, { hugBudget });
}

/** An operator's: the announcement channel, picked or cleared where no admin can pick it in App Home. */
export const pickAnnouncementChannelArgs = z.strictObject({ workspace: z.string(), channel: z.union([z.string(), z.null()]) });
export async function pickAnnouncementChannel(ctx: MutationContext, { workspace, channel }: z.infer<typeof pickAnnouncementChannelArgs>): Promise<boolean> {
  if ((await workspaceRow(ctx, workspace)) === null) throw new Error(`Kudos knows no workspace ${workspace}`);
  return announceIn(ctx, workspace, channel);
}

export async function setAnnouncementChannel(ctx: MutationContext, workspace: string, person: { admin: boolean }, channel: string | null): Promise<void> {
  if (person.admin) await announceIn(ctx, workspace, channel);
}

async function announceIn(ctx: MutationContext, workspace: string, channel: string | null): Promise<boolean> {
  if (!(await xpLevelsShownIn(ctx, workspace))) return false;
  await saveWorkspaceSettings(ctx, workspace, { announcementChannel: channel ?? undefined });
  await ctx.jobs.enqueue(republishAdminsInJob, { workspace });
  return true;
}

export async function saveWorkspaceSettings(ctx: MutationContext, workspace: string, settings: Partial<Omit<Doc<"workspaces">, "_id" | "_creationTime" | "workspace">>): Promise<void> {
  const row = await workspaceRow(ctx, workspace);
  if (row === null) await insertRow(ctx, workspaces, { workspace, ...settings });
  else await patchRow(ctx, workspaces, row._id, settings);
}

const workspaceByWorkspace = indexOrder(workspaces, ["workspace"]);

/** The workspace's one settings row, or `null`. */
export function workspaceRow(ctx: QueryContext, workspace: string): Promise<Doc<"workspaces"> | null> {
  return uniqueRow<Doc<"workspaces">>(ctx, workspaces, eq(workspaces.workspace, workspace), workspaceByWorkspace);
}

export function defaultKudosEmoji() {
  return emojiNameOf(process.env.KUDOS_EMOJI ?? "") || fallbackKudosEmoji;
}
