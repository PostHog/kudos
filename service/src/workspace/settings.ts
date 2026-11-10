// The module map's skeleton of convex/workspace/settings.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { emojiNameOf } from "./settingsBounds.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type WorkspaceSettings = { baseAllowance: number; kudosEmoji: string; announcementChannel: string | null };
const fallbackKudosEmoji = "taco";

export async function settingsOf(ctx: QueryContext, workspace: string): Promise<WorkspaceSettings> {
  throw notPorted("workspace.settings.settingsOf");
}

export async function hugBudgetOf(ctx: QueryContext, workspace: string): Promise<number> {
  throw notPorted("workspace.settings.hugBudgetOf");
}

export async function welcomeNudgeOn(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("workspace.settings.welcomeNudgeOn");
}

export async function saveWelcomeNudge(ctx: MutationContext, workspace: string, on: boolean): Promise<void> {
  throw notPorted("workspace.settings.saveWelcomeNudge");
}

export async function setAnnouncementChannel(ctx: MutationContext, workspace: string, person: { admin: boolean }, channel: string | null): Promise<void> {
  throw notPorted("workspace.settings.setAnnouncementChannel");
}

export async function saveWorkspaceSettings(ctx: MutationContext, workspace: string, settings: Partial<Omit<Doc<"workspaces">, "_id" | "_creationTime" | "workspace">>): Promise<void> {
  throw notPorted("workspace.settings.saveWorkspaceSettings");
}

export function defaultKudosEmoji() {
  return emojiNameOf(process.env.KUDOS_EMOJI ?? "") || fallbackKudosEmoji;
}
