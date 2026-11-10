// The module map's skeleton of convex/analytics/boundary.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { exceptionValidator } from "./exceptions.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

type Observation = { carriesWords?: boolean };

const observedFunctions = new WeakSet<object>();

export function observedHttpAction(handler: (ctx: ActionContext, request: Request) => Promise<Response>, observation: Observation = {}): { isHttp: true } {
  throw notPorted("analytics.boundary.observedHttpAction");
}

export function isObserved(fn: unknown) {
  return observedFunctions.has(fn as object);
}

export const recordBoundaryExceptionArgs = z.strictObject({
    failed: z.strictObject({ path: z.string(), kind: z.union([z.literal("http"), z.literal("action")]) }),
    exception: exceptionValidator,
    job: z.union([zv.id("_scheduled_functions"), z.null()]),
  });
export async function recordBoundaryException(ctx: MutationContext, args: z.infer<typeof recordBoundaryExceptionArgs>): Promise<boolean> {
  throw notPorted("analytics.boundary.recordBoundaryException");
}

export function functionPathOf(name: string) {
  return name.replace(/\.js:/, ":");
}
