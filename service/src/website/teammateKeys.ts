// The module map's skeleton of convex/website/teammateKeys.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ChatUserId } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { seenKeyOf } from "./seen.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export function teammateKeyOf(me: VerifiedMember, teammate: MemberId): Promise<string> {
  return seenKeyOf(me.member, `member:${teammate}`);
}

export async function teammateOfKey(ctx: QueryContext, me: VerifiedMember, key: string): Promise<MemberId | null> {
  throw notPorted("website.teammateKeys.teammateOfKey");
}

export function listedMemberKeyOf(me: VerifiedMember, user: ChatUserId): Promise<string> {
  return seenKeyOf(me.member, `listed:${user}`);
}

export async function listedMemberOfKey(ctx: QueryContext, me: VerifiedMember, key: string): Promise<ChatUserId | null> {
  throw notPorted("website.teammateKeys.listedMemberOfKey");
}
