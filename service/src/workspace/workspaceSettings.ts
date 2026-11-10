// The maintainer's workspace settings: the daily allowance, the kudos emoji and the hug budget, which only the member
// KUDOS_MAINTAINER names changes, while workspace-settings is on for them. Today's convex/workspace/workspaceSettings.ts.
import { exposed, memberDecision, type Flag } from "../analytics/flags.ts";
import { customEmojiImageOf } from "./customEmoji.ts";
import { chatUserOf, type MemberId } from "./directory.ts";
import { hugBudgetOf, saveWorkspaceSettings, settingsOf } from "./settings.ts";
import { allowanceRange, emojiNameOf, hugBudgetRange } from "./settingsBounds.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const workspaceSettingsFlag = { key: "workspace-settings", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type EditableSettings = { baseAllowance: number; kudosEmoji: string; hugBudget: number };

export type WorkspaceSettingsPart = EditableSettings & { kudosEmojiImage: string | null };

export type WorkspaceSettingsRefusal = "not-maintainer" | "allowance" | "kudos-emoji" | "hug-budget";

export type WorkspaceSettingsOutcome = { kind: "set"; saved: EditableSettings } | { kind: "refused"; reason: WorkspaceSettingsRefusal; saved: null };

const emojiName = /^[a-z0-9_+'-]{1,100}$/;

export async function workspaceSettingsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await isTheMaintainer(ctx, member)) && (await memberDecision(ctx, workspaceSettingsFlag, member));
}

export async function workspaceSettingsPartOf(ctx: QueryContext, workspace: string): Promise<WorkspaceSettingsPart> {
  const { baseAllowance, kudosEmoji } = await settingsOf(ctx, workspace);
  return { baseAllowance, kudosEmoji, kudosEmojiImage: (await customEmojiImageOf(ctx, workspace, kudosEmoji)) ?? null, hugBudget: await hugBudgetOf(ctx, workspace) };
}

export async function changeWorkspaceSettings(ctx: MutationContext, workspace: string, member: MemberId, change: EditableSettings): Promise<WorkspaceSettingsOutcome | null> {
  if (!(await isTheMaintainer(ctx, member))) return refusedFor("not-maintainer");
  if (!(await workspaceSettingsApplyTo(ctx, member))) return null;
  const settings = { ...change, kudosEmoji: emojiNameOf(change.kudosEmoji) };
  const refusal = refusalOf(settings);
  if (refusal !== null) return refusedFor(refusal);
  await saveWorkspaceSettings(ctx, workspace, settings);
  return { kind: "set", saved: settings };
}

export async function maintainerSettingsApplyTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  return (await isTheMaintainer(ctx, member)) && (await workspaceSettingsApplyTo(ctx, member));
}

async function workspaceSettingsApplyTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const applies = await memberDecision(ctx, workspaceSettingsFlag, member);
  await exposed(ctx, workspaceSettingsFlag, member, applies);
  return applies;
}

export async function isTheMaintainer(ctx: QueryContext, member: MemberId): Promise<boolean> {
  const maintainer = process.env.KUDOS_MAINTAINER?.trim();
  return maintainer !== undefined && maintainer !== "" && (await chatUserOf(ctx, member)).user === maintainer;
}

function refusalOf({ baseAllowance, kudosEmoji, hugBudget }: EditableSettings): WorkspaceSettingsRefusal | null {
  if (!isWithin(baseAllowance, allowanceRange)) return "allowance";
  if (!emojiName.test(kudosEmoji)) return "kudos-emoji";
  if (!isWithin(hugBudget, hugBudgetRange)) return "hug-budget";
  return null;
}

function isWithin(value: number, { least, most }: { least: number; most: number }) {
  return Number.isInteger(value) && value >= least && value <= most;
}

function refusedFor(reason: WorkspaceSettingsRefusal): WorkspaceSettingsOutcome {
  return { kind: "refused", reason, saved: null };
}
