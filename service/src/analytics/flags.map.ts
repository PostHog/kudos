// The module map's skeleton of what S1 left of convex/analytics/flags.ts, written by tools/rewrite/moduleMap/skeleton.ts. S1's
// service/src/analytics/flags.ts re-exports it; its stubs throw notPorted until the stack that owns the module ports their bodies.
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";
import type { Flag } from "./flags.ts";

type FlagValue = string | boolean;

export async function exposedApart<V extends FlagValue>(ctx: MutationContext, read: Flag<V>, member: MemberId, value: NoInfer<V>): Promise<void> {
  throw notPorted("analytics.flags.exposedApart");
}

const exposureValidator = { member: zv.id("members"), flag: z.string(), value: z.union([z.string(), z.boolean()]) };

export const recordExposureArgs = z.strictObject(exposureValidator);
export async function recordExposure(ctx: MutationContext, args: z.infer<typeof recordExposureArgs>): Promise<void> {
  throw notPorted("analytics.flags.recordExposure");
}
export const recordExposureJob = mutationJob("analytics.flags.recordExposure", recordExposureArgs, recordExposure);
