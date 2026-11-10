// The module map's skeleton of convex/slack/appHome.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { homeRefusalValidator } from "../feedback/homeRefusal.ts";
import { attemptArgs } from "./delivery.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export type HomeOpened = { type: "app_home_opened"; user: string; tab: "home" | "messages" };

export function isHomeTabOpened(event: { type: string }): event is HomeOpened {
  return event.type === "app_home_opened" && (event as HomeOpened).tab === "home";
}

type Opening = { workspace: string; user: string; at: number };

export async function reportHomeOpened(ctx: MutationContext, { workspace, user, at }: Opening): Promise<"reported" | "unknown-person"> {
  throw notPorted("slack.appHome.reportHomeOpened");
}

export const reportLookedUpHomeOpeningArgs = z.strictObject({ workspace: z.string(), user: z.string(), at: zv.number() });
export async function reportLookedUpHomeOpening(ctx: MutationContext, args: z.infer<typeof reportLookedUpHomeOpeningArgs>): Promise<void> {
  throw notPorted("slack.appHome.reportLookedUpHomeOpening");
}

export const publishHomeArgs = z.strictObject({ workspace: z.string(), user: z.string(), opened: z.optional(z.boolean()), refused: z.optional(homeRefusalValidator), unreportedOpeningAt: z.optional(zv.number()), ...attemptArgs });
export async function publishHome(ctx: ActionContext, args: z.infer<typeof publishHomeArgs>): Promise<void> {
  throw notPorted("slack.appHome.publishHome");
}
export const publishHomeJob = actionJob("slack.appHome.publishHome", publishHomeArgs, publishHome);
