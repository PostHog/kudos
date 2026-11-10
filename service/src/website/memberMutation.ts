// Today's member check for a website command: the member a read would verify, admitted by the website flag, which
// records their analytics ID and exposure and runs their first visit's due moments. Today's
// convex/website/memberMutation.ts.
import type { MutationContext } from "../operations.ts";
import type { Identity } from "./api/transport.ts";
import { websiteAdmits } from "./flag.ts";
import { verifiedMember, type Denial, type Verified } from "./memberQuery.ts";

/** The member the website admits for a command; otherwise the denial a command answers. */
export async function admittedMember(ctx: MutationContext, identity: Identity): Promise<Verified | Denial> {
  const verified = await verifiedMember(ctx, identity);
  if ("kind" in verified) return verified;
  if (!(await websiteAdmits(ctx, verified.me.member))) return { kind: "closed" };
  return verified;
}
