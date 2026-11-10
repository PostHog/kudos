// The module map's skeleton of convex/feedback/welcome.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type GroupId, type GroupRef } from "../groups/groups.ts";
import { welcomedAsValidator, type WelcomedAs } from "../welcome/welcomedAs.ts";
import { type MemberId } from "../workspace/directory.ts";
import { type DeepLink } from "./deepLinks.ts";
import type { Line } from "./segments.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type WelcomeMessage = { greeting: Line[]; allowance: string; website: { line: string; link: DeepLink } | null; openAppHome: string };

export type WelcomeGroups = { lines: string[]; picker: { groups: GroupRef[]; primary: GroupId } | null };

export async function requestWelcome(ctx: MutationContext, member: MemberId, welcomed: WelcomedAs): Promise<void> {
  throw notPorted("feedback.welcome.requestWelcome");
}

export const welcomeMessageArgs = z.strictObject({ workspace: z.string(), user: z.string(), welcomed: z.optional(welcomedAsValidator) });
export async function welcomeMessage(ctx: QueryContext, args: z.infer<typeof welcomeMessageArgs>): Promise<WelcomeMessage> {
  throw notPorted("feedback.welcome.welcomeMessage");
}

export const welcomePickValidator = z.strictObject({ group: zv.id("userGroups"), saved: z.boolean() });

type WelcomePick = z.infer<typeof welcomePickValidator>;

export async function welcomePickOf(ctx: MutationContext, member: MemberId, picked: string): Promise<WelcomePick | null> {
  throw notPorted("feedback.welcome.welcomePickOf");
}

export const welcomeGroupsOfArgs = z.strictObject({ workspace: z.string(), user: z.string(), pick: z.optional(welcomePickValidator) });
export async function welcomeGroupsOf(ctx: MutationContext, args: z.infer<typeof welcomeGroupsOfArgs>): Promise<null | WelcomeGroups> {
  throw notPorted("feedback.welcome.welcomeGroupsOf");
}
