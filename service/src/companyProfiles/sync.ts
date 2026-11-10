// The module map's skeleton of convex/companyProfiles/sync.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

const companyProfile = z.strictObject({
  profile: zv.number(),
  firstName: z.string(),
  lastName: z.string(),
  normalisedName: z.string(),
  image: z.optional(z.string()),
  colour: z.string(),
  teams: z.array(z.string()),
  role: z.optional(z.string()),
});

const companyTeam = z.strictObject({
  team: z.string(),
  name: z.string(),
  crestImage: z.optional(z.string()),
  leads: z.array(zv.number()),
  people: z.array(zv.number()),
});

export const syncCompanyProfilesArgs = z.strictObject({});
export async function syncCompanyProfiles(ctx: ActionContext, args: z.infer<typeof syncCompanyProfilesArgs>): Promise<null> {
  throw notPorted("companyProfiles.sync.syncCompanyProfiles");
}
export const syncCompanyProfilesJob = actionJob("companyProfiles.sync.syncCompanyProfiles", syncCompanyProfilesArgs, syncCompanyProfiles);

export const replaceCompanyProfilesArgs = z.strictObject({ asOf: zv.number(), profiles: z.array(companyProfile), teams: z.array(companyTeam) });
export async function replaceCompanyProfiles(ctx: MutationContext, args: z.infer<typeof replaceCompanyProfilesArgs>): Promise<void> {
  throw notPorted("companyProfiles.sync.replaceCompanyProfiles");
}
