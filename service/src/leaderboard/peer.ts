// The module map's skeleton of convex/leaderboard/peer.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type GroupRef } from "../groups/groups.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { KudosByMember } from "./rankedBoard.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Peer = { percent: number; group: GroupRef };

export type Gains = { now: KudosByMember; before: KudosByMember };

const fewestOtherMembers = 3;

export function peerPercent(gain: number, othersGains: number[]): number | null {
  if (gain <= 0 || othersGains.length < fewestOtherMembers) return null;
  const smaller = othersGains.filter((other) => other < gain).length;
  if (smaller * 2 <= othersGains.length) return null;
  return Math.floor((smaller * 10) / othersGains.length) * 10;
}

export async function peerOf(ctx: QueryContext, viewer: MemberId, { now, before }: Gains): Promise<Peer | null> {
  throw notPorted("leaderboard.peer.peerOf");
}
