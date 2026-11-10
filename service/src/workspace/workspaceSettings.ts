// The module map's skeleton of convex/workspace/workspaceSettings.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import { type MemberId } from "./directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const workspaceSettingsFlag = { key: "workspace-settings", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type EditableSettings = { baseAllowance: number; kudosEmoji: string; hugBudget: number };

export type WorkspaceSettingsPart = EditableSettings & { kudosEmojiImage: string | null };

export type WorkspaceSettingsRefusal = "not-maintainer" | "allowance" | "kudos-emoji" | "hug-budget";

export type WorkspaceSettingsOutcome = { kind: "set"; saved: EditableSettings } | { kind: "refused"; reason: WorkspaceSettingsRefusal; saved: null };

export async function workspaceSettingsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("workspace.workspaceSettings.workspaceSettingsShownTo");
}

export async function workspaceSettingsPartOf(ctx: QueryContext, workspace: string): Promise<WorkspaceSettingsPart> {
  throw notPorted("workspace.workspaceSettings.workspaceSettingsPartOf");
}

export async function changeWorkspaceSettings(ctx: MutationContext, workspace: string, member: MemberId, change: EditableSettings): Promise<WorkspaceSettingsOutcome | null> {
  throw notPorted("workspace.workspaceSettings.changeWorkspaceSettings");
}

export async function maintainerSettingsApplyTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("workspace.workspaceSettings.maintainerSettingsApplyTo");
}

export async function isTheMaintainer(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("workspace.workspaceSettings.isTheMaintainer");
}
