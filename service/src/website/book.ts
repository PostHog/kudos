// The book of achievements: each ladder's tiers with when they were earned and what they paid, and whether the book is
// open to the member yet. Today's convex/website/book.ts over the service's transaction.
import { bookFactsOf, type LadderFacts, type RewardFacts, type TierFacts } from "../achievements/achievements.ts";
import { bookAppliesIn } from "../achievements/flag.ts";
import type { LadderId, TierId } from "../achievements/ladders.ts";
import { dayZoneOf } from "../engine/allowance.ts";
import type { Art } from "../store/catalogue.ts";
import { storeVisibleTo } from "../store/visibility.ts";
import { coinsVisibleTo } from "../wallet/visibility.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { seenKeyOf } from "./seen.ts";
import { featurePageOf, unlockPathOf, type PageWaits } from "./unlockPath.ts";
import type { QueryContext } from "../operations.ts";

export type TierReward = { kind: "coins"; coins: number } | { kind: "kudosEmoji"; name: string; art: Art };

export type TierCard = { tier: TierId; name: string; at: number; earnedAt: number | null; seen: string | null; rewards: TierReward[] };

export type LadderCard = { ladder: LadderId; name: string; counts: string; count: number; tiers: TierCard[]; next: { tier: TierId; at: number } | null };

export type BookAnswer = NotFound | PageWaits | { kind: "book"; ladders: LadderCard[]; timeZone: string };

export type BookPage = NotFound | PageWaits | { kind: "open" };

type NotFound = { kind: "not-found" };

const notFound: NotFound = { kind: "not-found" };

/** The book of achievements: today's `getBook`, for a member the website has already verified. */
export async function getBook(ctx: QueryContext, me: VerifiedMember): Promise<BookAnswer> {
  const page = await bookPageOf(ctx, me);
  if (page.kind !== "open") return page;
  const facts = await bookFactsOf(ctx, me.member);
  const shown = { member: me.member, coins: await coinsVisibleTo(ctx, me.member), store: await storeVisibleTo(ctx, me.member) };
  return { kind: "book", ladders: await Promise.all(facts.ladders.map((ladder) => ladderCardOf(ladder, shown))), timeZone: await timeZoneOf(ctx, me) };
}

export async function bookPageOf(ctx: QueryContext, me: VerifiedMember): Promise<BookPage> {
  const page = featurePageOf(await unlockPathOf(ctx, me), "book");
  if (page.kind === "off") return notFound;
  if (page.kind !== "open") return page;
  return (await bookAppliesIn(ctx, me.workspace)) ? page : notFound;
}

type Shown = { member: MemberId; coins: boolean; store: boolean };

async function ladderCardOf({ ladder, name, counts, count, tiers, next }: LadderFacts, shown: Shown): Promise<LadderCard> {
  const cards = await Promise.all(tiers.map((tier) => tierCardOf(ladder, tier, shown)));
  const nextCard = cards.find(({ tier }) => tier === next);
  return { ladder, name, counts, count, tiers: cards, next: nextCard === undefined ? null : { tier: nextCard.tier, at: nextCard.at } };
}

async function tierCardOf(ladder: LadderId, { tier, name, count: at, earnedAt, rewards }: TierFacts, shown: Shown): Promise<TierCard> {
  const seen = earnedAt === null ? null : await seenKeyOf(shown.member, `tier:${ladder}:${tier}:${earnedAt}`);
  return { tier, name, at, earnedAt, seen, rewards: rewards.flatMap((reward) => rewardShown(reward, shown)) };
}

function rewardShown(reward: RewardFacts, shown: Shown): TierReward[] {
  if (reward.kind === "coins" && shown.coins) return [{ kind: "coins", coins: reward.coins }];
  if (reward.kind === "kudosEmoji" && shown.store) return [{ kind: "kudosEmoji", name: reward.item.name, art: reward.item.art }];
  return [];
}

async function timeZoneOf(ctx: QueryContext, { workspace, user }: VerifiedMember): Promise<string> {
  const person = await lookup(ctx, workspace, user);
  return dayZoneOf(person?.kind === "member" ? person.timeZone : undefined);
}
