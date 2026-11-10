// The module map's skeleton of convex/website/memberQuery.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { HomeMember } from "../feedback/homes.ts";
import { type MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Denial = { kind: "closed" } | { kind: "signed-out" } | { kind: "verifying" } | { kind: "unverified" } | { kind: "not-a-member" };

export type VerifiedMember = {
  member: MemberId;
  workspace: string;
  user: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  image?: string;
};

export type Verified = { me: VerifiedMember; person: HomeMember };

type MemberHandler<Args, Result> = (ctx: QueryContext, me: VerifiedMember, args: Args) => Promise<Result>;
export function memberQuery(definition: MemberHandler<never, unknown> | { args: z.ZodRawShape; handler: MemberHandler<never, unknown> }): { isConvexFunction: true; isQuery: true } & { _visibility: "public" } & { isPublic: true } {
  throw notPorted("website.memberQuery.memberQuery");
}

export async function verifiedMember(ctx: QueryContext): Promise<Verified | Denial> {
  throw notPorted("website.memberQuery.verifiedMember");
}
