// The module map's skeleton of convex/welcome/welcome.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { hugGivenEventValidator, kudosGivenEventValidator, questFinishedEventValidator } from "../bus/events.ts";
import { type MemberId } from "../workspace/directory.ts";
import type { MondayWelcomeCause } from "./mondayWelcome.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const welcomeNewMembersArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });
export async function welcomeNewMembers(ctx: MutationContext, args: z.infer<typeof welcomeNewMembersArgs>): Promise<void> {
  throw notPorted("welcome.welcome.welcomeNewMembers");
}
export const welcomeNewMembersJob = mutationJob("welcome.welcome.welcomeNewMembers", welcomeNewMembersArgs, welcomeNewMembers);

export const welcomeOnHugArgs = z.strictObject({ event: hugGivenEventValidator });
export async function welcomeOnHug(ctx: MutationContext, args: z.infer<typeof welcomeOnHugArgs>): Promise<void> {
  throw notPorted("welcome.welcome.welcomeOnHug");
}
export const welcomeOnHugJob = mutationJob("welcome.welcome.welcomeOnHug", welcomeOnHugArgs, welcomeOnHug);

export const welcomeOnFirstThanksArgs = z.strictObject({ event: questFinishedEventValidator });
export async function welcomeOnFirstThanks(ctx: MutationContext, args: z.infer<typeof welcomeOnFirstThanksArgs>): Promise<void> {
  throw notPorted("welcome.welcome.welcomeOnFirstThanks");
}
export const welcomeOnFirstThanksJob = mutationJob("welcome.welcome.welcomeOnFirstThanks", welcomeOnFirstThanksArgs, welcomeOnFirstThanks);

export async function welcomeOnTheMondayPath(ctx: MutationContext, member: MemberId, cause: MondayWelcomeCause, at: number): Promise<void> {
  throw notPorted("welcome.welcome.welcomeOnTheMondayPath");
}

export async function isWelcomed(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("welcome.welcome.isWelcomed");
}

export function welcomeOf(ctx: QueryContext, member: MemberId): Promise<Doc<"welcomes"> | null> {
  throw notPorted("welcome.welcome.welcomeOf");
}
