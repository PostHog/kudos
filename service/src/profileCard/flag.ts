// The module map's skeleton of convex/profileCard/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const profileCardFlag = { key: "profile-card", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function isProfileCardShownTo(ctx: MutationContext, workspace: string, member: MemberId | undefined): Promise<boolean> {
  throw notPorted("profileCard.flag.isProfileCardShownTo");
}

export function profileCardOpenTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("profileCard.flag.profileCardOpenTo");
}

export const exposeProfileCardArgs = z.strictObject({ workspace: z.string(), user: z.string(), shown: z.boolean() });
export async function exposeProfileCard(ctx: MutationContext, args: z.infer<typeof exposeProfileCardArgs>): Promise<void> {
  throw notPorted("profileCard.flag.exposeProfileCard");
}
export const exposeProfileCardJob = mutationJob("profileCard.flag.exposeProfileCard", exposeProfileCardArgs, exposeProfileCard);
