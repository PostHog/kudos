// The module map's skeleton of convex/website/book.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { LadderId, TierId } from "../achievements/ladders.ts";
import type { Art } from "../store/catalogue.ts";
import { type VerifiedMember } from "./memberQuery.ts";
import { type PageWaits } from "./unlockPath.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type TierReward = { kind: "coins"; coins: number } | { kind: "kudosEmoji"; name: string; art: Art };

export type TierCard = { tier: TierId; name: string; at: number; earnedAt: number | null; seen: string | null; rewards: TierReward[] };

export type LadderCard = { ladder: LadderId; name: string; counts: string; count: number; tiers: TierCard[]; next: { tier: TierId; at: number } | null };

export type BookAnswer = NotFound | PageWaits | { kind: "book"; ladders: LadderCard[]; timeZone: string };

export type BookPage = NotFound | PageWaits | { kind: "open" };

type NotFound = { kind: "not-found" };

export async function bookPageOf(ctx: QueryContext, me: VerifiedMember): Promise<BookPage> {
  throw notPorted("website.book.bookPageOf");
}
