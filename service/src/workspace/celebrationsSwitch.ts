// The workspace's switch for public celebrations, behind celebrations-switch: an admin or the maintainer turns it.
// Today's convex/workspace/celebrationsSwitch.ts over the service's transaction.
import { eq } from "drizzle-orm";
import { exposed, workspaceDecision, type Flag } from "../analytics/flags.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { celebrationsSwitches, type Doc } from "../db/schema/index.ts";
import type { MemberId } from "./directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { insertRow, patchRow, uniqueRow } from "./rows.ts";
import { maintainerSettingsApplyTo } from "./workspaceSettings.ts";

export const celebrationsSwitchFlag = { key: "celebrations-switch", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

type Switcher = { member: MemberId; admin: boolean };

export async function publicCelebrationsOn(ctx: QueryContext, workspace: string): Promise<boolean> {
  if (!(await workspaceDecision(ctx, celebrationsSwitchFlag, workspace))) return true;
  return storedSwitchOn(ctx, workspace);
}

export async function celebrationsSwitchShownTo(ctx: MutationContext, workspace: string, person: Switcher): Promise<boolean | null> {
  if (!(await switchesCelebrations(ctx, workspace, person))) return null;
  return storedSwitchOn(ctx, workspace);
}

export async function celebrationsSwitchReadIn(ctx: QueryContext, workspace: string): Promise<boolean | null> {
  if (!(await workspaceDecision(ctx, celebrationsSwitchFlag, workspace))) return null;
  return storedSwitchOn(ctx, workspace);
}

export async function setPublicCelebrations(ctx: MutationContext, workspace: string, person: Switcher, on: boolean): Promise<boolean> {
  if (!(await switchesCelebrations(ctx, workspace, person))) return false;
  const stored = await switchIn(ctx, workspace);
  if ((stored?.on ?? true) === on) return false;
  if (stored === null) await insertRow(ctx, celebrationsSwitches, { workspace, on });
  else await patchRow(ctx, celebrationsSwitches, stored._id, { on });
  return true;
}

async function switchesCelebrations(ctx: MutationContext, workspace: string, { member, admin }: Switcher) {
  if (!admin && !(await maintainerSettingsApplyTo(ctx, member))) return false;
  const applies = await workspaceDecision(ctx, celebrationsSwitchFlag, workspace);
  await exposed(ctx, celebrationsSwitchFlag, member, applies);
  return applies;
}

async function storedSwitchOn(ctx: QueryContext, workspace: string) {
  return (await switchIn(ctx, workspace))?.on ?? true;
}

const byWorkspace = indexOrder(celebrationsSwitches, ["workspace"]);

function switchIn(ctx: QueryContext, workspace: string) {
  return uniqueRow<Doc<"celebrationsSwitches">>(ctx, celebrationsSwitches, eq(celebrationsSwitches.workspace, workspace), byWorkspace);
}
