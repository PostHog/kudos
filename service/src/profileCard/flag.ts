// The `profile-card` flag: whether a member sees profile cards, and its exposure. Today's convex/profileCard/flag.ts.
import { exposed, memberDecision, memberDecisionWithoutWriting, workspaceDecision, type Flag } from "../analytics/flags.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export const profileCardFlag = { key: "profile-card", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function isProfileCardShownTo(ctx: MutationContext, workspace: string, member: MemberId | undefined): Promise<boolean> {
  if (member === undefined) return workspaceDecision(ctx, profileCardFlag, workspace);
  const shown = await memberDecision(ctx, profileCardFlag, member);
  await exposed(ctx, profileCardFlag, member, shown);
  return shown;
}

export function profileCardOpenTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, profileCardFlag, member);
}

export const exposeProfileCardArgs = z.strictObject({ workspace: z.string(), user: z.string(), shown: z.boolean() });
export async function exposeProfileCard(ctx: MutationContext, { workspace, user }: z.infer<typeof exposeProfileCardArgs>): Promise<void> {
  const person = await lookup(ctx, workspace, user);
  if (person?.kind === "member") await isProfileCardShownTo(ctx, workspace, person.member);
}
export const exposeProfileCardJob = mutationJob("profileCard.flag.exposeProfileCard", exposeProfileCardArgs, exposeProfileCard);
