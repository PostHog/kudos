// The module map's skeleton of convex/slack/rateLimits.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

const methodArgs = { workspace: z.string(), method: z.string() };

export const heldUntilArgs = z.strictObject(methodArgs);
export async function heldUntil(ctx: QueryContext, args: z.infer<typeof heldUntilArgs>): Promise<number> {
  throw notPorted("slack.rateLimits.heldUntil");
}

export const holdArgs = z.strictObject({ ...methodArgs, until: zv.number() });
export async function hold(ctx: MutationContext, args: z.infer<typeof holdArgs>): Promise<void> {
  throw notPorted("slack.rateLimits.hold");
}
