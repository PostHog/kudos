// The module map's skeleton of convex/workspace/celebrationsSwitch.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import type { MemberId } from "./directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const celebrationsSwitchFlag = { key: "celebrations-switch", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

type Switcher = { member: MemberId; admin: boolean };

export async function publicCelebrationsOn(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("workspace.celebrationsSwitch.publicCelebrationsOn");
}

export async function celebrationsSwitchShownTo(ctx: MutationContext, workspace: string, person: Switcher): Promise<boolean | null> {
  throw notPorted("workspace.celebrationsSwitch.celebrationsSwitchShownTo");
}

export async function celebrationsSwitchReadIn(ctx: QueryContext, workspace: string): Promise<boolean | null> {
  throw notPorted("workspace.celebrationsSwitch.celebrationsSwitchReadIn");
}

export async function setPublicCelebrations(ctx: MutationContext, workspace: string, person: Switcher, on: boolean): Promise<boolean> {
  throw notPorted("workspace.celebrationsSwitch.setPublicCelebrations");
}
