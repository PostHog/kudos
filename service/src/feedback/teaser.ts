// The teaser on the member's App Home profile: the items that wait for them and the kudos that came in since their last
// visit. Ported from convex/feedback/teaser.ts.
import { kudosDecidedAfter } from "../engine/awards.ts";
import { hiddenItemsShownTo, teasersShownTo } from "../album/items/flag.ts";
import { waitingCountOf, type WaitingCount } from "../album/items/ledger.ts";
import { lastVisitOf } from "../website/lastVisit.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

const mostKudosCounted = 50;

type KudosCount = number | `${typeof mostKudosCounted}+`;

/** What the teaser reads: the items that wait, and the kudos decided since the last visit, or null before a first visit. */
export type TeaserCounts = { waiting: WaitingCount; kudosSinceLastVisit: number | null };

export async function teaserOf(ctx: QueryContext, member: MemberId): Promise<string | null> {
  if (!(await teasersShownTo(ctx, member)) || !(await hiddenItemsShownTo(ctx, member))) return null;
  return teaserLine({ waiting: await waitingCountOf(ctx, member), kudosSinceLastVisit: await kudosSinceLastVisitOf(ctx, member) });
}

/** The teaser's line: each count that isn't zero, items first, joined by a dot; null when neither is. */
export function teaserLine({ waiting, kudosSinceLastVisit }: TeaserCounts): string | null {
  const kudos = kudosSinceLastVisit !== null && kudosSinceLastVisit > mostKudosCounted ? (`${mostKudosCounted}+` as const) : kudosSinceLastVisit;
  const counts = [itemsWaitOf(waiting), kudosCameInOf(kudos)].filter((count) => count !== null);
  return counts.length === 0 ? null : counts.join(" · ");
}

async function kudosSinceLastVisitOf(ctx: QueryContext, member: MemberId): Promise<number | null> {
  const lastVisit = await lastVisitOf(ctx, member);
  if (lastVisit === null) return null;
  return kudosDecidedAfter(ctx, member, lastVisit, mostKudosCounted + 1);
}

function itemsWaitOf(waiting: WaitingCount) {
  if (waiting === 0) return null;
  return waiting === 1 ? "1 item waits" : `${waiting} items wait`;
}

function kudosCameInOf(kudos: KudosCount | null) {
  return kudos === null || kudos === 0 ? null : `${kudos} kudos came in since your last visit`;
}
